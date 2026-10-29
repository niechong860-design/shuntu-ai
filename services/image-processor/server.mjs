import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_INPUT_PIXELS = 100_000_000;
const VARIANTS = [
  { size: 480, quality: 78 },
  { size: 1024, quality: 88 },
  { size: 1536, quality: 90 },
];
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
  });
  response.end(body);
}

function isAuthorized(request, token) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(token);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

async function readImageBody(request) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAX_INPUT_BYTES) {
      const error = new Error("Image exceeds the maximum input size");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (byteLength === 0) {
    const error = new Error("Image body is empty");
    error.statusCode = 400;
    throw error;
  }
  return Buffer.concat(chunks, byteLength);
}

export async function createPreviewPayload(imageBytes) {
  const source = sharp(imageBytes, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  const metadata = await source.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !metadata.format ||
    !["png", "jpeg", "webp"].includes(metadata.format)
  ) {
    const error = new Error("Unsupported or invalid image");
    error.statusCode = 400;
    throw error;
  }

  const variants = {};
  for (const variant of VARIANTS) {
    const { data, info } = await sharp(imageBytes, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: variant.size,
        height: variant.size,
        fit: "inside",
        withoutEnlargement: true,
      })
      .sharpen(variant.size === 480 ? 0.4 : 0.65)
      .jpeg({
        quality: variant.quality,
        chromaSubsampling: "4:4:4",
        mozjpeg: true,
        progressive: true,
      })
      .toBuffer({ resolveWithObject: true });

    variants[variant.size] = {
      contentType: "image/jpeg",
      width: info.width,
      height: info.height,
      base64: data.toString("base64"),
    };
  }

  return { version: 1, variants };
}

export function createImageProcessorServer({ token }) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/v1/previews") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (!token) {
      sendJson(response, 503, { error: "Image processor is not configured" });
      return;
    }
    if (!isAuthorized(request, token)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const contentType =
      request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      sendJson(response, 415, { error: "Unsupported image content type" });
      return;
    }

    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (contentLength > MAX_INPUT_BYTES) {
      sendJson(response, 413, { error: "Image exceeds the maximum input size" });
      return;
    }

    try {
      const bytes = await readImageBody(request);
      const payload = await createPreviewPayload(bytes);
      sendJson(response, 200, payload);
    } catch (error) {
      const status = Number(error?.statusCode) || 400;
      sendJson(response, status, {
        error: status === 413 ? "Image exceeds the maximum input size" : "Unable to process image",
      });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const port = Math.min(65535, Math.max(1, Number(process.env.PORT ?? 8080)));
  const token = process.env.SHARP_IMAGE_PROCESSOR_TOKEN;
  const server = createImageProcessorServer({ token });
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write("Sharp image processor listening on port " + port + "\n");
  });
}
