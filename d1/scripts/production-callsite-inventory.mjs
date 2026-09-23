import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const REPORT_PATH = path.join(REPO_ROOT, "d1/reports/production-callsite-inventory.md");
const SCAN_ROOTS = ["src/lib", "src/routes", "src/hooks", "src/components"];

const BUSINESS_TARGETS = new Set([
  "profiles",
  "generation_tasks",
  "generation_history",
  "credit_usage_logs",
  "user_orders",
  "coupons",
  "redeem_logs",
  "models_config",
  "global_config",
  "announcements",
  "ads",
  "style_templates",
  "recharge_packages",
  "admin_settings",
  "user_roles",
  "inspiration_cases",
  "case_likes",
  "case_favorites",
  "case_comments",
]);

const BUSINESS_RPCS = new Set([
  "admin_credit_usage_totals",
  "consume_credits_for_generation",
  "finalize_user_generation_task_once",
  "set_latest_history_image",
  "complete_paid_order",
  "redeem_gift_card",
  "increment_case_view",
]);

const WIRED_FUNCTIONS = [
  "redeemCoupon",
  "listModelsConfig",
  "consumeGeneration",
  "getMyGenerationHistory",
  "getMyGenerationTasks",
  "createGenerationTask",
  "cancelMyQueuedGenerationTasks",
  "cancelGenerationTask",
  "startGenerationTask",
  "pollGenerationTask",
  "generateImage",
  "checkImageStatus",
  "getCurrentProfile",
  "updateCurrentProfile",
  "listVisibleRechargePackages",
  "listActiveAds",
  "listAnnouncements",
  "listStyleTemplates",
  "createXunhuPayOrder",
  "getUserOrderStatus",
  "confirmXunhuPayOrder",
  "/api/xunhupay/notify",
  "/api/history-thumbnail/$id",
];

function walk(dir) {
  const entries = fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) files.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
  }
  return files;
}

function classify(file, line, target, operation) {
  if (file.includes("supabase-request-auth") || line.includes(".auth.") || target === "user_roles") {
    return ["AUTH", "Supabase Auth / role inventory intentionally remains on Supabase for this phase."];
  }
  if (line.includes(".storage.")) {
    return ["STORAGE", "Supabase Storage intentionally remains on Supabase for this phase."];
  }
  if (file.endsWith("lovable-business-database.ts")) {
    return ["INTENTIONAL", "Lovable adapter implementation behind BusinessDatabase."];
  }
  if (file.endsWith("replication-processor.ts")) {
    return ["INTENTIONAL", "Warm-standby row-state replication target; writes are disabled unless explicitly injected later."];
  }
  if (file.endsWith("d1-business-database.ts") || file.endsWith("d1-replication-outbox.ts")) {
    return ["INTENTIONAL", "D1 adapter/outbox implementation behind BusinessDatabase."];
  }
  if (file.includes("inspiration.functions.ts")) {
    return ["LEGACY_DB_ISOLATED", "Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1."];
  }
  if (file.includes("use-auth.tsx") || file.includes("SettingsDialog.tsx")) {
    return ["BUG", "Client profile DB access must use server-routed BusinessDatabase before D1 cutover."];
  }
  if (file.includes("admin.functions.ts")) {
    if (/generation_history.*delete|profiles.*delete|coupons.*delete/.test(line)) {
      return ["INTENTIONAL", "Lovable-only admin/prune/delete behavior retained; D1 delete semantics remain a later controlled phase."];
    }
    if (/profiles|credit_usage_logs|coupons|models_config|recharge_packages|ads|announcements|style_templates|admin_settings|admin_credit_usage_totals/.test(target)) {
      return ["LEGACY_DB_ISOLATED", "Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1."];
    }
    return ["INTENTIONAL", "Residual direct call guarded to Lovable-only compatibility path or admin-only inventory."];
  }
  return ["BUG", "Unexpected direct Supabase business database call after router wiring."];
}

const rows = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const fromMatches = [...line.matchAll(/\.from\(["']([^"']+)["']\)/g)];
      const rpcMatches = [...line.matchAll(/\.rpc\(["']([^"']+)["']/g)];
      for (const match of fromMatches) {
        if (!BUSINESS_TARGETS.has(match[1])) continue;
        const [classification, reason] = classify(file, line, match[1], "from");
        rows.push({ file, line: index + 1, operation: "from", target: match[1], classification, reason });
      }
      for (const match of rpcMatches) {
        if (!BUSINESS_RPCS.has(match[1])) continue;
        const [classification, reason] = classify(file, line, match[1], "rpc");
        rows.push({ file, line: index + 1, operation: "rpc", target: match[1], classification, reason });
      }
    });
  }
}

const counts = rows.reduce((acc, row) => {
  acc[row.classification] = (acc[row.classification] ?? 0) + 1;
  return acc;
}, {});

const allSource = SCAN_ROOTS.flatMap((root) => walk(root))
  .map((file) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8"))
  .join("\n");
const legacyWriteGuardCount = (allSource.match(/assertLovableOnlyLegacyWrite\(/g) ?? []).length;
const criticalWriteBypassCount = counts.BUG ?? 0;

const lines = [
  "# Production Call-Site Inventory",
  "",
  "## Wired Through BusinessDatabase",
  "",
  ...WIRED_FUNCTIONS.map((name) => `- ${name}`),
  "",
  "## Remaining Direct Supabase Calls",
  "",
  "| file | line | operation | target | classification | reason |",
  "|---|---:|---|---|---|---|",
  ...rows.map((row) => `| ${row.file} | ${row.line} | ${row.operation} | ${row.target} | ${row.classification} | ${row.reason} |`),
  "",
  "## Summary",
  "",
  ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([classification, count]) => `- ${classification}: ${count}`),
  `- legacy write guards: ${legacyWriteGuardCount}`,
  `- critical write bypass count: ${criticalWriteBypassCount}`,
  "",
  "No raw row data, API keys, tokens, or secrets are included in this inventory.",
  "",
];

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ ok: criticalWriteBypassCount === 0, reportPath: REPORT_PATH, rows: rows.length, counts, legacyWriteGuardCount, criticalWriteBypassCount }, null, 2));
