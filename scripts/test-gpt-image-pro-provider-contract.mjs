import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../src/lib/gpt-image-pro-provider-contract.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: "gpt-image-pro-provider-contract.ts" });

const { normalizeGptImageProQuality, buildGptImageProProviderPayload, validateGptImageProProviderPayload } = module.exports;
for (const [input, expected] of [
  ["auto", "auto"], ["low", "low"], ["medium", "medium"], ["high", "high"],
  ["4k", "auto"], ["2K", "auto"], ["hd", "auto"], ["standard", "auto"], ["unknown", "auto"], ["", "auto"], [undefined, "auto"], [null, "auto"],
]) {
  assert.equal(normalizeGptImageProQuality(input), expected);
}

const payload = buildGptImageProProviderPayload({
  prompt: "contract test",
  aspectRatio: "16:9",
  resolution: "4K",
  providerOptions: { quality: "4k", n: 1, response_format: "b64_json", output_format: "webp", ui_badge_text: "ignored", pricing: 999 },
});
assert.equal(payload.size, "3712x2224");
assert.equal(payload.quality, "auto");
assert.deepEqual(Object.keys(payload).sort(), ["model", "n", "output_format", "prompt", "quality", "response_format", "size"]);
assert.equal("resolution" in payload, false);
assert.equal("ui_badge_text" in payload, false);
assert.equal("pricing" in payload, false);
assert.throws(() => validateGptImageProProviderPayload(payload, 0), /reference image/);

console.log("GPT-IMAGE PRO provider contract tests passed");
