#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const migrationsDir = path.join(repoRoot, "d1", "migrations");

const db = new DatabaseSync(":memory:");
const fakeLovableRows = new Map();
const fakeLovableIdempotency = new Set();

main();

function main() {
  applySchema();
  seed();

  assert.equal(resolveDatabasePrimary({}), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "lovable" }), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "d1" }), "d1");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "dl" }), "lovable");
  assert.equal(resolveDatabasePrimary({ DATABASE_PRIMARY: "D1" }), "lovable");

  assert.equal(toScaled("0.2", 2), 20);
  assert.equal(fromScaled(20), 0.2);
  assert.equal(toScaled("18", 2), 1800);
  assert.equal(fromScaled(1800), 18);
  assert.equal(toScaled("9.9", 2), 990);
  assert.equal(fromScaled(990), 9.9);

  const beforeSuccessOutbox = countOutbox();
  const consumeOk = consumeCredits({ userId: "user-rich", modelKey: "model-18", prompt: "ok", historyId: "hist-consume-ok", ledgerId: "ledger-consume-ok", now: "2026-09-11T01:00:00.000Z" });
  assert.deepEqual(consumeOk, { success: true, message: "charged", credits: 32, cost: 18, history_id: "hist-consume-ok" });
  assert.equal(readProfileCenti("user-rich"), 3200);
  assert.equal(countRows("generation_history", "id = 'hist-consume-ok'"), 1);
  assert.equal(countRows("credit_usage_logs", "id = 'ledger-consume-ok'"), 1);
  assert.equal(countOutbox(), beforeSuccessOutbox + 3);

  const historyBeforeInsufficient = countRows("generation_history");
  const ledgerBeforeInsufficient = countRows("credit_usage_logs");
  const consumeFail = consumeCredits({ userId: "user-poor", modelKey: "model-18", prompt: "no", now: "2026-09-11T01:01:00.000Z" });
  assert.equal(consumeFail.success, false);
  assert.equal(readProfileCenti("user-poor"), 100);
  assert.equal(countRows("generation_history"), historyBeforeInsufficient);
  assert.equal(countRows("credit_usage_logs"), ledgerBeforeInsufficient);

  createTask({ id: "task-finalize", requestId: "req-finalize", userId: "user-rich", status: "running", creditsRequired: 1800, now: "2026-09-11T01:02:00.000Z" });
  const creditsBeforeFinalize = readProfileCenti("user-rich");
  const firstFinalize = finalizeTaskOnce({ taskId: "task-finalize", userId: "user-rich", imageUrl: "https://img.shuntu.cc/generated/test.png", historyId: "hist-finalize", ledgerId: "ledger-finalize", now: "2026-09-11T01:03:00.000Z" });
  assert.equal(firstFinalize.success, true);
  assert.equal(firstFinalize.history_id, "hist-finalize");
  assert.equal(readProfileCenti("user-rich"), creditsBeforeFinalize - 1800);
  const secondFinalize = finalizeTaskOnce({ taskId: "task-finalize", userId: "user-rich", imageUrl: "https://img.shuntu.cc/generated/test.png", now: "2026-09-11T01:04:00.000Z" });
  assert.equal(secondFinalize.success, true);
  assert.equal(secondFinalize.message, "already finalized");
  assert.equal(readProfileCenti("user-rich"), creditsBeforeFinalize - 1800);
  assert.equal(countRows("generation_history", "generation_task_id = 'task-finalize'"), 1);
  assert.equal(countRows("credit_usage_logs", "idempotency_key = 'task:task-finalize'"), 1);

  createOrder({ id: "order-1", userId: "user-rich", outTradeNo: "ORDER1", amountFen: 990, creditsCenti: 100000, now: "2026-09-11T01:05:00.000Z" });
  const creditsBeforeOrder = readProfileCenti("user-rich");
  const firstOrder = completePaidOrder({ outTradeNo: "ORDER1", tradeNo: "TRADE1", now: "2026-09-11T01:06:00.000Z" });
  assert.equal(firstOrder.success, true);
  assert.equal(readProfileCenti("user-rich"), creditsBeforeOrder + 100000);
  const secondOrder = completePaidOrder({ outTradeNo: "ORDER1", tradeNo: "TRADE1", now: "2026-09-11T01:07:00.000Z" });
  assert.equal(secondOrder.alreadyPaid, true);
  assert.equal(readProfileCenti("user-rich"), creditsBeforeOrder + 100000);
  assert.equal(countRows("credit_usage_logs", "idempotency_key = 'payment:ORDER1'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'user_orders:ORDER1:paid'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'profiles:user-rich:order:ORDER1'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'credit_usage_logs:payment:ORDER1'"), 1);

  const creditsBeforeCoupon = readProfileCenti("user-rich");
  const firstRedeem = redeemCoupon({ userId: "user-rich", code: "CARD25", email: "rich@example.com", redeemLogId: "redeem-1", now: "2026-09-11T01:08:00.000Z" });
  assert.equal(firstRedeem.success, true);
  assert.equal(readProfileCenti("user-rich"), creditsBeforeCoupon + 2500);
  const secondRedeem = redeemCoupon({ userId: "user-rich", code: "CARD25", email: "rich@example.com", now: "2026-09-11T01:09:00.000Z" });
  assert.equal(secondRedeem.success, false);
  assert.equal(readProfileCenti("user-rich"), creditsBeforeCoupon + 2500);
  assert.equal(countRows("redeem_logs", "code = 'CARD25' AND success = 1"), 1);
  assert.equal(countRows("credit_usage_logs", "idempotency_key = 'coupon:CARD25'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'coupons:CARD25:redeem'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'profiles:user-rich:coupon:CARD25'"), 1);
  assert.equal(countRows("replication_outbox", "idempotency_key = 'credit_usage_logs:coupon:CARD25'"), 1);

  createOrder({ id: "order-rollback", userId: "user-rich", outTradeNo: "ORDER-ROLLBACK", amountFen: 990, creditsCenti: 1000, now: "2026-09-11T01:09:30.000Z" });
  const paymentRollbackCredits = readProfileCenti("user-rich");
  assert.throws(() => completePaidOrder({ outTradeNo: "ORDER-ROLLBACK", tradeNo: "TRADE-ROLLBACK", now: "2026-09-11T01:09:31.000Z", failOutbox: true }), /CHECK constraint failed|constraint/i);
  assert.equal(readProfileCenti("user-rich"), paymentRollbackCredits);
  assert.equal(countRows("user_orders", "out_trade_no = 'ORDER-ROLLBACK' AND status = 'paid'"), 0);
  assert.equal(countRows("credit_usage_logs", "idempotency_key = 'payment:ORDER-ROLLBACK'"), 0);

  db.prepare("INSERT INTO coupons (id, code, amount, is_used, created_at, created_by) VALUES ('coupon-rollback', 'CARD-ROLLBACK', 1000, 0, '2026-09-11T00:00:00.000Z', 'admin')").run();
  const couponRollbackCredits = readProfileCenti("user-rich");
  assert.throws(() => redeemCoupon({ userId: "user-rich", code: "CARD-ROLLBACK", email: "rich@example.com", redeemLogId: "redeem-rollback", now: "2026-09-11T01:09:32.000Z", failOutbox: true }), /CHECK constraint failed|constraint/i);
  assert.equal(readProfileCenti("user-rich"), couponRollbackCredits);
  assert.equal(countRows("coupons", "code = 'CARD-ROLLBACK' AND is_used = 1"), 0);
  assert.equal(countRows("credit_usage_logs", "idempotency_key = 'coupon:CARD-ROLLBACK'"), 0);

  const rollbackCreditBefore = readProfileCenti("user-rich");
  assert.throws(() => consumeCredits({ userId: "user-rich", modelKey: "model-18", prompt: "rollback", historyId: "hist-rollback", ledgerId: "ledger-rollback", now: "2026-09-11T01:10:00.000Z", failOutbox: true }), /CHECK constraint failed|constraint/i);
  assert.equal(readProfileCenti("user-rich"), rollbackCreditBefore);
  assert.equal(countRows("generation_history", "id = 'hist-rollback'"), 0);
  assert.equal(countRows("credit_usage_logs", "id = 'ledger-rollback'"), 0);

  const pendingBeforeReplication = countOutboxByStatus("pending");
  const failResult = processOutbox({ fail: true, now: "2026-09-11T01:11:00.000Z" });
  assert.equal(failResult.synced, 0);
  assert.equal(failResult.failed, pendingBeforeReplication);
  assert.equal(countOutboxByStatus("pending"), pendingBeforeReplication);
  assert.equal(readProfileCenti("user-rich"), rollbackCreditBefore);

  const replayOnce = processOutbox({ fail: false, now: "2026-09-11T01:12:00.000Z" });
  assert.equal(replayOnce.synced, pendingBeforeReplication);
  const appliedKeysAfterFirstReplay = fakeLovableIdempotency.size;
  const replayTwice = processOutbox({ fail: false, now: "2026-09-11T01:13:00.000Z" });
  assert.equal(replayTwice.synced, 0);
  assert.equal(fakeLovableIdempotency.size, appliedKeysAfterFirstReplay);
  assert.equal(countOutboxByStatus("pending"), 0);

  console.log(JSON.stringify({
    ok: true,
    tests: {
      sufficientBalanceDebit: "PASS",
      insufficientBalanceRollback: "PASS",
      finalizeTwiceIdempotent: "PASS",
      paymentCallbackTwiceIdempotent: "PASS",
      paymentOutboxFailureRollsBack: "PASS",
      couponRedeemTwiceIdempotent: "PASS",
      couponOutboxFailureRollsBack: "PASS",
      d1MutationWithOutbox: "PASS",
      forcedOutboxFailureRollsBackBusinessMutation: "PASS",
      replicationTargetFailureLeavesOutboxPending: "PASS",
      replicationReplayIdempotent: "PASS",
      databasePrimaryDefaultLovable: "PASS",
      unitConversion: "PASS",
    },
    final: {
      pendingOutbox: countOutboxByStatus("pending"),
      syncedOutbox: countOutboxByStatus("synced"),
      fakeLovableRows: fakeLovableRows.size,
    },
  }, null, 2));
}

function applySchema() {
  for (const name of fs.readdirSync(migrationsDir).filter((file) => /^\d+_.*\.sql$/.test(file)).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, name), "utf8"));
  }
}

function seed() {
  db.exec(`
    INSERT INTO profiles (id, email, display_name, credits, created_at, updated_at)
    VALUES
      ('user-rich', 'rich@example.com', 'Rich', 5000, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z'),
      ('user-poor', 'poor@example.com', 'Poor', 100, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z');

    INSERT INTO models_config (id, model_key, name, description, cost, sort_order, api_url, api_key, request_format, prompt_key, fetch_url, extra_params, is_enabled, created_at, updated_at)
    VALUES ('model-row-1', 'model-18', 'Model 18', NULL, 1800, 1, NULL, NULL, 'async_id', 'prompt', NULL, '{}', 1, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z');

    INSERT INTO coupons (id, code, amount, is_used, created_at, created_by)
    VALUES ('coupon-1', 'CARD25', 2500, 0, '2026-09-11T00:00:00.000Z', 'admin');
  `);
}

function consumeCredits(input) {
  const model = db.prepare("SELECT * FROM models_config WHERE model_key = ? AND is_enabled = 1").get(input.modelKey);
  if (!model) return { success: false, message: "model not found or disabled", credits: 0, cost: 0, history_id: null };
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(input.userId);
  if (!profile || profile.credits < model.cost) return { success: false, message: "insufficient credits", credits: profile ? fromScaled(profile.credits) : 0, cost: fromScaled(model.cost), history_id: null };
  const creditsAfter = profile.credits - model.cost;
  const history = { id: input.historyId, user_id: input.userId, model: model.name, cost: model.cost, prompt: input.prompt ?? "", image_url: null, created_at: input.now, generation_task_id: input.generationTaskId ?? null };
  const ledger = { id: input.ledgerId, user_id: input.userId, amount: model.cost, source: input.generationTaskId ? "generation_task" : "legacy_generation", model_key: input.modelKey, model_name: model.name, generation_history_id: input.historyId, generation_task_id: input.generationTaskId ?? null, idempotency_key: input.idempotencyKey ?? `history:${input.historyId}`, created_at: input.now, metadata: JSON.stringify({ prompt: input.prompt ?? "" }) };
  transaction(() => {
    db.prepare("UPDATE profiles SET credits = ?, updated_at = ? WHERE id = ? AND credits >= ?").run(creditsAfter, input.now, input.userId, model.cost);
    db.prepare("INSERT INTO generation_history (id, user_id, model, cost, prompt, image_url, created_at, generation_task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(history.id, history.user_id, history.model, history.cost, history.prompt, history.image_url, history.created_at, history.generation_task_id);
    db.prepare("INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(ledger.id, ledger.user_id, ledger.amount, ledger.source, ledger.model_key, ledger.model_name, ledger.generation_history_id, ledger.generation_task_id, ledger.idempotency_key, ledger.created_at, ledger.metadata);
    insertOutbox({ eventType: input.failOutbox ? "bad.event" : "profiles.upsert", entityType: "profiles", entityId: input.userId, payload: { row: { ...profile, credits: creditsAfter, updated_at: input.now } }, key: `profiles:${input.userId}:${ledger.id}`, now: input.now });
    insertOutbox({ eventType: "generation_history.upsert", entityType: "generation_history", entityId: history.id, payload: { row: history }, key: `generation_history:${history.id}`, now: input.now });
    insertOutbox({ eventType: "credit_usage_logs.upsert", entityType: "credit_usage_logs", entityId: ledger.id, payload: { row: ledger }, key: `credit_usage_logs:${ledger.id}`, now: input.now });
  });
  return { success: true, message: "charged", credits: fromScaled(creditsAfter), cost: fromScaled(model.cost), history_id: input.historyId };
}

function createTask(input) {
  db.prepare(`
    INSERT INTO generation_tasks (id, request_id, user_id, status, model_id, prompt, input_params, credits_required, deduction_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'model-18', 'prompt', '{}', ?, 'not_charged', ?, ?)
  `).run(input.id, input.requestId, input.userId, input.status, input.creditsRequired, input.now, input.now);
}

function finalizeTaskOnce(input) {
  const task = db.prepare("SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?").get(input.taskId, input.userId);
  if (!task) return { success: false, message: "task not found or not owned by current user", history_id: null };
  const existing = db.prepare("SELECT * FROM generation_history WHERE generation_task_id = ?").get(input.taskId);
  if (task.deduction_status === "charged") return { success: true, message: "already finalized", history_id: existing?.id ?? task.deduction_id };
  if (task.status !== "running" && task.status !== "succeeded") return { success: false, message: "task status is not finalizable", history_id: null };
  const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(input.userId);
  if (!profile || profile.credits < task.credits_required) return { success: false, message: "insufficient credits", history_id: null };
  const model = db.prepare("SELECT * FROM models_config WHERE model_key = ? AND is_enabled = 1").get(task.model_id);
  const creditsAfter = profile.credits - model.cost;
  const history = { id: input.historyId, user_id: input.userId, model: model.name, cost: model.cost, prompt: task.prompt, image_url: input.imageUrl, created_at: input.now, generation_task_id: input.taskId };
  const ledger = { id: input.ledgerId, user_id: input.userId, amount: model.cost, source: "generation_task", model_key: task.model_id, model_name: model.name, generation_history_id: input.historyId, generation_task_id: input.taskId, idempotency_key: `task:${input.taskId}`, created_at: input.now, metadata: JSON.stringify({ prompt: task.prompt ?? "" }) };
  transaction(() => {
    db.prepare("UPDATE profiles SET credits = ?, updated_at = ? WHERE id = ? AND credits >= ?").run(creditsAfter, input.now, input.userId, model.cost);
    db.prepare("INSERT INTO generation_history (id, user_id, model, cost, prompt, image_url, created_at, generation_task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(history.id, history.user_id, history.model, history.cost, history.prompt, history.image_url, history.created_at, history.generation_task_id);
    db.prepare("INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(ledger.id, ledger.user_id, ledger.amount, ledger.source, ledger.model_key, ledger.model_name, ledger.generation_history_id, ledger.generation_task_id, ledger.idempotency_key, ledger.created_at, ledger.metadata);
    db.prepare("UPDATE generation_tasks SET status = 'succeeded', deduction_status = 'charged', deduction_id = ?, charged_at = ?, result_image_url = ?, completed_at = ?, updated_at = ? WHERE id = ? AND deduction_status = 'not_charged'").run(input.historyId, input.now, input.imageUrl, input.now, input.now, input.taskId);
    insertOutbox({ eventType: "profiles.upsert", entityType: "profiles", entityId: input.userId, payload: { row: { ...profile, credits: creditsAfter, updated_at: input.now } }, key: `profiles:${input.userId}:finalize:${input.taskId}`, now: input.now });
    insertOutbox({ eventType: "generation_history.upsert", entityType: "generation_history", entityId: history.id, payload: { row: history }, key: `generation_history:${history.id}`, now: input.now });
    insertOutbox({ eventType: "credit_usage_logs.upsert", entityType: "credit_usage_logs", entityId: ledger.id, payload: { row: ledger }, key: `credit_usage_logs:${ledger.id}`, now: input.now });
    insertOutbox({ eventType: "generation_tasks.upsert", entityType: "generation_tasks", entityId: input.taskId, payload: { row: { ...task, status: "succeeded", deduction_status: "charged", deduction_id: input.historyId, result_image_url: input.imageUrl, updated_at: input.now } }, key: `generation_tasks:${input.taskId}:finalize`, now: input.now });
  });
  return { success: true, message: "finalized", history_id: input.historyId };
}

function createOrder(input) {
  db.prepare("INSERT INTO user_orders (id, user_id, out_trade_no, amount, credits, status, pay_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 'wechat', ?, ?)")
    .run(input.id, input.userId, input.outTradeNo, input.amountFen, input.creditsCenti, input.now, input.now);
}

function completePaidOrder(input) {
  const order = db.prepare("SELECT * FROM user_orders WHERE out_trade_no = ?").get(input.outTradeNo);
  if (!order) return { success: false, alreadyPaid: false };
  if (order.status === "paid") return { success: true, alreadyPaid: true };
  let paid = false;
  transaction(() => {
    const claim = db.prepare("UPDATE user_orders SET status = 'paid', trade_no = ?, paid_at = ?, updated_at = ? WHERE out_trade_no = ? AND status = 'pending'").run(input.tradeNo, input.now, input.now, input.outTradeNo);
    if (claim.changes !== 1) return;
    paid = true;
    db.prepare("UPDATE profiles SET credits = credits + ?, updated_at = ? WHERE id = ?").run(order.credits, input.now, order.user_id);
    const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(order.user_id);
    const ledger = { id: `payment:${input.outTradeNo}`, user_id: order.user_id, amount: order.credits, source: "payment", model_key: null, model_name: null, generation_history_id: null, generation_task_id: null, idempotency_key: `payment:${input.outTradeNo}`, created_at: input.now, metadata: JSON.stringify({ direction: "credit", reason: "payment", out_trade_no: input.outTradeNo, order_id: order.id }) };
    db.prepare("INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(ledger.id, ledger.user_id, ledger.amount, ledger.source, ledger.model_key, ledger.model_name, ledger.generation_history_id, ledger.generation_task_id, ledger.idempotency_key, ledger.created_at, ledger.metadata);
    insertOutbox({ eventType: input.failOutbox ? "bad.event" : "user_orders.upsert", entityType: "user_orders", entityId: order.id, payload: { row: { ...order, status: "paid", trade_no: input.tradeNo, paid_at: input.now, updated_at: input.now } }, key: `user_orders:${order.out_trade_no}:paid`, now: input.now });
    insertOutbox({ eventType: "profiles.upsert", entityType: "profiles", entityId: order.user_id, payload: { row: profile }, key: `profiles:${order.user_id}:order:${order.out_trade_no}`, now: input.now });
    insertOutbox({ eventType: "credit_usage_logs.upsert", entityType: "credit_usage_logs", entityId: ledger.id, payload: { row: ledger }, key: `credit_usage_logs:${ledger.id}`, now: input.now });
  });
  return { success: true, alreadyPaid: !paid };
}

function redeemCoupon(input) {
  const coupon = db.prepare("SELECT * FROM coupons WHERE code = ?").get(input.code);
  if (!coupon || coupon.is_used) return { success: false };
  const redeem = { id: input.redeemLogId, user_id: input.userId, code: input.code, amount: coupon.amount, success: 1, error_message: null, redeemed_at: input.now };
  let redeemed = false;
  transaction(() => {
    const claim = db.prepare("UPDATE coupons SET is_used = 1, used_by = ?, used_by_email = ?, used_at = ? WHERE code = ? AND is_used = 0").run(input.userId, input.email, input.now, input.code);
    if (claim.changes !== 1) return;
    redeemed = true;
    db.prepare("UPDATE profiles SET credits = credits + ?, updated_at = ? WHERE id = ?").run(coupon.amount, input.now, input.userId);
    const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(input.userId);
    const ledger = { id: `coupon:${input.code}`, user_id: input.userId, amount: coupon.amount, source: "coupon_redeem", model_key: null, model_name: null, generation_history_id: null, generation_task_id: null, idempotency_key: `coupon:${input.code}`, created_at: input.now, metadata: JSON.stringify({ direction: "credit", reason: "coupon_redeem", coupon_code: input.code, redeem_log_id: redeem.id }) };
    db.prepare("INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(ledger.id, ledger.user_id, ledger.amount, ledger.source, ledger.model_key, ledger.model_name, ledger.generation_history_id, ledger.generation_task_id, ledger.idempotency_key, ledger.created_at, ledger.metadata);
    db.prepare("INSERT INTO redeem_logs (id, user_id, code, amount, success, error_message, redeemed_at) VALUES (?, ?, ?, ?, 1, NULL, ?)").run(redeem.id, redeem.user_id, redeem.code, redeem.amount, redeem.redeemed_at);
    insertOutbox({ eventType: input.failOutbox ? "bad.event" : "coupons.upsert", entityType: "coupons", entityId: coupon.id, payload: { row: { ...coupon, is_used: 1, used_by: input.userId, used_by_email: input.email, used_at: input.now } }, key: `coupons:${input.code}:redeem`, now: input.now });
    insertOutbox({ eventType: "profiles.upsert", entityType: "profiles", entityId: input.userId, payload: { row: profile }, key: `profiles:${input.userId}:coupon:${input.code}`, now: input.now });
    insertOutbox({ eventType: "credit_usage_logs.upsert", entityType: "credit_usage_logs", entityId: ledger.id, payload: { row: ledger }, key: `credit_usage_logs:${ledger.id}`, now: input.now });
    insertOutbox({ eventType: "redeem_logs.upsert", entityType: "redeem_logs", entityId: redeem.id, payload: { row: redeem }, key: `redeem_logs:${redeem.id}`, now: input.now });
  });
  return { success: redeemed };
}

function insertOutbox(input) {
  db.prepare(`
    INSERT INTO replication_outbox (id, event_type, entity_type, entity_id, payload, idempotency_key, status, attempt_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)
  `).run(`outbox-${input.key}`, input.eventType, input.entityType, input.entityId, JSON.stringify(input.payload), input.key, input.now);
}

function processOutbox({ fail, now }) {
  const rows = db.prepare("SELECT * FROM replication_outbox WHERE status = 'pending' ORDER BY created_at, id").all();
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    db.prepare("UPDATE replication_outbox SET status = 'processing', locked_at = ? WHERE id = ? AND status = 'pending'").run(now, row.id);
    if (fail) {
      db.prepare("UPDATE replication_outbox SET status = 'pending', attempt_count = attempt_count + 1, last_error = ?, locked_at = NULL, next_attempt_at = ? WHERE id = ?")
        .run("SIMULATED_TARGET_FAILURE", new Date(new Date(now).getTime() + 1000).toISOString(), row.id);
      failed += 1;
      continue;
    }
    if (!fakeLovableIdempotency.has(row.idempotency_key)) {
      const payload = JSON.parse(row.payload);
      fakeLovableRows.set(`${row.entity_type}:${row.entity_id}`, payload.row);
      fakeLovableIdempotency.add(row.idempotency_key);
    }
    db.prepare("UPDATE replication_outbox SET status = 'synced', synced_at = ?, locked_at = NULL, last_error = NULL WHERE id = ?").run(now, row.id);
    synced += 1;
  }
  return { synced, failed };
}

function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function resolveDatabasePrimary(env) {
  const value = env.DATABASE_PRIMARY;
  if (typeof value !== "string" || value.trim() === "") return "lovable";
  const normalized = value.trim();
  if (normalized === "lovable" || normalized === "d1") return normalized;
  return "lovable";
}

function toScaled(value, scale) {
  const text = String(value);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > scale) throw new Error("too many decimal places");
  return Number(`${whole}${fraction.padEnd(scale, "0")}`);
}

function fromScaled(value) {
  return value / 100;
}

function readProfileCenti(userId) {
  return db.prepare("SELECT credits FROM profiles WHERE id = ?").get(userId).credits;
}

function countOutbox() {
  return countRows("replication_outbox");
}

function countOutboxByStatus(status) {
  return db.prepare("SELECT COUNT(*) AS count FROM replication_outbox WHERE status = ?").get(status).count;
}

function countRows(table, where = "1 = 1") {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get().count;
}
