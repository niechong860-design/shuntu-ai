import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSource = readFileSync(new URL("../src/lib/admin.functions.ts", import.meta.url), "utf8");
const d1AuthSource = readFileSync(new URL("../src/lib/d1-bearer-auth.ts", import.meta.url), "utf8");
const modelSecretsSource = readFileSync(
  new URL("../src/lib/model-secrets.ts", import.meta.url),
  "utf8",
);

test("admin role check is D1-backed and server protected", () => {
  const start = adminSource.indexOf("export const checkIsAdmin");
  const end = adminSource.indexOf("// --- Analytics ---", start);
  const block = adminSource.slice(start, end);
  assert.match(block, /middleware\(\[requireD1Auth\]\)/);
  assert.match(block, /rolesFor\(context\.userId\)/);
  assert.match(d1AuthSource, /prepare\("SELECT role FROM user_roles WHERE user_id=\?"\)/);
  assert.doesNotMatch(block, /supabaseAdmin|process\.env/);
});

test("global configuration API never returns or accepts an API key", () => {
  const start = adminSource.indexOf("export const adminGetGlobalConfig");
  const end = adminSource.indexOf("function resolveUrl", start);
  const block = adminSource.slice(start, end);
  assert.match(block, /api_key_configured/);
  assert.doesNotMatch(block, /global_api_key:\s*data|global_api_key:\s*data\./);
  assert.doesNotMatch(block, /global_api_key:\s*data\?\./);
  assert.doesNotMatch(block, /global_api_key:\s*z\./);
});

test("global upstream API key is read only from Worker secret at runtime", () => {
  const start = adminSource.indexOf("async function loadGlobalConfig");
  const end = adminSource.indexOf("export const adminGetGlobalConfig", start);
  const block = adminSource.slice(start, end);
  assert.match(block, /global_api_key:\s*getWorkerGlobalApiKey\(\)/);
  assert.doesNotMatch(block, /data\?\.global_api_key/);
});

test("model administration keeps provider keys write-only", () => {
  const start = adminSource.indexOf("export const adminListModelsConfig");
  const end = adminSource.indexOf("export const adminUpdateModelPrice", start);
  const block = adminSource.slice(start, end);
  assert.match(block, /getModelSecretStatus\(_secretRef\)/);
  assert.match(modelSecretsSource, /SECRET_BY_REFERENCE/);
  assert.match(modelSecretsSource, /envValue\(SECRET_BY_REFERENCE\[/);
  assert.match(block, /api_key:\s*_legacyKey/);
  assert.doesNotMatch(block, /secret_configured:\s*[^,\n]*api_key/);
  assert.match(block, /secret_configured/);
});

test("admin recharge and founder role operations are D1-only", () => {
  assert.doesNotMatch(adminSource, /supabaseAdmin/);
  for (const marker of [
    "listAdminRechargePackages",
    "founderListAdmins",
    "founderAddAdmin",
    "founderRemoveAdmin",
  ]) {
    const start = adminSource.indexOf(`export const ${marker}`);
    assert.ok(start >= 0, `${marker} should exist`);
    const end = adminSource.indexOf("export const ", start + 1);
    const block = adminSource.slice(start, end < 0 ? undefined : end);
    assert.match(block, /requireD1Auth/);
    assert.match(block, /D1/);
    assert.doesNotMatch(block, /supabaseAdmin|lovable-business-database/);
  }
});
