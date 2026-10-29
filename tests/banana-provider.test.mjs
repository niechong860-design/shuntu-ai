import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../src/lib/banana-provider-contract.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(
  javascript,
  { module, exports: module.exports },
  { filename: "banana-provider.js" },
);
const { isBananaModelConfig, buildBananaProviderPayload, extractBananaImageData } = module.exports;

// Functions are evaluated in a VM realm; normalize returned objects before
// strict deep comparison so the assertions check values rather than realm
// specific prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Banana models use the shared provider adapter and model name", () => {
  const model = {
    model_key: "banana_pro",
    extra_params: {
      provider: "banana",
      model: "gemini-3-pro-image-preview",
    },
  };
  assert.equal(isBananaModelConfig(model), true);
  assert.deepEqual(plain(buildBananaProviderPayload({ model, prompt: "a product photo" })), {
    model: "gemini-3-pro-image-preview",
    messages: [{ role: "user", content: "a product photo" }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    stream: false,
  });
});

test("Banana reference images use OpenAI-compatible image_url parts", () => {
  const model = {
    model_key: "banana",
    extra_params: { provider: "banana", model: "gemini-3.1-flash-image-preview" },
  };
  const payload = buildBananaProviderPayload({
    model,
    prompt: "keep the product shape",
    referenceImages: ["https://img.example.test/reference.png"],
  });
  assert.deepEqual(plain(payload.messages[0].content), [
    { type: "text", text: "keep the product shape" },
    { type: "image_url", image_url: { url: "https://img.example.test/reference.png" } },
  ]);
});

test("Banana response data URLs and native inline data are extracted", () => {
  assert.equal(
    extractBananaImageData({ choices: [{ message: { content: "data:image/png;base64,abc=" } }] }),
    "data:image/png;base64,abc=",
  );
  assert.equal(
    extractBananaImageData({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "abc=" } }] } },
      ],
    }),
    "data:image/jpeg;base64,abc=",
  );
  assert.equal(
    extractBananaImageData({
      choices: [
        {
          message: {
            content: [{ type: "image_url", image_url: { url: "data:image/webp;base64,abc=" } }],
          },
        },
      ],
    }),
    "data:image/webp;base64,abc=",
  );
});
