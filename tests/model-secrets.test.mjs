import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/model-secrets.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(
  javascript,
  { module, exports: module.exports, Object },
  { filename: "model-secrets.js" },
);
const { MODEL_SECRET_REFERENCES, getModelSecretStatus, resolveModelSecret } = module.exports;

test("each model credential uses an explicit, distinct allowlisted Worker Secret", () => {
  assert.equal(new Set(MODEL_SECRET_REFERENCES).size, 5);
  const env = {
    WUYIN_MODEL_GPT_IMAGE_2_API_KEY: "synthetic-one",
    WUYIN_MODEL_NANOBANANA2_API_KEY: "synthetic-two",
    WUYIN_MODEL_NANOBANANA_API_KEY: "synthetic-three",
    VIBELEARNING_GPT_IMAGE_2_BACKUP_API_KEY: "synthetic-four",
    VIBELEARNING_GPT_IMAGE_2_NATIVE_PRO_API_KEY: "synthetic-five",
  };
  for (const reference of MODEL_SECRET_REFERENCES) {
    assert.equal(getModelSecretStatus(reference, env), true);
    assert.ok(resolveModelSecret(reference, env).startsWith("synthetic-"));
  }
});

test("missing and unknown references fail closed without a fallback", () => {
  assert.equal(
    getModelSecretStatus("unknown:provider", { WUYIN_API_KEY: "synthetic-global" }),
    false,
  );
  assert.throws(
    () => resolveModelSecret("unknown:provider", { WUYIN_API_KEY: "synthetic-global" }),
    /MODEL_SECRET_REFERENCE_UNKNOWN/,
  );
  assert.throws(
    () => resolveModelSecret("wuyin:gpt-image-2", { WUYIN_API_KEY: "synthetic-global" }),
    /MODEL_SECRET_NOT_CONFIGURED/,
  );
  assert.throws(() => resolveModelSecret(null, {}), /MODEL_SECRET_REFERENCE_MISSING/);
});

test("Worker secret values are normalized for Authorization and remain outside APIs", () => {
  assert.equal(
    resolveModelSecret("vibelearning:gpt_image_2_backup", {
      VIBELEARNING_GPT_IMAGE_2_BACKUP_API_KEY: " Bearer synthetic-secret ",
    }),
    "synthetic-secret",
  );
  const admin = fs.readFileSync(new URL("../src/lib/admin.functions.ts", import.meta.url), "utf8");
  const publicListStart = admin.indexOf("export const listModelsConfig");
  const publicListEnd = admin.indexOf("export const adminListModelsConfig", publicListStart);
  const publicList = admin.slice(publicListStart, publicListEnd);
  assert.match(publicList, /secret_ref:\s*_secretRef/);
  assert.doesNotMatch(publicList, /api_key/);
  const modelsPanel = fs.readFileSync(
    new URL("../src/components/admin/ModelsPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(modelsPanel, /api_key\s*:/);
  assert.doesNotMatch(modelsPanel, /state\.api_key|r\.api_key\s*(?:\?|\)|\}|,)|maskKey/);
  assert.doesNotMatch(modelsPanel, /placeholder="sk-/);
  const adapter = fs.readFileSync(
    new URL("../src/lib/d1-business-database.ts", import.meta.url),
    "utf8",
  );
  assert.match(adapter, /MODEL_API_KEY_D1_STORAGE_DISABLED/);
});
