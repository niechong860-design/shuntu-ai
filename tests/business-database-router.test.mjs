import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadCommonJs(source, filename, dependencies = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(specifier) {
      if (specifier in dependencies) return dependencies[specifier];
      throw new Error(`Unexpected test dependency: ${specifier}`);
    },
    process: { env: {} },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename });
  return module.exports;
}

const primary = loadCommonJs(
  fs.readFileSync(new URL("../src/lib/database-primary.ts", import.meta.url), "utf8"),
  "database-primary.cjs",
);
class FakeD1BusinessDatabase {
  constructor(binding) {
    this.binding = binding;
  }
}
const router = loadCommonJs(
  fs.readFileSync(new URL("../src/lib/business-database-router.ts", import.meta.url), "utf8"),
  "business-database-router.cjs",
  {
    "@/lib/d1-business-database": { D1BusinessDatabase: FakeD1BusinessDatabase },
    "@/lib/database-primary": primary,
  },
);

test("database router fails closed when D1 binding is absent", () => {
  assert.throws(
    () => new router.DatabaseRouter({ env: {} }).database,
    /D1_DATABASE_BINDING_MISSING/,
  );
  assert.throws(
    () => new router.DatabaseRouter({ env: { DATABASE_PRIMARY: "lovable" } }).database,
    /LEGACY_LOVABLE_DATABASE_DISABLED/,
  );
});

test("database router uses only D1 and never allows a legacy read fallback", () => {
  const binding = { prepare() {} };
  const database = new router.DatabaseRouter({ env: { DB: binding } }).database;
  assert.ok(database instanceof FakeD1BusinessDatabase);
  assert.equal(database.binding, binding);
  assert.equal(
    primary.shouldAllowWarmStandbyReadFallback({
      primary: "d1",
      className: "critical_business",
      d1Error: new Error("synthetic"),
    }),
    false,
  );
  assert.equal(
    primary.shouldAllowWarmStandbyReadFallback({
      primary: "d1",
      className: "non_critical_config",
      d1Error: new Error("synthetic"),
    }),
    false,
  );
});
