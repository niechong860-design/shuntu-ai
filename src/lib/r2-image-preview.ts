import { getStartContext } from "@tanstack/start-storage-context";

const PUBLIC_IMAGE_BASE_URL = "https://img.shuntu.cc";
const PUBLIC_IMAGE_HOST = "img.shuntu.cc";
const GENERATED_IMAGE_KEY_PREFIX = "generated/";
const PREVIEW_KEY_PREFIX = "previews/generated/";
const THUMBNAIL_KEY_PREFIX = "previews/480/generated/";
const LARGE_PREVIEW_KEY_PREFIX = "previews/1536/generated/";
const PREVIEW_CONTENT_TYPE = "image/jpeg";
const CLOUDFLARE_ENV_GLOBAL_KEY = "__SHUNTU_CLOUDFLARE_ENV__";

type R2HttpMetadata = {
  contentType?: string;
  cacheControl?: string;
};

export type R2ObjectLike = {
  body: ReadableStream<Uint8Array>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  httpEtag?: string;
  httpMetadata?: R2HttpMetadata;
};

export type R2BucketLike = {
  get?: (key: string) => Promise<R2ObjectLike | null>;
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: R2HttpMetadata },
  ) => Promise<unknown>;
  delete?: (key: string) => Promise<unknown>;
};

export type CloudflareEnvLike = {
  SHUNTU_GENERATED_IMAGES?: R2BucketLike;
  SOURCE_GENERATED_IMAGES?: R2BucketLike;
  R2_PUBLIC_BASE_URL?: string;
  SHARP_IMAGE_PROCESSOR_URL?: string;
  SHARP_IMAGE_PROCESSOR_TOKEN?: string;
  SHARP_IMAGE_PROCESSOR?: {
    getByName: (name: string) => { fetch: (request: Request) => Promise<Response> };
  };
};

const previewInFlight = new Map<string, Promise<boolean>>();

function getRawCloudflareGlobalEnv(): unknown {
  const globalRecord = globalThis as Record<string, unknown>;
  return globalRecord[CLOUDFLARE_ENV_GLOBAL_KEY] ?? globalRecord.__env__;
}

function getRawCloudflareContextEnv(): unknown {
  const startContext = getStartContext({ throwIfNotFound: false });
  const context = startContext?.contextAfterGlobalMiddlewares as
    | { cloudflare?: { env?: unknown }; cloudflareEnv?: unknown }
    | undefined;
  return context?.cloudflare?.env ?? context?.cloudflareEnv;
}

export function getCloudflareEnv(explicitEnv?: unknown): CloudflareEnvLike {
  const contextEnv = getRawCloudflareContextEnv();
  const globalEnv = getRawCloudflareGlobalEnv();
  const explicit = explicitEnv && typeof explicitEnv === "object" ? (explicitEnv as CloudflareEnvLike) : {};
  const context = contextEnv && typeof contextEnv === "object" ? (contextEnv as CloudflareEnvLike) : {};
  const global = globalEnv && typeof globalEnv === "object" ? (globalEnv as CloudflareEnvLike) : {};
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  return {
    ...global,
    ...context,
    ...explicit,
    R2_PUBLIC_BASE_URL:
      explicit.R2_PUBLIC_BASE_URL ??
      context.R2_PUBLIC_BASE_URL ??
      global.R2_PUBLIC_BASE_URL ??
      processEnv?.R2_PUBLIC_BASE_URL ??
      PUBLIC_IMAGE_BASE_URL,
    SHARP_IMAGE_PROCESSOR_URL:
      explicit.SHARP_IMAGE_PROCESSOR_URL ??
      context.SHARP_IMAGE_PROCESSOR_URL ??
      global.SHARP_IMAGE_PROCESSOR_URL ??
      processEnv?.SHARP_IMAGE_PROCESSOR_URL,
    SHARP_IMAGE_PROCESSOR_TOKEN:
      explicit.SHARP_IMAGE_PROCESSOR_TOKEN ??
      context.SHARP_IMAGE_PROCESSOR_TOKEN ??
      global.SHARP_IMAGE_PROCESSOR_TOKEN ??
      processEnv?.SHARP_IMAGE_PROCESSOR_TOKEN,
  };
}

function decodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseGeneratedImageUrl(imageUrl: string | null | undefined): { url: URL; key: string } | null {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== PUBLIC_IMAGE_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return null;
    if (!url.pathname.startsWith(`/${GENERATED_IMAGE_KEY_PREFIX}`)) return null;

    const rawSegments = url.pathname.slice(1).split("/");
    if (rawSegments[0] !== "generated" || rawSegments.some((segment) => !segment)) return null;
    const segments = rawSegments.map(decodePathSegment);
    if (segments.some((segment) => segment === null)) return null;
    const key = segments.join("/");
    if (!key.startsWith(GENERATED_IMAGE_KEY_PREFIX)) return null;
    return { url, key };
  } catch {
    return null;
  }
}

export function getGeneratedR2KeyFromPublicUrl(imageUrl: string | null | undefined): string | null {
  return parseGeneratedImageUrl(imageUrl)?.key ?? null;
}

export function getGeneratedPreviewKeyFromOriginalKey(
  originalKey: string | null | undefined,
  size: 480 | 1024 | 1536 = 1024,
): string | null {
  if (!originalKey?.startsWith(GENERATED_IMAGE_KEY_PREFIX)) return null;
  const segments = originalKey.split("/");
  if (segments.length < 2 || segments.some((segment) => !decodePathSegment(segment))) return null;

  const filename = segments[segments.length - 1];
  if (!filename) return null;
  const extensionIndex = filename.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === filename.length - 1) return null;

  const stem = filename.slice(0, extensionIndex);
  const extension = filename.slice(extensionIndex + 1).toLowerCase();
  if (!stem || !/^(?:png|jpe?g|webp)$/i.test(extension)) return null;
  const directory = segments.slice(1, -1).join("/");
  const prefix = size === 480 ? THUMBNAIL_KEY_PREFIX : size === 1536 ? LARGE_PREVIEW_KEY_PREFIX : PREVIEW_KEY_PREFIX;
  return prefix + (directory ? directory + "/" : "") + stem + ".jpg";
}

export function getGeneratedPreviewKeyFromPublicUrl(
  imageUrl: string | null | undefined,
  size: 480 | 1024 | 1536 = 1024,
): string | null {
  const originalKey = getGeneratedR2KeyFromPublicUrl(imageUrl);
  return getGeneratedPreviewKeyFromOriginalKey(originalKey, size);
}

export function getGeneratedPreviewPublicUrlFromOriginalUrl(
  imageUrl: string | null | undefined,
  size: 480 | 1024 | 1536 = 1024,
): string | null {
  const previewKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl, size);
  if (!previewKey) return null;
  return `${PUBLIC_IMAGE_BASE_URL}/${previewKey}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readR2Object(object: R2ObjectLike): Promise<Uint8Array> {
  if (object.arrayBuffer) return new Uint8Array(await object.arrayBuffer());
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

type SharpPreviewVariant = {
  contentType: string;
  width: number;
  height: number;
  base64: string;
};

type SharpPreviewPayload = {
  version: number;
  variants: {
    "480": SharpPreviewVariant;
    "1024": SharpPreviewVariant;
    "1536": SharpPreviewVariant;
  };
};

function getOriginalContentType(originalKey: string): string {
  const extension = originalKey.slice(originalKey.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
}

function decodeBase64Image(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function createSharpPreviewBytes(
  originalKey: string,
  originalBytes: Uint8Array,
  env: CloudflareEnvLike,
): Promise<{ "480": Uint8Array; "1024": Uint8Array; "1536": Uint8Array } | null> {
  const rawProcessorUrl = env.SHARP_IMAGE_PROCESSOR_URL?.trim();
  const token = env.SHARP_IMAGE_PROCESSOR_TOKEN?.trim();
  if (!token) {
    console.warn('[preview] Sharp image processor token is not configured');
    return null;
  }

  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': getOriginalContentType(originalKey),
    Accept: 'application/json',
  };
  const container = env.SHARP_IMAGE_PROCESSOR;
  let response: Response;
  if (container) {
    response = await container.getByName('sharp-image-processor').fetch(new Request('http://container/v1/previews', {
      method: 'POST',
      headers,
      body: toArrayBuffer(originalBytes),
      signal: AbortSignal.timeout(120_000),
    }));
  } else {
    if (!rawProcessorUrl) {
      console.warn('[preview] Sharp image processor is not configured');
      return null;
    }
    let processorUrl: URL;
    try {
      processorUrl = new URL(rawProcessorUrl);
    } catch {
      throw new Error('Sharp image processor URL is invalid');
    }
    if (processorUrl.protocol !== 'https:' || processorUrl.username || processorUrl.password || processorUrl.search || processorUrl.hash) {
      throw new Error('Sharp image processor URL must be a clean HTTPS URL');
    }
    processorUrl.pathname = processorUrl.pathname.replace(/\/+$/, '') + '/v1/previews';
    response = await fetch(processorUrl, {
      method: 'POST',
      headers,
      body: toArrayBuffer(originalBytes),
      signal: AbortSignal.timeout(20_000),
    });
  }
  if (!response.ok) throw new Error('Sharp image processor failed: ' + response.status);

  const payload = await response.json() as Partial<SharpPreviewPayload>;
  const small = payload.variants?.['480'];
  const medium = payload.variants?.['1024'];
  // Older container images only return 480/1024. Reuse the medium variant
  // until the new image is active so existing generations remain viewable.
  const large = payload.variants?.['1536'] ?? medium;
  if (
    payload.version !== 1 ||
    !small ||
    !medium ||
    !large ||
    small.contentType !== PREVIEW_CONTENT_TYPE ||
    medium.contentType !== PREVIEW_CONTENT_TYPE ||
    large.contentType !== PREVIEW_CONTENT_TYPE ||
    !Number.isInteger(small.width) ||
    !Number.isInteger(small.height) ||
    !Number.isInteger(medium.width) ||
    !Number.isInteger(medium.height) ||
    !Number.isInteger(large.width) ||
    !Number.isInteger(large.height) ||
    small.width > 480 ||
    small.height > 480 ||
    medium.width > 1024 ||
    medium.height > 1024 ||
    large.width > 1536 ||
    large.height > 1536 ||
    !small.base64 ||
    !medium.base64 ||
    !large.base64
  ) {
    throw new Error('Sharp image processor returned an invalid preview payload');
  }

  return {
    '480': decodeBase64Image(small.base64),
    '1024': decodeBase64Image(medium.base64),
    '1536': decodeBase64Image(large.base64),
  };
}

export async function getGeneratedPreviewObject(
  previewKey: string,
  cloudflareEnv?: unknown,
): Promise<R2ObjectLike | null> {
  const bucket = getCloudflareEnv(cloudflareEnv).SHUNTU_GENERATED_IMAGES;
  if (!bucket?.get) return null;
  return bucket.get(previewKey);
}

export async function putGeneratedPreview(
  previewKey: string,
  bytes: Uint8Array,
  cloudflareEnv?: unknown,
): Promise<void> {
  const bucket = getCloudflareEnv(cloudflareEnv).SHUNTU_GENERATED_IMAGES;
  if (!bucket) throw new Error("R2 generated image bucket is unavailable");
  await bucket.put(previewKey, toArrayBuffer(bytes), {
    httpMetadata: {
      contentType: PREVIEW_CONTENT_TYPE,
      cacheControl: "private, max-age=604800",
    },
  });
}

async function ensurePreviewInternal(
  imageUrl: string,
  originalKey: string,
  originalBytes: Uint8Array | null,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const previewKey = getGeneratedPreviewKeyFromOriginalKey(originalKey, 1024);
  const largePreviewKey = getGeneratedPreviewKeyFromOriginalKey(originalKey, 1536);
  const thumbnailKey = getGeneratedPreviewKeyFromOriginalKey(originalKey, 480);
  if (!previewKey || !largePreviewKey || !thumbnailKey) return false;
  const env = getCloudflareEnv(cloudflareEnv);
  const bucket = env.SHUNTU_GENERATED_IMAGES;
  if (!bucket?.put) return false;

  if (bucket.get) {
    try {
      const [preview, largePreview, thumbnail] = await Promise.all([
        bucket.get(previewKey),
        bucket.get(largePreviewKey),
        bucket.get(thumbnailKey),
      ]);
      if (preview && largePreview && thumbnail) return true;
    } catch (error) {
      console.warn('[preview] existing preview lookup failed', error);
    }
  }

  let bytes = originalBytes;
  const sourceBuckets = [env.SOURCE_GENERATED_IMAGES, bucket].filter(
    (candidate, index, list): candidate is R2BucketLike => !!candidate?.get && list.indexOf(candidate) === index,
  );
  if (!bytes) {
    for (const sourceBucket of sourceBuckets) {
      const originalObject = await sourceBucket.get?.(originalKey);
      if (!originalObject) continue;
      bytes = await readR2Object(originalObject);
      break;
    }
  }
  if (!bytes) return false;

  const previewBytes = await createSharpPreviewBytes(originalKey, bytes, env);
  if (!previewBytes) return false;
  await Promise.all([
    putGeneratedPreview(previewKey, previewBytes['1024'], env),
    putGeneratedPreview(largePreviewKey, previewBytes['1536'], env),
    putGeneratedPreview(thumbnailKey, previewBytes['480'], env),
  ]);
  return true;
}

export async function ensureGeneratedPreviewFromBytes(
  imageUrl: string,
  originalBytes: Uint8Array,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const originalKey = getGeneratedR2KeyFromPublicUrl(imageUrl);
  if (!originalKey) return false;
  const existing = previewInFlight.get(originalKey);
  if (existing) return existing;

  const operation = ensurePreviewInternal(imageUrl, originalKey, originalBytes, cloudflareEnv)
    .catch((error) => {
      console.warn('[preview] best-effort creation failed', error);
      return false;
    })
    .finally(() => {
      if (previewInFlight.get(originalKey) === operation) previewInFlight.delete(originalKey);
    });
  previewInFlight.set(originalKey, operation);
  return operation;
}

export async function ensureGeneratedPreviewFromOriginalUrl(
  imageUrl: string,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const parsed = parseGeneratedImageUrl(imageUrl);
  if (!parsed) return false;
  const existing = previewInFlight.get(parsed.key);
  if (existing) return existing;

  const operation = ensurePreviewInternal(parsed.url.href, parsed.key, null, cloudflareEnv)
    .catch((error) => {
      console.warn('[preview] lazy migration failed', error);
      return false;
    })
    .finally(() => {
      if (previewInFlight.get(parsed.key) === operation) previewInFlight.delete(parsed.key);
    });
  previewInFlight.set(parsed.key, operation);
  return operation;
}

export async function deleteGeneratedPreviewForOriginalUrl(
  imageUrl: string | null | undefined,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const previewKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl, 1024);
  const largePreviewKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl, 1536);
  const thumbnailKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl, 480);
  const bucket = getCloudflareEnv(cloudflareEnv).SHUNTU_GENERATED_IMAGES;
  if (!previewKey || !largePreviewKey || !thumbnailKey || !bucket?.delete) return false;
  try {
    await Promise.all([bucket.delete(previewKey), bucket.delete(largePreviewKey), bucket.delete(thumbnailKey)]);
    return true;
  } catch (error) {
    console.warn('[preview] paired delete failed', error);
    return false;
  }
}

export const GENERATED_PREVIEW_CONTENT_TYPE = PREVIEW_CONTENT_TYPE;
export const GENERATED_PREVIEW_CACHE_CONTROL = "private, max-age=604800";
