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
  assert.deepEqual(
    plain(
      buildBananaProviderPayload({
        model,
        prompt: "a product photo",
        aspectRatio: "16:9",
        resolution: "2K",
      }),
    ),
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "a product photo\nOutput aspect ratio: 16:9. Preserve this exact aspect ratio.",
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
      },
    },
  );
});

test("Banana reference images use native inline data parts", () => {
  const model = {
    model_key: "banana",
    extra_params: { provider: "banana", model: "gemini-3.1-flash-image-preview" },
  };
  const payload = buildBananaProviderPayload({
    model,
    prompt: "keep the product shape",
    referenceImages: [{ mimeType: "image/png", data: "abc=" }],
  });
  assert.deepEqual(plain(payload.contents[0].parts), [
    {
      text: "keep the product shape",
    },
    { inline_data: { mime_type: "image/png", data: "abc=" } },
  ]);
  assert.equal("imageConfig" in payload.generationConfig, false);
});

test("Banana adaptive ratio omits imageConfig ratio and keeps only supported ratios", () => {
  const model = {
    model_key: "nanobanana2",
    extra_params: { provider: "banana", model: "gemini-3.1-flash-image-preview" },
  };
  const adaptive = buildBananaProviderPayload({
    model,
    prompt: "adaptive image",
    aspectRatio: "auto",
    resolution: "4K",
  });
  assert.deepEqual(plain(adaptive.generationConfig.imageConfig), { imageSize: "4K" });

  const supported = buildBananaProviderPayload({
    model,
    prompt: "portrait image",
    aspectRatio: "4:5",
    resolution: "1K",
  });
  assert.deepEqual(plain(supported.generationConfig.imageConfig), {
    aspectRatio: "4:5",
    imageSize: "1K",
  });

  const unsupported = buildBananaProviderPayload({
    model,
    prompt: "unsupported ratio",
    aspectRatio: "9:21",
    resolution: "8K",
  });
  assert.equal("imageConfig" in unsupported.generationConfig, false);
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
