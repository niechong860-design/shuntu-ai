#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const backupDir = String.raw`C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`;
const reportsDir = path.join(repoRoot, "d1/reports");
const generatedDir = path.join(repoRoot, "d1/staging/generated/catchup");
const supplementPath = path.join(repoRoot, "d1/staging/source-supplements/recharge_packages.json");
const manifestPath = path.join(repoRoot, "d1/reports/legacy-image-externalization-manifest.json");
const reportPath = path.join(reportsDir, "supabase-to-d1-catchup-report.md");

const options = parseArgs(process.argv.slice(2));
const source = options.source ?? "frozen";
const dryRun = !options.execute;
if (options.execute && !options.confirmProductionD1) {
  throw new Error("REFUSING_REMOTE_D1_WRITE: --execute requires --confirm-production-d1");
}

const importOrder = [
  "profiles",
  "admin_settings",
  "global_config",
  "models_config",
  "style_templates",
  "ads",
  "announcements",
  "recharge_packages",
  "coupons",
  "generation_tasks",
  "generation_history",
  "credit_usage_logs",
  "user_orders",
  "redeem_logs",
  "user_roles",
  "inspiration_cases",
  "case_likes",
  "case_favorites",
  "case_comments",
];

const tableColumns = {
  profiles: ["id", "email", "display_name", "avatar_url", "credits", "created_at", "updated_at"],
  admin_settings: ["id", "access_password", "system_prompt", "contact_wechat", "contact_qq", "updated_at"],
  global_config: ["id", "base_url", "global_api_key", "updated_at"],
  models_config: ["id", "model_key", "name", "description", "cost", "sort_order", "api_url", "api_key", "request_format", "prompt_key", "fetch_url", "extra_params", "is_enabled", "created_at", "updated_at"],
  style_templates: ["id", "name", "prompt", "image_url", "sort_order", "updated_at"],
  ads: ["id", "title", "link_url", "is_active", "sort_order", "created_at", "updated_at"],
  announcements: ["id", "title", "content", "type", "image_url", "link_url", "link_label", "is_pinned", "is_published", "created_at", "updated_at"],
  recharge_packages: ["id", "title", "subtitle", "price", "credits", "features", "badge_text", "is_popular", "highlighted", "is_visible", "sort_order", "button_text", "purchase_url", "created_at", "updated_at"],
  coupons: ["id", "code", "amount", "is_used", "used_by", "used_by_email", "used_at", "created_at", "created_by"],
  generation_tasks: ["id", "request_id", "user_id", "status", "model_id", "prompt", "input_params", "credits_required", "deduction_status", "deduction_id", "charged_at", "refunded_at", "result_image_url", "result_payload", "error_code", "error_message", "started_at", "completed_at", "created_at", "updated_at"],
  generation_history: ["id", "user_id", "model", "cost", "prompt", "image_url", "created_at", "generation_task_id"],
  credit_usage_logs: ["id", "user_id", "amount", "source", "model_key", "model_name", "generation_history_id", "generation_task_id", "idempotency_key", "created_at", "metadata"],
  user_orders: ["id", "user_id", "out_trade_no", "amount", "credits", "status", "pay_type", "trade_no", "paid_at", "created_at", "updated_at"],
  redeem_logs: ["id", "user_id", "code", "amount", "success", "error_message", "redeemed_at"],
  user_roles: ["id", "user_id", "role", "created_at"],
  inspiration_cases: ["id", "user_id", "title", "image_url", "prompt", "model_key", "model_name", "aspect_ratio", "size", "style_id", "tags", "views", "likes_count", "favorites_count", "is_published", "created_at", "updated_at"],
  case_likes: ["case_id", "user_id", "created_at"],
  case_favorites: ["case_id", "user_id", "created_at"],
  case_comments: ["id", "case_id", "user_id", "content", "created_at"],
};

const primaryKeys = {
  case_likes: ["case_id", "user_id"],
  case_favorites: ["case_id", "user_id"],
};

const booleanColumns = toSetMap({
  ads: ["is_active"],
  announcements: ["is_pinned", "is_published"],
  coupons: ["is_used"],
  models_config: ["is_enabled"],
  inspiration_cases: ["is_published"],
  recharge_packages: ["is_popular", "highlighted", "is_visible"],
  redeem_logs: ["success"],
});

const jsonColumns = toSetMap({
  credit_usage_logs: ["metadata"],
  generation_tasks: ["input_params", "result_payload"],
  inspiration_cases: ["tags"],
  models_config: ["extra_params"],
  recharge_packages: ["features"],
});

const centiColumns = toSetMap({
  profiles: ["credits"],
  credit_usage_logs: ["amount"],
  generation_history: ["cost"],
  generation_tasks: ["credits_required"],
  models_config: ["cost"],
  coupons: ["amount"],
  recharge_packages: ["credits"],
  redeem_logs: ["amount"],
  user_orders: ["credits"],
});

const fenColumns = toSetMap({ user_orders: ["amount"] });

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const baseline = await loadFrozenRows();
  const sourceStability = source === "supabase-readonly" ? await loadStableSupabaseRows() : null;
  const current = sourceStability?.rows ?? await loadFrozenRows();
  const finalUrlByDataSha = loadLegacyUrlMap();
  const comparisons = [];
  const sql = [];
  let blockedDeletes = 0;
  let allowedDeletes = 0;

  for (const table of importOrder) {
    const baseRows = baseline.get(table) ?? [];
    const nextRows = current.get(table) ?? [];
    const base = indexRows(table, baseRows.map((row) => transformRow(table, row, finalUrlByDataSha)));
    const next = indexRows(table, nextRows.map((row) => transformRow(table, row, finalUrlByDataSha)));
    const inserts = [];
    const updates = [];
    const deletes = [];

    for (const [key, row] of next.entries()) {
      const prev = base.get(key);
      if (!prev) inserts.push(row);
      else if (hashRow(prev) !== hashRow(row)) updates.push(row);
    }
    for (const [key, row] of base.entries()) {
      if (!next.has(key)) deletes.push(row);
    }

    blockedDeletes += deletes.length;
    for (const row of [...inserts, ...updates]) sql.push(upsertSql(table, row));
    if (table === "generation_history" && sourceStability?.stable) {
      for (const row of deletes) {
        sql.push(deleteByIdSql(table, row.id));
        allowedDeletes += 1;
      }
      blockedDeletes -= deletes.length;
    }
    comparisons.push({
      table,
      baselineRows: baseRows.length,
      currentRows: nextRows.length,
      inserts: inserts.length,
      updates: updates.length,
      allowedDeletes: table === "generation_history" && sourceStability?.stable ? deletes.length : 0,
      blockedDeletes: table === "generation_history" && sourceStability?.stable ? 0 : deletes.length,
    });
  }

  const totalInserts = comparisons.reduce((sum, row) => sum + row.inserts, 0);
  const totalUpdates = comparisons.reduce((sum, row) => sum + row.updates, 0);
  const status = blockedDeletes > 0 || (source === "supabase-readonly" && !sourceStability?.stable)
    ? "CATCHUP_BLOCKED_DELETE_REVIEW_REQUIRED"
    : "CATCHUP_READY";

  let packagePath = null;
  if (options.writePackage || options.execute) {
    fs.mkdirSync(generatedDir, { recursive: true });
    assertInsideRepo(generatedDir, repoRoot, "catchup generated dir");
    packagePath = path.join(generatedDir, "catchup-upserts.sql");
    fs.writeFileSync(packagePath, `${sql.join("\n")}\n`);
  }

  if (options.execute) {
    if (!packagePath) throw new Error("NO_CATCHUP_PACKAGE_GENERATED");
    const database = options.database ?? "shuntu-prod";
    const result = spawnSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--file", packagePath], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) throw new Error("REMOTE_D1_CATCHUP_EXECUTION_FAILED");
  }

  if (options.executeLocal) {
    if (!packagePath) throw new Error("NO_CATCHUP_PACKAGE_GENERATED");
    executeLocalPackage(packagePath, options.localDb);
  }

  fs.writeFileSync(reportPath, renderReport({
    source,
    status,
    dryRun,
    packagePath,
    comparisons,
    totalInserts,
    totalUpdates,
    allowedDeletes,
    blockedDeletes,
    sourceStability,
  }));
  console.log(JSON.stringify({
    ok: status === "CATCHUP_READY",
    source,
    dryRun,
    status,
    totalInserts,
    totalUpdates,
    allowedDeletes,
    blockedDeletes,
    sourceStability: sourceStability
      ? { stable: sourceStability.stable, snapshot1Count: sourceStability.snapshot1Count, snapshot2Count: sourceStability.snapshot2Count }
      : null,
    packagePath,
    reportPath,
  }, null, 2));
}

async function loadFrozenRows() {
  const rows = new Map();
  for (const table of importOrder) {
    if (table === "recharge_packages") {
      rows.set(table, fs.existsSync(supplementPath) ? JSON.parse(fs.readFileSync(supplementPath, "utf8")) : []);
      continue;
    }
    const file = path.join(backupDir, `${table}.json`);
    rows.set(table, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
  }
  return rows;
}

async function loadSupabaseRows() {
  const env = loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_READONLY_ENV_MISSING");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = new Map();
  for (const table of importOrder) rows.set(table, await selectAll(supabase, table));
  return rows;
}

async function loadStableSupabaseRows() {
  const rows = await loadSupabaseRows();
  const snapshot1 = [...(rows.get("generation_history") ?? [])]
    .map((row) => String(row.id))
    .sort();
  const snapshot2 = await loadSupabaseGenerationHistoryIds();
  const stable = sameIdSet(snapshot1, snapshot2);
  if (!stable) throw new Error("GENERATION_HISTORY_SOURCE_STILL_CHANGING");
  return {
    rows,
    stable,
    snapshot1Count: snapshot1.length,
    snapshot2Count: snapshot2.length,
    snapshot1,
    snapshot2,
  };
}

async function loadSupabaseGenerationHistoryIds() {
  const env = loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_READONLY_ENV_MISSING");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = [];
  const pageSize = pageSizeForTable("generation_history");
  for (let from = 0;; from += pageSize) {
    const { data, error } = await supabase
      .from("generation_history")
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`SUPABASE_READ_FAILED:generation_history_ids:${error.code ?? error.message}`);
    out.push(...(data ?? []).map((row) => String(row.id)));
    if (!data || data.length < pageSize) break;
  }
  return out.sort();
}

function sameIdSet(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function selectAll(supabase, table) {
  let pageSize = pageSizeForTable(table);
  for (;;) {
    try {
      return await selectAllWithPageSize(supabase, table, pageSize);
    } catch (error) {
      if (!String(error?.message ?? error).includes("57014") || pageSize <= 25) throw error;
      pageSize = Math.max(25, Math.floor(pageSize / 2));
    }
  }
}

async function selectAllWithPageSize(supabase, table, pageSize) {
  const out = [];
  for (let from = 0;; from += pageSize) {
    let query = supabase.from(table).select(tableColumns[table].join(","));
    for (const column of primaryKeys[table] ?? ["id"]) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`SUPABASE_READ_FAILED:${table}:${error.code ?? error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function pageSizeForTable(table) {
  if (table === "generation_tasks" || table === "generation_history") return 100;
  if (table === "credit_usage_logs") return 500;
  return 1000;
}

function loadLegacyUrlMap() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return new Map((manifest.objects ?? []).map((object) => [object.sha256, object.final_public_url ?? object.existing_r2_url ?? object.fallback_proposed_public_url]));
}

function transformRow(table, sourceRow, finalUrlByDataSha) {
  const row = {};
  for (const column of tableColumns[table]) row[column] = transformValue(table, column, sourceRow[column], finalUrlByDataSha);
  return row;
}

function transformValue(table, column, value, finalUrlByDataSha) {
  if (value == null) return null;
  if ((table === "generation_tasks" && column === "result_image_url") || (table === "generation_history" && column === "image_url")) {
    const sha = dataImageSha(value);
    if (sha) return finalUrlByDataSha.get(sha) ?? value;
  }
  if (booleanColumns[table]?.has(column)) return value === true || value === 1 ? 1 : 0;
  if (jsonColumns[table]?.has(column)) return JSON.stringify(value ?? (column === "result_payload" || column === "metadata" ? null : {}));
  if (centiColumns[table]?.has(column)) return decimalToScaledInteger(value, 2, `${table}.${column}`);
  if (fenColumns[table]?.has(column)) return decimalToScaledInteger(value, 2, `${table}.${column}`);
  return value;
}

function dataImageSha(value) {
  const match = typeof value === "string" && value.match(/^data:image\/[A-Za-z0-9.+-]+;base64,([\s\S]*)$/);
  if (!match) return null;
  return crypto.createHash("sha256").update(Buffer.from(match[1], "base64")).digest("hex");
}

function indexRows(table, rows) {
  const map = new Map();
  for (const row of rows) map.set(primaryKey(table, row), row);
  return map;
}

function primaryKey(table, row) {
  const keys = primaryKeys[table] ?? ["id"];
  return keys.map((key) => String(row[key])).join("\u001f");
}

function hashRow(row) {
  return crypto.createHash("sha256").update(stableJson(row)).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function upsertSql(table, row) {
  const columns = tableColumns[table];
  const pk = primaryKeys[table] ?? ["id"];
  const assignments = columns.filter((column) => !pk.includes(column)).map((column) => `${quoteIdent(column)}=excluded.${quoteIdent(column)}`).join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(",")}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(",")}) ON CONFLICT(${pk.map(quoteIdent).join(",")}) DO UPDATE SET ${assignments};`;
}

function deleteByIdSql(table, id) {
  if (table !== "generation_history") throw new Error(`DELETE_ALLOWLIST_VIOLATION:${table}`);
  return `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent("id")}=${sqlLiteral(id)};`;
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_SQL_NUMBER");
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function decimalToScaledInteger(value, scale, label) {
  const text = normalizeDecimalString(String(value).trim(), label);
  const sign = text.startsWith("-") ? -1n : 1n;
  const unsigned = text.replace(/^[+-]/, "");
  if (!/^\d+(\.\d+)?$/.test(unsigned)) throw new Error(`Invalid decimal ${label}`);
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale) throw new Error(`Too many decimal places for ${label}`);
  const scaled = BigInt(`${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "") || "0") * sign;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error(`Scaled integer out of range for ${label}`);
  return Number(scaled);
}

function normalizeDecimalString(text, label) {
  if (!/[eE]/.test(text)) return text;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`Invalid decimal ${label}`);
  return number.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

function loadLocalEnv() {
  const env = {};
  for (const name of [".env", ".env.local", ".dev.vars"]) {
    const file = path.join(repoRoot, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function toSetMap(input) {
  return Object.fromEntries(Object.entries(input).map(([table, cols]) => [table, new Set(cols)]));
}

function parseArgs(argv) {
  const parsed = { execute: false, executeLocal: false, confirmProductionD1: false, writePackage: false, localDb: null };
  for (const arg of argv) {
    if (arg === "--execute") parsed.execute = true;
    else if (arg === "--execute-local") parsed.executeLocal = true;
    else if (arg === "--confirm-production-d1") parsed.confirmProductionD1 = true;
    else if (arg === "--write-package") parsed.writePackage = true;
    else if (arg.startsWith("--source=")) parsed.source = arg.slice("--source=".length);
    else if (arg.startsWith("--database=")) parsed.database = arg.slice("--database=".length);
    else if (arg.startsWith("--local-db=")) parsed.localDb = path.resolve(arg.slice("--local-db=".length));
  }
  return parsed;
}

function executeLocalPackage(packagePath, localDbPath) {
  if (!localDbPath) throw new Error("LOCAL_DB_PATH_REQUIRED");
  const db = new DatabaseSync(path.resolve(localDbPath));
  try {
    db.exec("BEGIN;");
    db.exec(fs.readFileSync(packagePath, "utf8"));
    db.exec("COMMIT;");
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    throw new Error(`LOCAL_D1_CATCHUP_EXECUTION_FAILED:${error.message}`);
  } finally {
    db.close();
  }
}

function assertInsideRepo(targetPath, rootPath, label) {
  const relative = path.relative(rootPath, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`REFUSING_OUTSIDE_REPO_WRITE: ${label}`);
}

function renderReport(input) {
  return [
    "# Supabase to D1 Catch-up Plan",
    "",
    `- Source mode: ${input.source}`,
    `- Dry run: ${input.dryRun}`,
    `- Status: ${input.status}`,
    `- Total inserts: ${input.totalInserts}`,
    `- Total updates: ${input.totalUpdates}`,
    `- Allowed generation_history deletes: ${input.allowedDeletes}`,
    `- Blocked deletes: ${input.blockedDeletes}`,
    `- Source ID snapshots: ${input.sourceStability ? `${input.sourceStability.snapshot1Count}/${input.sourceStability.snapshot2Count}, stable=${input.sourceStability.stable}` : "not run"}`,
    `- Generated SQL package: ${input.packagePath ?? "not generated"}`,
    "",
    "| table | baseline rows | current rows | inserts | updates | blocked deletes |",
    "|---|---:|---:|---:|---:|---:|",
    ...input.comparisons.map((row) => `| ${row.table} | ${row.baselineRows} | ${row.currentRows} | ${row.inserts} | ${row.updates} | ${row.allowedDeletes} | ${row.blockedDeletes} |`),
    "",
    "Deletes are intentionally blocked for manual review; insert/update rows can be converted into D1 UPSERT SQL in gitignored staging.",
    "No production D1 write is performed unless --execute and --confirm-production-d1 are both supplied.",
    "",
  ].join("\n");
}
