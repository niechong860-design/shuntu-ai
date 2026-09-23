#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const backupDir = String.raw`C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`;
const verificationPath = path.join(repoRoot, "d1", "reports", "verification.json");

const criticalTables = [
  "profiles",
  "credit_usage_logs",
  "generation_tasks",
  "generation_history",
  "user_orders",
  "coupons",
  "redeem_logs",
];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.d1Path ?? readLatestD1Path();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const source = args.mockLovablePath ? readMockLovable(args.mockLovablePath) : readFrozenBaseline();
    const d1 = aggregateD1(db);
    const comparisons = criticalTables.map((table) => {
      const sourceAggregate = normalize(source[table]);
      const d1Aggregate = normalize(d1[table]);
      return {
        table,
        result: JSON.stringify(sourceAggregate) === JSON.stringify(d1Aggregate) ? "MATCH" : "MISMATCH",
        source: sourceAggregate,
        d1: d1Aggregate,
      };
    });
    const ok = comparisons.every((row) => row.result === "MATCH");
    console.log(JSON.stringify({
      ok,
      mode: args.mockLovablePath ? "mock-lovable-vs-local-d1" : "frozen-baseline-vs-local-d1",
      d1Path: dbPath,
      comparisons,
      sensitiveRowDataPrinted: false,
    }, null, 2));
    if (!ok) process.exitCode = 2;
  } finally {
    db.close();
  }
}

function parseArgs(argv) {
  const args = { d1Path: null, mockLovablePath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--d1-path") args.d1Path = path.resolve(argv[++index]);
    else if (arg.startsWith("--d1-path=")) args.d1Path = path.resolve(arg.slice("--d1-path=".length));
    else if (arg === "--mock-lovable") args.mockLovablePath = path.resolve(argv[++index]);
    else if (arg.startsWith("--mock-lovable=")) args.mockLovablePath = path.resolve(arg.slice("--mock-lovable=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readLatestD1Path() {
  if (!fs.existsSync(verificationPath)) throw new Error("verification.json missing; run build-import first or pass --d1-path");
  const verification = JSON.parse(fs.readFileSync(verificationPath, "utf8"));
  if (!verification.dbPath || !fs.existsSync(verification.dbPath)) throw new Error("local D1 db path missing from verification.json");
  return verification.dbPath;
}

function readFrozenBaseline() {
  return {
    profiles: aggregateSourceProfiles(readJson("profiles")),
    credit_usage_logs: aggregateSourceCreditUsage(readJson("credit_usage_logs")),
    generation_tasks: aggregateSourceGenerationTasks(readJson("generation_tasks"), "result_image_url"),
    generation_history: aggregateSourceGenerationHistory(readJson("generation_history"), "image_url"),
    user_orders: aggregateSourceUserOrders(readJson("user_orders")),
    coupons: aggregateSourceCoupons(readJson("coupons")),
    redeem_logs: aggregateSourceRedeemLogs(readJson("redeem_logs")),
  };
}

function readMockLovable(file) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const tables = payload.tables ?? payload;
  return {
    profiles: aggregateSourceProfiles(tables.profiles ?? []),
    credit_usage_logs: aggregateSourceCreditUsage(tables.credit_usage_logs ?? []),
    generation_tasks: aggregateSourceGenerationTasks(tables.generation_tasks ?? [], "result_image_url"),
    generation_history: aggregateSourceGenerationHistory(tables.generation_history ?? [], "image_url"),
    user_orders: aggregateSourceUserOrders(tables.user_orders ?? []),
    coupons: aggregateSourceCoupons(tables.coupons ?? []),
    redeem_logs: aggregateSourceRedeemLogs(tables.redeem_logs ?? []),
  };
}

function readJson(table) {
  return JSON.parse(fs.readFileSync(path.join(backupDir, `${table}.json`), "utf8"));
}

function aggregateD1(db) {
  return {
    profiles: db.prepare("SELECT COUNT(*) AS count, SUM(credits) AS sumCredits, MIN(credits) AS minCredits, MAX(credits) AS maxCredits FROM profiles").get(),
    credit_usage_logs: db.prepare("SELECT COUNT(*) AS count, SUM(amount) AS sumAmount, COUNT(DISTINCT user_id) AS distinctUserId, COUNT(DISTINCT idempotency_key) AS distinctIdempotencyKey FROM credit_usage_logs").get(),
    generation_tasks: {
      count: scalar(db, "SELECT COUNT(*) AS value FROM generation_tasks"),
      statusCounts: grouped(db, "generation_tasks", "status"),
      deductionStatusCounts: grouped(db, "generation_tasks", "deduction_status"),
      distinctRequestId: scalar(db, "SELECT COUNT(DISTINCT request_id) AS value FROM generation_tasks"),
      dataImageCount: scalar(db, "SELECT COUNT(*) AS value FROM generation_tasks WHERE substr(result_image_url, 1, 11) = 'data:image/'"),
    },
    generation_history: {
      count: scalar(db, "SELECT COUNT(*) AS value FROM generation_history"),
      modelCounts: grouped(db, "generation_history", "model"),
      sumCost: scalar(db, "SELECT SUM(cost) AS value FROM generation_history"),
      imageUrlNull: scalar(db, "SELECT COUNT(*) AS value FROM generation_history WHERE image_url IS NULL"),
      imageUrlNonNull: scalar(db, "SELECT COUNT(*) AS value FROM generation_history WHERE image_url IS NOT NULL"),
      dataImageCount: scalar(db, "SELECT COUNT(*) AS value FROM generation_history WHERE substr(image_url, 1, 11) = 'data:image/'"),
    },
    user_orders: {
      count: scalar(db, "SELECT COUNT(*) AS value FROM user_orders"),
      statusCounts: grouped(db, "user_orders", "status"),
      sumAmount: scalar(db, "SELECT SUM(amount) AS value FROM user_orders"),
      sumCredits: scalar(db, "SELECT SUM(credits) AS value FROM user_orders"),
    },
    coupons: db.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) AS used, SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) AS unused, SUM(amount) AS sumAmount FROM coupons").get(),
    redeem_logs: db.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed, SUM(amount) AS sumAmount FROM redeem_logs").get(),
  };
}

function aggregateSourceProfiles(rows) {
  const values = rows.map((row) => scale(row.credits));
  return { count: rows.length, sumCredits: sum(values), minCredits: Math.min(...values), maxCredits: Math.max(...values) };
}

function aggregateSourceCreditUsage(rows) {
  return { count: rows.length, sumAmount: sum(rows.map((row) => scale(row.amount))), distinctUserId: distinct(rows, "user_id"), distinctIdempotencyKey: distinct(rows, "idempotency_key") };
}

function aggregateSourceGenerationTasks(rows, imageColumn) {
  return { count: rows.length, statusCounts: group(rows, "status"), deductionStatusCounts: group(rows, "deduction_status"), distinctRequestId: distinct(rows, "request_id"), dataImageCount: 0 };
}

function aggregateSourceGenerationHistory(rows, imageColumn) {
  return { count: rows.length, modelCounts: group(rows, "model"), sumCost: sum(rows.map((row) => scale(row.cost))), imageUrlNull: rows.filter((row) => row[imageColumn] === null).length, imageUrlNonNull: rows.filter((row) => row[imageColumn] !== null).length, dataImageCount: 0 };
}

function aggregateSourceUserOrders(rows) {
  return { count: rows.length, statusCounts: group(rows, "status"), sumAmount: sum(rows.map((row) => scale(row.amount))), sumCredits: sum(rows.map((row) => scale(row.credits))) };
}

function aggregateSourceCoupons(rows) {
  return { count: rows.length, used: rows.filter((row) => row.is_used === true).length, unused: rows.filter((row) => row.is_used === false).length, sumAmount: sum(rows.map((row) => scale(row.amount))) };
}

function aggregateSourceRedeemLogs(rows) {
  return { count: rows.length, success: rows.filter((row) => row.success === true).length, failed: rows.filter((row) => row.success === false).length, sumAmount: sum(rows.map((row) => scale(row.amount))) };
}

function scalar(db, sql) {
  const row = db.prepare(sql).get();
  return row.value;
}

function grouped(db, table, column) {
  const rows = db.prepare(`SELECT ${quote(column)} AS value, COUNT(*) AS count FROM ${quote(table)} GROUP BY ${quote(column)} ORDER BY ${quote(column)}`).all();
  return Object.fromEntries(rows.map((row) => [row.value, row.count]));
}

function quote(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function group(rows, column) {
  const counts = {};
  for (const row of rows) counts[row[column]] = (counts[row[column]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function distinct(rows, column) {
  return new Set(rows.map((row) => row[column])).size;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function scale(value) {
  const text = String(value);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > 2) throw new Error(`Cannot safely scale ${text}`);
  return Number(`${whole}${fraction.padEnd(2, "0")}`);
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
}
