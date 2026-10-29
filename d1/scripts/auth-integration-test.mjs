#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import { authenticateBearer, login, logout, refreshSession } from "../../src/lib/d1-bearer-auth.ts";

const native = new DatabaseSync(":memory:");
native.exec(fs.readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
native.exec(fs.readFileSync(new URL("../migrations/0004_d1_auth.sql", import.meta.url), "utf8"));

const db = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) {
        args = values;
        return this;
      },
      async first() {
        return native.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: native.prepare(sql).all(...args) };
      },
      async run() {
        return native.prepare(sql).run(...args);
      },
      _run() {
        return native.prepare(sql).run(...args);
      },
    };
  },
  async batch(statements) {
    native.exec("BEGIN");
    try {
      const result = statements.map((statement) => statement._run());
      native.exec("COMMIT");
      return result;
    } catch (error) {
      native.exec("ROLLBACK");
      throw error;
    }
  },
};

globalThis.__SHUNTU_CLOUDFLARE_ENV__ = {
  DB: db,
  DATABASE_PRIMARY: "d1",
  AUTH_SESSION_SIGNING_KEY: "synthetic-auth-signing-key-32-bytes-minimum",
};

const userId = "11111111-1111-4111-8111-111111111111";
const email = "legacy-bcrypt@example.invalid";
const password = "Legacy-Password-42!";
native.prepare("INSERT INTO profiles(id,email) VALUES(?,?)").run(userId, email);
native
  .prepare("INSERT INTO auth_credentials(user_id,password_hash) VALUES(?,?)")
  .run(userId, hashSync(password, 10));
native
  .prepare("INSERT INTO auth_identities(id,user_id,provider,provider_user_id) VALUES(?,?,?,?)")
  .run(`legacy-email:${userId}`, userId, "legacy_email", email);

await assert.rejects(
  login(email, "Wrong-Synthetic-Password-42!", "legacy-wrong-ip"),
  /INVALID_CREDENTIALS/,
);
const session = await login(email, password, "legacy-right-ip");
assert.equal(session.user.id, userId);
assert.match(
  native.prepare("SELECT password_hash FROM auth_credentials WHERE user_id=?").get(userId)
    .password_hash,
  /^pbkdf2-sha256\$/,
);
const request = (token) =>
  new Request("https://example.test/api/me", { headers: { Authorization: `Bearer ${token}` } });
assert.equal((await authenticateBearer(request(session.access_token))).userId, userId);
const refreshed = await refreshSession(session.refresh_token);
assert.equal((await authenticateBearer(request(refreshed.access_token))).userId, userId);
await logout(request(refreshed.access_token), "local");
await assert.rejects(authenticateBearer(request(refreshed.access_token)), /INVALID_CREDENTIALS/);
console.log("D1 bearer auth integration checks passed");
