#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outboxMigrationPath = path.join(repoRoot, "d1", "migrations", "0002_replication_outbox.sql");

const db = new DatabaseSync(":memory:");
const lovableSink = new Map();
const lovableIdempotencyKeys = new Set();

main();

function main() {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE profiles (id TEXT PRIMARY KEY, credits INTEGER NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("INSERT INTO profiles (id, credits, updated_at) VALUES ('user-1', 10000, '2026-09-11T00:00:00.000Z')");
  db.exec(fs.readFileSync(outboxMigrationPath, "utf8"));

  assert.equal(resolveDatabasePrimary({}), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "" }), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "d1" }), "d1");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "lovable" }), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "dual" }), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "D1" }), "lovable");

  const d1Write = consumeCreditsWithOutbox({
    userId: "user-1",
    amount: 1800,
    operationId: "generation-task-1",
    now: "2026-09-11T00:00:10.000Z",
  });
  assert.equal(d1Write.creditsAfter, 8200);
  assert.equal(countOutboxByStatus("pending"), 1);

  const failedReplication = processPendingOutbox({ fail: true, now: "2026-09-11T00:00:11.000Z" });
  assert.equal(failedReplication.synced, 0);
  assert.equal(failedReplication.failed, 1);
  assert.equal(readProfileCredits("user-1"), 8200);
  assert.equal(countOutboxByStatus("pending"), 1);

  const successfulReplication = processPendingOutbox({ fail: false, now: "2026-09-11T00:00:12.000Z" });
  assert.equal(successfulReplication.synced, 1);
  assert.equal(successfulReplication.failed, 0);
  assert.equal(countOutboxByStatus("synced"), 1);
  assert.equal(lovableSink.get("profiles:user-1")?.credits, 8200);

  const duplicateFlush = processPendingOutbox({ fail: false, now: "2026-09-11T00:00:13.000Z" });
  assert.equal(duplicateFlush.synced, 0);
  assert.equal(lovableIdempotencyKeys.size, 1);

  const rollbackReady = buildRollbackReadiness();
  assert.equal(rollbackReady.pendingReplication, 0);
  assert.equal(rollbackReady.canSwitchToLovableWithoutKnownUnsyncedOutbox, true);

  consumeCreditsWithOutbox({
    userId: "user-1",
    amount: 200,
    operationId: "generation-task-2",
    now: "2026-09-11T00:00:20.000Z",
  });
  const rollbackBlocked = buildRollbackReadiness();
  assert.equal(rollbackBlocked.pendingReplication, 1);
  assert.equal(rollbackBlocked.canSwitchToLovableWithoutKnownUnsyncedOutbox, false);

  assertSafeReplicationPayload({ row: { id: "user-1", credits: 8000 } });
  assert.throws(() => assertSafeReplicationPayload({ api_key: "do-not-store" }), /forbidden/i);
  assert.throws(() => assertSafeReplicationPayload({ auth: "Bearer abc.def.ghi" }), /credential/i);

  console.log(JSON.stringify({
    ok: true,
    databasePrimaryDefault: resolveDatabasePrimary({}),
    d1CreditsAfterWrite: readProfileCredits("user-1"),
    firstReplicationFailureLeftPending: failedReplication.failed === 1,
    successfulReplicationMarkedSynced: successfulReplication.synced === 1,
    duplicateReplayPrevented: lovableIdempotencyKeys.size === 1,
    rollbackBlockedWhenPendingOutboxExists: rollbackBlocked.pendingReplication === 1,
  }, null, 2));
}

function resolveDatabasePrimary(env) {
  const value = env.DATABASE_PRIMARY;
  if (typeof value !== "string" || value.trim() === "") return "lovable";
  const normalized = value.trim();
  if (normalized === "lovable" || normalized === "d1") return normalized;
  return "lovable";
}

function consumeCreditsWithOutbox({ userId, amount, operationId, now }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const update = db.prepare("UPDATE profiles SET credits = credits - ?, updated_at = ? WHERE id = ? AND credits >= ?")
      .run(amount, now, userId, amount);
    if (update.changes !== 1) throw new Error("INSUFFICIENT_CREDITS_OR_PROFILE_MISSING");
    const profile = db.prepare("SELECT id, credits, updated_at FROM profiles WHERE id = ?").get(userId);
    insertOutbox({
      id: `outbox-${operationId}`,
      event_type: "profiles.upsert",
      entity_type: "profiles",
      entity_id: userId,
      payload: { row: profile },
      idempotency_key: `profiles:${userId}:${operationId}`,
      created_at: now,
    });
    db.exec("COMMIT");
    return { creditsAfter: profile.credits };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertOutbox(event) {
  assertSafeReplicationPayload(event.payload);
  const payload = JSON.stringify(event.payload);
  db.prepare(`
    INSERT INTO replication_outbox (
      id, event_type, entity_type, entity_id, payload, idempotency_key, status, attempt_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).run(event.id, event.event_type, event.entity_type, event.entity_id, payload, event.idempotency_key, event.created_at);
}

function processPendingOutbox({ fail, now }) {
  const rows = db.prepare(`
    SELECT * FROM replication_outbox
    WHERE status IN ('pending', 'failed')
    ORDER BY created_at, id
    LIMIT 10
  `).all();
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    db.prepare("UPDATE replication_outbox SET status = 'processing' WHERE id = ? AND status IN ('pending', 'failed')").run(row.id);
    if (fail) {
      db.prepare("UPDATE replication_outbox SET status = 'pending', attempt_count = attempt_count + 1, last_error = ? WHERE id = ?")
        .run("SIMULATED_LOVABLE_UNAVAILABLE", row.id);
      failed += 1;
      continue;
    }

    if (!lovableIdempotencyKeys.has(row.idempotency_key)) {
      const payload = JSON.parse(row.payload);
      if (row.event_type.endsWith(".upsert")) {
        lovableSink.set(`${row.entity_type}:${row.entity_id}`, payload.row);
      }
      if (row.event_type.endsWith(".delete")) {
        lovableSink.set(`${row.entity_type}:${row.entity_id}:tombstone`, payload.row);
      }
      lovableIdempotencyKeys.add(row.idempotency_key);
    }

    db.prepare("UPDATE replication_outbox SET status = 'synced', synced_at = ?, last_error = NULL WHERE id = ?")
      .run(now, row.id);
    synced += 1;
  }

  return { synced, failed };
}

function countOutboxByStatus(status) {
  return db.prepare("SELECT COUNT(*) AS count FROM replication_outbox WHERE status = ?").get(status).count;
}

function readProfileCredits(userId) {
  return db.prepare("SELECT credits FROM profiles WHERE id = ?").get(userId).credits;
}

function buildRollbackReadiness() {
  const row = db.prepare(`
    SELECT COUNT(*) AS pendingReplication, MIN(created_at) AS oldestPendingAt
    FROM replication_outbox
    WHERE status IN ('pending', 'processing', 'failed')
  `).get();
  return {
    pendingReplication: row.pendingReplication,
    oldestPendingAt: row.oldestPendingAt,
    canSwitchToLovableWithoutKnownUnsyncedOutbox: row.pendingReplication === 0,
  };
}

function assertSafeReplicationPayload(value, keyPath = "payload") {
  const keyPattern = /api[_-]?key|secret|token|jwt|authorization|service[_-]?role|provider[_-]?secret|private[_-]?key/i;
  const credentialValuePattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]{20,}/i;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeReplicationPayload(item, `${keyPath}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (keyPattern.test(key)) throw new Error(`forbidden secret-like key at ${keyPath}.${key}`);
      assertSafeReplicationPayload(child, `${keyPath}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && credentialValuePattern.test(value)) {
    throw new Error(`credential-like value at ${keyPath}`);
  }
}
