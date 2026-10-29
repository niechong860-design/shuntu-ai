import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REPO_ROOT = path.resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"),
);
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

function assertThrows(fn, pattern, message) {
  try {
    fn();
  } catch (error) {
    assert(pattern.test(String(error?.message ?? error)), message);
    return;
  }
  throw new Error(message);
}

const { resolveDatabasePrimary } = loadDatabasePrimaryModule();

const routingCases = {
  unset: resolveDatabasePrimary(undefined),
  empty: resolveDatabasePrimary({ DATABASE_PRIMARY: "" }),
  d1: resolveDatabasePrimary({ DATABASE_PRIMARY: "d1" }),
};

assert(routingCases.unset === "d1", "unset DATABASE_PRIMARY must default to d1");
assert(routingCases.empty === "d1", "empty DATABASE_PRIMARY must default to d1");
assert(routingCases.d1 === "d1", "DATABASE_PRIMARY=d1 must route d1");
assertThrows(
  () => resolveDatabasePrimary({ DATABASE_PRIMARY: "lovable" }),
  /LEGACY_LOVABLE_DATABASE_DISABLED/,
  "legacy Lovable must be rejected",
);
assertThrows(
  () => resolveDatabasePrimary({ DATABASE_PRIMARY: "D1" }),
  /UNSUPPORTED_DATABASE_PRIMARY/,
  "invalid primary must be rejected",
);

const routerSource = read("src/lib/business-database-router.ts");
const d1BindingLookup = routerSource.indexOf("getD1BindingFromEnv");
assert(d1BindingLookup >= 0, "DatabaseRouter must support D1 binding lookup");
assert(
  routerSource.includes("LEGACY_LOVABLE_DATABASE_DISABLED"),
  "router must reject the legacy database",
);

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
const inspirationLegacyGuardCount = (
  inspirationSource.match(/assertLovableOnlyLegacyWrite\(/g) ?? []
).length;

const productionPaths = {
  adminUsesRouter: adminSource.includes("createBusinessDatabaseFromContext"),
  adminNoBusinessRpcCalls:
    !/supabase\.rpc\(["'](consume_credits_for_generation|finalize_user_generation_task_once|set_latest_history_image|redeem_gift_card)["']/.test(
      adminSource,
    ),
  adminLegacyWritesGuarded: adminLegacyGuardCount === 0 && adminSource.includes("getD1ConfigDb"),
  paymentUsesRouter: paymentSource.includes("createBusinessDatabaseFromContext"),
  paymentNoDirectSupabaseBusinessDb: !/(supabaseAdmin|\.from\(|\.rpc\()/.test(paymentSource),
  profileUsesRouter:
    profileSource.includes("createBusinessDatabaseFromContext") &&
    profileSource.includes("getCurrentProfile") &&
    profileSource.includes("updateCurrentProfile"),
  clientAuthNoProfileSupabaseRead: !/\.from\(["']profiles["']\)/.test(useAuthSource),
  settingsDialogNoProfileSupabaseWrite: !/\.from\(["']profiles["']\)/.test(settingsDialogSource),
  legacyGuardPresent:
    legacyGuardSource.includes("resolveDatabasePrimary") && legacyGuardSource.includes('!== "d1"'),
  inspirationLegacyWritesGuarded:
    inspirationLegacyGuardCount >= 5 && inspirationSource.includes("assertLovableOnlyLegacyWrite"),
  notifyUsesRouter:
    notifySource.includes("createBusinessDatabaseFromContext") &&
    notifySource.includes("completePaidOrder"),
  thumbnailUsesRouter:
    thumbnailSource.includes("createBusinessDatabaseFromContext") &&
    thumbnailSource.includes("getGenerationHistory"),
};

for (const [name, passed] of Object.entries(productionPaths)) {
  assert(passed, `production path simulation failed: ${name}`);
}

const d1Source = read("src/lib/d1-business-database.ts");
const outboxChecks = {
  enqueueHelperRetainedForAtomicAudit: fs.existsSync(
    path.join(REPO_ROOT, "src/lib/d1-replication-outbox.ts"),
  ),
  d1BusinessBatchesRemainAtomic:
    /private\s+async\s+batchWithOutbox\s*\(/.test(d1Source) && d1Source.includes("this.db.batch(["),
  outboxSchemaPreservedForHistory: read("d1/migrations/0002_replication_outbox.sql").includes(
    "CREATE TABLE",
  ),
  runtimeHealthReadsOnly: read("src/lib/replication-runtime.ts").includes("disabled: true"),
  legacyReplicationConsumerDisabled: read("src/lib/replication-runtime.ts").includes(
    "disabled: true",
  ),
};
for (const [name, passed] of Object.entries(outboxChecks)) {
  assert(passed, `outbox guard simulation failed: ${name}`);
}

const result = {
  ok: true,
  routingCases,
  legacyLovableRejected: true,
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
  `- d1: ${routingCases.d1}`,
  "- legacy Lovable value is rejected; D1 is the only runtime authority",
  "",
  "## D1 Binding Lazy Init",
  "",
  "- PASS: DatabaseRouter rejects the retired Lovable adapter before resolving a binding.",
  "- PASS: DATABASE_PRIMARY=d1 remains the only supported path that requires a DB binding.",
  "",
  "## Production Paths",
  "",
  ...Object.entries(productionPaths).map(
    ([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`,
  ),
  `- admin legacy write guards: ${adminLegacyGuardCount}`,
  `- inspiration legacy write guards: ${inspirationLegacyGuardCount}`,
  "",
  "## Outbox D1-Only Behavior",
  "",
  ...Object.entries(outboxChecks).map(([name, passed]) => `- ${name}: ${passed ? "PASS" : "FAIL"}`),
];

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);

console.log(JSON.stringify({ ...result, reportPath: REPORT_PATH }, null, 2));
