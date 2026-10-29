import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/admin.functions.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile(
  "admin.functions.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function findFunction(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      found = node.getText(sourceFile);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(found, `expected function ${name} to exist`);
  return ts.transpileModule(found, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
    .outputText;
}

test("WUYIN key resolution accepts Worker Secret and fails closed when absent", () => {
  const js = `${findFunction("getWorkerGlobalApiKey")}\ngetWorkerGlobalApiKey()`;
  const missingContext = vm.createContext({ process: { env: {} } });
  missingContext.globalThis = missingContext;
  assert.equal(vm.runInContext(js, missingContext), null);

  const configuredContext = vm.createContext({
    process: { env: {} },
    __SHUNTU_CLOUDFLARE_ENV__: { WUYIN_API_KEY: "synthetic-wuyin-key" },
  });
  configuredContext.globalThis = configuredContext;
  assert.equal(vm.runInContext(js, configuredContext), "synthetic-wuyin-key");
});

test("provider success and error responses do not log or return the synthetic key", async () => {
  const js = `${findFunction("fetchWithRetry")}\nfetchWithRetry`;
  const seenLogs = [];
  const successContext = vm.createContext({
    fetch: async (_url, init) => {
      assert.equal(init.headers.Authorization, "synthetic-wuyin-key");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    Response,
    setTimeout,
  });
  const fetchWithRetry = vm.runInContext(js, successContext);
  const ok = await fetchWithRetry(
    "https://provider.invalid/test",
    {
      headers: { Authorization: "synthetic-wuyin-key" },
    },
    { retries: 0 },
  );
  assert.equal(ok.status, 200);
  assert.doesNotMatch(await ok.text(), /synthetic-wuyin-key/);

  const failureContext = vm.createContext({
    fetch: async (_url, init) => {
      assert.equal(init.headers.Authorization, "synthetic-wuyin-key");
      return new Response("upstream unavailable", { status: 503 });
    },
    Response,
    setTimeout,
    console: {
      error: (...args) => seenLogs.push(args.join(" ")),
      log: (...args) => seenLogs.push(args.join(" ")),
    },
  });
  const fetchFailure = vm.runInContext(js, failureContext);
  const failed = await fetchFailure(
    "https://provider.invalid/test",
    {
      headers: { Authorization: "synthetic-wuyin-key" },
    },
    { retries: 0 },
  );
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /synthetic-wuyin-key/);
  assert.equal(
    seenLogs.some((entry) => entry.includes("synthetic-wuyin-key")),
    false,
  );
});

test("admin config API exposes only secret status and never falls back to global_config key", () => {
  const start = source.indexOf("async function loadGlobalConfig");
  const end = source.indexOf("export const adminGetGlobalConfig", start);
  const loader = source.slice(start, end);
  assert.match(loader, /global_api_key:\s*getWorkerGlobalApiKey\(\)/);
  assert.doesNotMatch(loader, /data\?\.global_api_key/);

  const configStart = source.indexOf("export const adminGetGlobalConfig");
  const configEnd = source.indexOf("export const adminUpdateGlobalConfig", configStart);
  const configApi = source.slice(configStart, configEnd);
  assert.match(configApi, /api_key_configured:\s*Boolean/);
  assert.doesNotMatch(configApi, /global_api_key\s*:/);
});
