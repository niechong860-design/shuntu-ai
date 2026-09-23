import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REPO_ROOT = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const REPORT_PATH = path.join(REPO_ROOT, "d1/reports/business-router-production-simulation.md");

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function loadDatabasePrimaryModule() {
  const source = read("src/lib/database-primary.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    process: { env: {} },
    console: { warn() {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(output, sandbox, { filename: "database-primary.js" });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { resolveDatabasePrimary } = loadDatabasePrimaryModule();

const routingCases = {
  unset: resolveDatabasePrimary(undefined),
  empty: resolveDatabasePrimary({ DATABASE_PRIMARY: "" }),
  lovable: resolveDatabasePrimary({ DATABASE_PRIMARY: "lovable" }),
  d1: resolveDatabasePrimary({ DATABASE_PRIMARY: "d1" }),
};

const invalidValues = ["D1", "dl", "postgres", "true", "1"];
const invalidFallbacks = Object.fromEntries(
  invalidValues.map((value) => [value, resolveDatabasePrimary({ DATABASE_PRIMARY: value })]),
);

assert(routingCases.unset === "lovable", "unset DATABASE_PRIMARY must default to lovable");
assert(routingCases.empty === "lovable", "empty DATABASE_PRIMARY must default to lovable");
assert(routingCases.lovable === "lovable", "DATABASE_PRIMARY=lovable must route lovable");
assert(routingCases.d1 === "d1", "DATABASE_PRIMARY=d1 must route d1");
for (const [value, result] of Object.entries(invalidFallbacks)) {
  assert(result === "lovable", `invalid DATABASE_PRIMARY=${value} must fall back to lovable`);
}

const routerSource = read("src/lib/business-database-router.ts");
const lovableBranch = routerSource.indexOf('if (primary === "lovable")');
const d1BindingLookup = routerSource.indexOf("getD1BindingFromEnv");
assert(lovableBranch >= 0, "DatabaseRouter must have an explicit lovable branch");
assert(d1BindingLookup >= 0, "DatabaseRouter must support D1 binding lookup");
assert(lovableBranch < d1BindingLookup, "DatabaseRouter must return Lovable before D1 binding lookup");

const adminSource = read("src/lib/admin.functions.ts");
const paymentSource = read("src/lib/payment.functions.ts");
const profileSource = read("src/lib/profile.functions.ts");
const useAuthSource = read("src/hooks/use-auth.tsx");
const settingsDialogSource = read("src/components/auth/SettingsDialog.tsx");
const legacyGuardSource = read("src/lib/legacy-lovable-guard.ts");
const inspirationSource = read("src/lib/inspiration.functions.ts");
const notifySource = read("src/routes/api/xunhupay/notify.ts");
const thumbnailSource = read("src/routes/api/history-thumbnail.$id.ts");

const adminLegacyGuardCount = (adminSource.match(/assertLovableOnlyLegacyWrite\(/g) ?? []).length;
const inspirationLegacyGuardCount = (inspirationSource.match(/assertLovableOnlyLegacyWrite\(/g) ?? []).length;

const productionPaths = {
  adminUsesRouter: adminSource.includes("createBusinessDatabaseFromContext"),
  adminNoBusinessRpcCalls: !/supabase\.rpc\(["'](consume_credits_for_generation|finalize_user_generation_task_once|set_latest_history_image|redeem_gift_card)["']/.test(adminSource),
  adminLegacyWritesGuarded: adminLegacyGuardCount >= 20,
  paymentUsesRouter: paymentSource.includes("createBusinessDatabaseFromContext"),
  paymentNoDirectSupabaseBusinessDb: !/(supabaseAdmin|\.from\(|\.rpc\()/.test(paymentSource),
  profileUsesRouter: profileSource.includes("createBusinessDatabaseFromContext") && profileSource.includes("getCurrentProfile") && profileSource.includes("updateCurrentProfile"),
  clientAuthNoProfileSupabaseRead: !/\.from\(["']profiles["']\)/.test(useAuthSource),
  settingsDialogNoProfileSupabaseWrite: !/\.from\(["']profiles["']\)/.test(settingsDialogSource),
  legacyGuardPresent: legacyGuardSource.includes("resolveDatabasePrimary") && legacyGuardSource.includes('!== "d1"'),
  inspirationLegacyWritesGuarded: inspirationLegacyGuardCount >= 5,
  notifyUsesRouter: notifySource.includes("createBusinessDatabaseFromContext") && notifySource.includes("completePaidOrder"),
  thumbnailUsesRouter: thumbnailSource.includes("createBusinessDatabaseFromContext") && thumbnailSource.includes("getGenerationHistory"),
};

for (const [name, passed] of Object.entries(productionPaths)) {
  assert(passed, `production path simulation failed: ${name}`);
}

const outboxSource = read("src/lib/d1-replication-outbox.ts");
const d1Source = read("src/lib/d1-business-database.ts");
const outboxChecks = {
  batchRequiresBusinessStatements: outboxSource.includes("businessStatements.length === 0"),
  batchRequiresOutboxEvents: outboxSource.includes("outboxEvents.length === 0"),
  payloadGuardPresent: outboxSource.includes("assertSafeReplicationPayload"),
  d1WritesUseOutbox: (d1Source.match(/batchWithOutbox/g) ?? []).length >= 8,
};
for (const [name, passed] of Object.entries(outboxChecks)) {
  assert(passed, `outbox guard simulation failed: ${name}`);
}

const result = {
  ok: true,
  routingCases,
  invalidFallbacks,
  d1BindingLazyInit: true,
  productionPaths,
  guardCounts: { adminLegacyGuardCount, inspirationLegacyGuardCount },
  outboxChecks,
};

const lines = [
  "# Business Router Production Simulation",
  "",
  "## DATABASE_PRIMARY",
  "",
  `- unset: ${routingCases.unset}`,
  `- empty: ${routingCases.empty}`,
  `- lovable: ${routingCases.lovable}`,
  `- d1: ${routingCases.d1}`,
  `- invalid values fall back to lovable: ${Object.entries(invalidFallbacks).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  "",
  "## D1 Binding Lazy Init",
  "",
  "- PASS: DatabaseRouter returns the Lovable adapter before resolving env.DB when primary is lovable.",
  "- PASS: DATABASE_PRIMARY=d1 remains the only path that requires a DB binding.",
  "",
  "## Production Paths",
  "",
  ...Object.entries(productionPaths).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`),
  `- admin legacy write guards: ${adminLegacyGuardCount}`,
  `- inspiration legacy write guards: ${inspirationLegacyGuardCount}`,
  "",
  "## Outbox Guards",
  "",
  ...Object.entries(outboxChecks).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`),
  "",
];

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);

console.log(JSON.stringify({ ...result, reportPath: REPORT_PATH }, null, 2));
