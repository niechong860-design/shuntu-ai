#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(
  fileURLToPath(new URL("../../src/lib/d1-business-database.ts", import.meta.url)),
);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const helperModule = {
  boolFromD1: (value) => Boolean(value),
  boolToD1: (value) => Number(Boolean(value)),
  centiCreditToCredits: (value) => Number(value) / 100,
  creditsToCentiCredit: (value) => Math.round(Number(value) * 100),
  fenToYuan: (value) => Number(value) / 100,
  jsonFromD1: (value) => value,
  jsonToD1: (value) => JSON.stringify(value),
  nowIso: () => "2026-10-23T00:00:00.000Z",
  randomId: () => "synthetic-id",
  yuanToFen: (value) => Math.round(Number(value) * 100),
};
const outboxEvents = [];
const outboxModule = {
  buildReplicationOutboxStatement(db, event) {
    outboxEvents.push(event);
    return db
      .prepare("INSERT INTO replication_outbox (idempotency_key) VALUES (?)")
      .bind(event.idempotencyKey);
  },
};
const module = { exports: {} };
const sandbox = {
  module,
  exports: module.exports,
  require(specifier) {
    if (specifier === "@/lib/business-database") return helperModule;
    if (specifier === "@/lib/d1-replication-outbox") return outboxModule;
    throw new Error(`Unexpected dependency in D1 adapter test: ${specifier}`);
  },
  console,
  Date,
  Math,
};
vm.runInNewContext(compiled, sandbox, { filename: "d1-business-database.cjs" });

const statement = {
  sql: "UPDATE profiles SET credits = credits WHERE id = ?",
  values: ["synthetic-user"],
};
const prepareCalls = [];
const batchCalls = [];
const binding = {
  prepare(sql) {
    prepareCalls.push(sql);
    return {
      bind(...values) {
        return { sql, values };
      },
    };
  },
  async batch(statements) {
    batchCalls.push(statements);
    return [{ success: true, meta: { changes: 1 } }];
  },
};
const adapter = Object.create(module.exports.D1BusinessDatabase.prototype);
adapter.db = binding;
const returned = await adapter.batchWithOutbox(
  [statement],
  [
    {
      eventType: "profiles.upsert",
      entityType: "profiles",
      entityId: "synthetic-user",
      payload: { row: { id: "synthetic-user" } },
      idempotencyKey: "profiles:synthetic-user:test",
    },
  ],
);

assert.equal(returned[0].success, true);
assert.equal(batchCalls.length, 1);
assert.equal(batchCalls[0].length, 2);
assert.equal(batchCalls[0][0], statement);
assert.match(batchCalls[0][1].sql, /replication_outbox/i);
assert.equal(outboxEvents.length, 1);
assert.equal(
  prepareCalls.some((sql) => /replication_outbox/i.test(sql)),
  true,
);
assert.match(source, /private\s+async\s+batchWithOutbox\s*\([\s\S]*?this\.db\.batch\(\[/);

console.log(
  JSON.stringify(
    {
      ok: true,
      adapterBatchKeepsBusinessAndOutboxStatementsAtomic: true,
      outboxInsertPreparedByAdapter: true,
      outboxSchemaPreserved: fs
        .readFileSync(new URL("../migrations/0002_replication_outbox.sql", import.meta.url), "utf8")
        .includes("CREATE TABLE IF NOT EXISTS replication_outbox"),
    },
    null,
    2,
  ),
);
