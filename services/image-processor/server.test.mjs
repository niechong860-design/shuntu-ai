import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { createImageProcessorServer } from "./server.mjs";

const token = "test-only-token";
const server = createImageProcessorServer({ token });
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = "http://127.0.0.1:" + address.port;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("health check does not require credentials", async () => {
  const response = await fetch(baseUrl + "/healthz");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("rejects requests without the service token", async () => {
  const response = await fetch(baseUrl + "/v1/previews", {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: Buffer.from("not an image"),
  });
  assert.equal(response.status, 401);
});

test("returns 480px, 1024px, and 1536px JPEG variants", async () => {
  const source = await sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 20, g: 80, b: 140 },
    },
  })
    .png()
    .toBuffer();

  const response = await fetch(baseUrl + "/v1/previews", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "image/png",
    },
    body: source,
  });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.version, 1);
  for (const [size, expectedWidth, expectedHeight] of [
    ["480", 480, 360],
    ["1024", 1024, 768],
    ["1536", 1536, 1152],
  ]) {
    const variant = payload.variants[size];
    assert.equal(variant.contentType, "image/jpeg");
    assert.equal(variant.width, expectedWidth);
    assert.equal(variant.height, expectedHeight);
    const output = Buffer.from(variant.base64, "base64");
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, expectedWidth);
    assert.equal(metadata.height, expectedHeight);
    assert.ok(output.byteLength > 0);
  }
});

test("rejects invalid image data", async () => {
  const response = await fetch(baseUrl + "/v1/previews", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "image/png",
    },
    body: Buffer.from("not an image"),
  });
  assert.equal(response.status, 400);
});
