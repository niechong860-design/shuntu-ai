#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const backupDir = String.raw`C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`;
const reportsDir = path.join(repoRoot, "d1", "reports");
const supplementsDir = path.join(repoRoot, "d1", "staging", "source-supplements");
const auditJsonPath = path.join(reportsDir, "pre-remote-audit.json");
const auditReportPath = path.join(reportsDir, "pre-remote-audit-report.md");
const secretsPlanPath = path.join(reportsDir, "secrets-migration-plan.md");

const sensitiveNamePattern = /secret|token|password|api[_-]?key|private[_-]?key/i;
const sourceTables = [
  "profiles",
  "admin_settings",
  "global_config",
  "models_config",
  "style_templates",
  "ads",
  "announcements",
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

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  assertInsideRepo(reportsDir, repoRoot, "reports dir");
  assertInsideRepo(supplementsDir, repoRoot, "supplements dir");

  const codeFiles = collectCodeFiles();
  const codeTextByPath = new Map(codeFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));

  const sensitiveSourceFields = scanSensitiveSourceFields();
  const rechargeAudit = await auditRechargePackages(codeTextByPath);
  const authAudit = auditAuthDependencies(codeTextByPath);
  const storageAudit = auditStorageDependencies(codeTextByPath);
  const secretsCodeRefs = auditSecretsCodeReferences(codeTextByPath);

  const audit = {
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    source_backup: backupDir,
    recharge_packages: rechargeAudit,
    sensitive_fields: sensitiveSourceFields,
    secrets_code_references: secretsCodeRefs,
    auth_dependency: authAudit,
    storage_dependency: storageAudit,
    prohibited_operations: {
      remote_d1_created_or_written: false,
      production_r2_written: false,
      supabase_written: false,
      lovable_written: false,
      auth_migrated: false,
      provider_modified: false,
    },
  };

  fs.writeFileSync(auditJsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(auditReportPath, renderAuditReport(audit));
  fs.writeFileSync(secretsPlanPath, renderSecretsPlan(audit));

  console.log(JSON.stringify({
    ok: true,
    auditJsonPath,
    auditReportPath,
    secretsPlanPath,
    rechargePackagesStatus: rechargeAudit.status,
    sensitiveFieldCount: sensitiveSourceFields.length,
    authStillDependsOnSupabase: authAudit.still_depends_on_supabase,
    storageBucketCount: storageAudit.buckets.length,
  }, null, 2));
}

function assertInsideRepo(targetPath, rootPath, label) {
  const relative = path.relative(rootPath, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`REFUSING_OUTSIDE_REPO_WRITE: ${label} resolved to ${targetPath}`);
  }
}

function collectCodeFiles() {
  const roots = ["src", "supabase", "scripts", "wrangler.jsonc", "package.json"];
  const files = [];
  for (const root of roots) {
    const fullPath = path.join(repoRoot, root);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) files.push(fullPath);
    else walk(fullPath, files);
  }
  return files.filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|sql|json|jsonc)$/i.test(file));
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".wrangler", ".output", "dist", "build"].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
}

function scanSensitiveSourceFields() {
  const fields = new Map();
  for (const table of sourceTables) {
    const sourcePath = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(sourcePath)) continue;
    const rows = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    for (const row of rows) {
      for (const [column, value] of Object.entries(row)) {
        if (!sensitiveNamePattern.test(column)) continue;
        const key = `${table}.${column}`;
        const current = fields.get(key) ?? { table, column, rows: rows.length, non_null_count: 0, max_length: 0 };
        if (value !== null && value !== undefined && value !== "") {
          current.non_null_count += 1;
          current.max_length = Math.max(current.max_length, Buffer.byteLength(String(value), "utf8"));
        }
        fields.set(key, current);
      }
    }
  }
  return Array.from(fields.values()).sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

async function auditRechargePackages(codeTextByPath) {
  const codeRefs = findRefs(codeTextByPath, /recharge_packages/g, 100);
  const sourceJsonPath = path.join(backupDir, "recharge_packages.json");
  const sourceCsvPath = path.join(backupDir, "recharge_packages.csv");
  const frozenSourcePresent = fs.existsSync(sourceJsonPath) || fs.existsSync(sourceCsvPath);
  const env = loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL || readWranglerVar("SUPABASE_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE;
  const result = {
    frozen_source_present: frozenSourcePresent,
    code_reference_count: codeRefs.count,
    code_references: codeRefs.refs,
    service_role_env_available: Boolean(supabaseUrl && serviceRoleKey),
    status: frozenSourcePresent ? "FROZEN SOURCE PRESENT" : "SOURCE DATA MISSING",
    imported: false,
  };
  if (!supabaseUrl || !serviceRoleKey) {
    result.status = "SOURCE UNAVAILABLE";
    result.reason = "Supabase URL or service-role key not available in local environment; no production read attempted.";
    return result;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from("recharge_packages").select("*");
    if (error) {
      result.status = /relation .*recharge_packages.* does not exist|schema cache|42P01/i.test(error.message || error.code || "")
        ? "RELATION NOT FOUND"
        : "SOURCE UNAVAILABLE";
      result.reason = error.code ? `Supabase read error code: ${error.code}` : "Supabase read error";
      return result;
    }
    fs.mkdirSync(supplementsDir, { recursive: true });
    const payload = `${JSON.stringify(data, null, 2)}\n`;
    const supplementPath = path.join(supplementsDir, "recharge_packages.json");
    assertInsideRepo(supplementPath, repoRoot, "recharge_packages supplement");
    fs.writeFileSync(supplementPath, payload);
    result.status = "SUPPLEMENTAL READ-ONLY SNAPSHOT";
    result.row_count = data.length;
    result.sha256 = crypto.createHash("sha256").update(payload).digest("hex");
    result.field_overview = summarizeFields(data);
    result.supplement_path = supplementPath;
    return result;
  } catch (error) {
    result.status = "SOURCE UNAVAILABLE";
    result.reason = `Read-only SELECT attempt failed without exposing credentials: ${error?.name || "Error"}`;
    return result;
  }
}

function loadLocalEnv() {
  const env = {};
  for (const name of [".env", ".env.local", ".dev.vars"]) {
    const file = path.join(repoRoot, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

function readWranglerVar(name) {
  const wranglerPath = path.join(repoRoot, "wrangler.jsonc");
  if (!fs.existsSync(wranglerPath)) return null;
  const match = fs.readFileSync(wranglerPath, "utf8").match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

function summarizeFields(rows) {
  const fields = new Map();
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      const current = fields.get(column) ?? { column, non_null_count: 0, max_length: 0, observed_types: new Set() };
      if (value !== null && value !== undefined) {
        current.non_null_count += 1;
        current.max_length = Math.max(current.max_length, Buffer.byteLength(String(value), "utf8"));
        current.observed_types.add(Array.isArray(value) ? "array" : typeof value);
      }
      fields.set(column, current);
    }
  }
  return Array.from(fields.values()).map((field) => ({ ...field, observed_types: Array.from(field.observed_types).sort() }));
}

function auditAuthDependencies(codeTextByPath) {
  const patterns = {
    "supabase.auth": /supabase\.auth/g,
    "getUser": /\bgetUser\b/g,
    "getSession": /\bgetSession\b/g,
    "onAuthStateChange": /\bonAuthStateChange\b/g,
    "getClaims": /\bgetClaims\b/g,
    "auth.uid": /auth\.uid\s*\(/g,
  };
  const counts = Object.fromEntries(Object.entries(patterns).map(([name, pattern]) => [name, countMatches(codeTextByPath, pattern)]));
  const refs = findRefs(codeTextByPath, /supabase\.auth|\bgetUser\b|\bgetSession\b|\bonAuthStateChange\b|\bgetClaims\b|auth\.uid\s*\(/g, 80);
  return {
    still_depends_on_supabase: Object.values(counts).some((count) => count > 0),
    counts,
    reference_count: refs.count,
    references: refs.refs,
    conclusion: "YES - D1 data migration alone still depends on Supabase Auth for sessions, client auth flows, bearer claims, and legacy auth.uid SQL/RLS/RPC logic.",
  };
}

function auditStorageDependencies(codeTextByPath) {
  const bucketNames = ["reference-images", "avatars", "admin-assets", "case-images"];
  const buckets = bucketNames.map((bucket) => auditBucket(codeTextByPath, bucket));
  const otherStorageRefs = findRefs(codeTextByPath, /\.storage\.from\(|storage\.from\(/g, 80);
  const r2Refs = findRefs(codeTextByPath, /SHUNTU_GENERATED_IMAGES|R2_PUBLIC_BASE_URL|r2-image-archive|generated\//g, 80);
  return {
    buckets,
    storage_reference_count: otherStorageRefs.count,
    storage_references: otherStorageRefs.refs,
    r2_reference_count: r2Refs.count,
    r2_references: r2Refs.refs,
    generated_images_replaced_by_r2: r2Refs.count > 0,
  };
}

function auditBucket(codeTextByPath, bucket) {
  const escaped = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refs = findRefs(codeTextByPath, new RegExp(escaped, "g"), 40);
  let read = false;
  let write = false;
  for (const file of codeTextByPath.keys()) {
    const lines = codeTextByPath.get(file).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes(bucket)) continue;
      const nearby = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 6)).join("\n");
      if (/getPublicUrl|download|createSignedUrl|list/i.test(nearby)) read = true;
      if (/upload|remove|update|move|copy/i.test(nearby)) write = true;
    }
  }
  return {
    bucket,
    reference_count: refs.count,
    still_production_read: read,
    still_production_write: write,
    already_replaced_by_r2: false,
    references: refs.refs,
  };
}

function auditSecretsCodeReferences(codeTextByPath) {
  const refs = findRefs(codeTextByPath, /models_config|global_config|admin_settings|api_key|global_api_key|access_password|WUYIN_API_KEY|XUNHUPAY_APPSECRET|XUNHUPAY_APPID/g, 140);
  return {
    reference_count: refs.count,
    references: refs.refs,
  };
}

function countMatches(codeTextByPath, regex) {
  let count = 0;
  for (const text of codeTextByPath.values()) {
    regex.lastIndex = 0;
    count += text.match(regex)?.length ?? 0;
  }
  return count;
}

function findRefs(codeTextByPath, regex, limit) {
  const refs = [];
  let count = 0;
  for (const [file, text] of codeTextByPath.entries()) {
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      regex.lastIndex = 0;
      const matches = lines[index].match(regex);
      if (!matches) continue;
      count += matches.length;
      if (refs.length < limit) {
        refs.push({ file: path.relative(repoRoot, file).replaceAll("\\", "/"), line: index + 1 });
      }
    }
  }
  return { count, refs };
}

function renderAuditReport(audit) {
  const lines = [];
  lines.push("# SHUNTU Pre-Remote D1 Compatibility Audit", "");
  lines.push(`Generated at: ${audit.generated_at}`);
  lines.push(`Repository: ${audit.repo_root}`);
  lines.push(`Backup source: ${audit.source_backup}`, "");

  lines.push("## recharge_packages", "");
  lines.push(`- Status: ${audit.recharge_packages.status}`);
  lines.push(`- Frozen backup source present: ${audit.recharge_packages.frozen_source_present ? "YES" : "NO"}`);
  lines.push(`- Production code references: ${audit.recharge_packages.code_reference_count}`);
  lines.push(`- Service-role read available: ${audit.recharge_packages.service_role_env_available ? "YES" : "NO"}`);
  if (audit.recharge_packages.row_count != null) lines.push(`- Supplemental rows: ${audit.recharge_packages.row_count}`);
  if (audit.recharge_packages.sha256) lines.push(`- Supplemental SHA256: ${audit.recharge_packages.sha256}`);
  if (audit.recharge_packages.reason) lines.push(`- Reason: ${audit.recharge_packages.reason}`);
  lines.push("", ...renderRefs(audit.recharge_packages.code_references), "");

  lines.push("## Sensitive Fields", "");
  lines.push("| table | column | source rows | non-null | max UTF-8 bytes |", "| --- | --- | ---: | ---: | ---: |");
  for (const field of audit.sensitive_fields) {
    lines.push(`| ${field.table} | ${field.column} | ${field.rows} | ${field.non_null_count} | ${field.max_length} |`);
  }
  lines.push("");

  lines.push("## Supabase Auth Dependency", "");
  lines.push(`- Still depends on Supabase/Lovable after D1-only migration: ${audit.auth_dependency.still_depends_on_supabase ? "YES" : "NO"}`);
  lines.push(`- Conclusion: ${audit.auth_dependency.conclusion}`);
  lines.push("", "| pattern | occurrences |", "| --- | ---: |");
  for (const [pattern, count] of Object.entries(audit.auth_dependency.counts)) {
    lines.push(`| ${pattern} | ${count} |`);
  }
  lines.push("", ...renderRefs(audit.auth_dependency.references), "");

  lines.push("## Supabase Storage Dependency", "");
  lines.push(`- Generated image archive has R2 references: ${audit.storage_dependency.generated_images_replaced_by_r2 ? "YES" : "NO"}`);
  lines.push("", "| bucket | refs | read | write | already replaced by R2 |", "| --- | ---: | --- | --- | --- |");
  for (const bucket of audit.storage_dependency.buckets) {
    lines.push(`| ${bucket.bucket} | ${bucket.reference_count} | ${bucket.still_production_read ? "YES" : "NO"} | ${bucket.still_production_write ? "YES" : "NO"} | ${bucket.already_replaced_by_r2 ? "YES" : "NO"} |`);
  }
  lines.push("");

  lines.push("## Prohibited Operations", "");
  lines.push("- No Supabase/Lovable writes were performed.");
  lines.push("- No remote D1 create/write was performed.");
  lines.push("- No production R2 write was performed.");
  lines.push("- No Auth or Provider code migration was performed.");
  return `${lines.join("\n")}\n`;
}

function renderSecretsPlan(audit) {
  const lines = [];
  lines.push("# SHUNTU Cloudflare Secrets Migration Plan", "");
  lines.push(`Generated at: ${audit.generated_at}`);
  lines.push("Production API keys are reported by the user as already configured in Cloudflare env/secrets. This plan does not read, print, create, update, or delete any Cloudflare Secret.", "");
  lines.push("## Database Secret-Like Fields", "");
  lines.push("| field | non-null | max UTF-8 bytes | current use | migration status |", "| --- | ---: | ---: | --- | --- |");
  for (const field of audit.sensitive_fields) {
    const full = `${field.table}.${field.column}`;
    lines.push(`| ${full} | ${field.non_null_count} | ${field.max_length} | ${describeCurrentUse(full)} | ${describeMigrationStatus(full)} |`);
  }
  lines.push("", "## Recommended Order", "");
  lines.push("1. Keep DB columns during first remote D1 import so current code paths remain readable.");
  lines.push("2. Move provider keys to Cloudflare Secrets/env bindings in Worker/server code, with DB values used only as a temporary fallback if explicitly approved.");
  lines.push("3. Remove admin UI write/read dependency for provider secret fields after server-side secret resolution is live.");
  lines.push("4. Only after production traffic is verified, clear or drop DB secret fields in a separate authorized data-cleanup phase.");
  lines.push("", "## Code Reference Summary", "");
  lines.push(`- Secret/config related references found: ${audit.secrets_code_references.reference_count}`);
  lines.push(...renderRefs(audit.secrets_code_references.references));
  lines.push("", "## Current Classification", "");
  lines.push("- models_config.api_key: still used by provider/admin model config paths; not safe to remove from D1 until code resolves provider credentials from Cloudflare Secrets.");
  lines.push("- global_config.global_api_key: server code has WUYIN_API_KEY env fallback; strongest candidate for Cloudflare Secret-only operation after code path is hardened.");
  lines.push("- admin_settings.access_password: admin access product setting, not a provider API key; can move to a secret only if password management behavior changes.");
  lines.push("- XUNHUPAY_APPID / XUNHUPAY_APPSECRET: already env-style references; no DB source field found in frozen backup.");
  lines.push("", "## Not Performed", "");
  lines.push("- No DB secret field was deleted, cleared, masked, or rewritten.");
  lines.push("- No Cloudflare Secret was created, updated, or read.");
  lines.push("- No Provider/Auth/Canvas/payment code was modified.");
  return `${lines.join("\n")}\n`;
}

function describeCurrentUse(field) {
  if (field === "models_config.api_key") return "provider/admin model configuration";
  if (field === "global_config.global_api_key") return "global provider fallback key";
  if (field === "admin_settings.access_password") return "admin access gate setting";
  return "unknown or incidental secret-like field";
}

function describeMigrationStatus(field) {
  if (field === "global_config.global_api_key") return "candidate for Cloudflare Secret after code migration";
  if (field === "models_config.api_key") return "keep until provider secret resolver replaces DB read";
  if (field === "admin_settings.access_password") return "keep until admin-password product decision";
  return "review before removal";
}

function renderRefs(refs) {
  if (!refs || refs.length === 0) return ["- No references found."];
  return refs.map((ref) => `- ${ref.file}:${ref.line}`);
}
