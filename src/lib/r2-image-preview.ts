import { getStartContext } from "@tanstack/start-storage-context";

const PUBLIC_IMAGE_BASE_URL = "https://img.shuntu.cc";
const PUBLIC_IMAGE_HOST = "img.shuntu.cc";
const GENERATED_IMAGE_KEY_PREFIX = "generated/";
const PREVIEW_KEY_PREFIX = "previews/generated/";
const PREVIEW_CONTENT_TYPE = "image/jpeg";
const PREVIEW_MAX_EDGE = 1024;
const PREVIEW_QUALITY = 78;
const IMAGE_BINDING_MAX_BYTES = 20 * 1024 * 1024;
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

type ImageTransform = {
  width?: number;
  height?: number;
  fit?: "scale-down" | "contain" | "pad" | "squeeze" | "cover" | "crop";
  background?: string;
};

type ImageOutputOptions = {
  format: "image/jpeg";
  quality?: number;
  background?: string;
  anim?: boolean;
};

type ImageTransformationResult = {
  image: (options?: { encoding?: "base64" }) => ReadableStream<Uint8Array>;
  contentType: () => string;
};

type ImageTransformerLike = {
  transform: (transform: ImageTransform) => ImageTransformerLike;
  output: (options: ImageOutputOptions) => Promise<ImageTransformationResult>;
};

type ImagesBindingLike = {
  input: (stream: ReadableStream<Uint8Array>) => ImageTransformerLike;
};

export type CloudflareEnvLike = {
  SHUNTU_GENERATED_IMAGES?: R2BucketLike;
  SOURCE_GENERATED_IMAGES?: R2BucketLike;
  IMAGES?: ImagesBindingLike;
  R2_PUBLIC_BASE_URL?: string;
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

export function getGeneratedPreviewKeyFromOriginalKey(originalKey: string | null | undefined): string | null {
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
  return `${PREVIEW_KEY_PREFIX}${directory ? `${directory}/` : ""}${stem}.jpg`;
}

export function getGeneratedPreviewKeyFromPublicUrl(imageUrl: string | null | undefined): string | null {
  const originalKey = getGeneratedR2KeyFromPublicUrl(imageUrl);
  return getGeneratedPreviewKeyFromOriginalKey(originalKey);
}

export function getGeneratedPreviewPublicUrlFromOriginalUrl(imageUrl: string | null | undefined): string | null {
  const previewKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl);
  if (!previewKey) return null;
  return `${PUBLIC_IMAGE_BASE_URL}/${previewKey}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toByteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([toArrayBuffer(bytes)]).stream() as ReadableStream<Uint8Array>;
}

async function readR2Object(object: R2ObjectLike): Promise<Uint8Array> {
  if (object.arrayBuffer) return new Uint8Array(await object.arrayBuffer());
  return new Uint8Array(await new Response(object.body).arrayBuffer());
}

async function encodeWithImagesBinding(bytes: Uint8Array, images: ImagesBindingLike): Promise<Uint8Array> {
  const result = await images
    .input(toByteStream(bytes))
    .transform({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: "scale-down",
      background: "#000000",
    })
    .output({
      format: PREVIEW_CONTENT_TYPE,
      quality: PREVIEW_QUALITY,
      background: "#000000",
      anim: false,
    });
  if (result.contentType() !== PREVIEW_CONTENT_TYPE) throw new Error("Images binding returned an unexpected format");
  return new Uint8Array(await new Response(result.image()).arrayBuffer());
}

type CloudflareImageRequestInit = RequestInit & {
  cf: {
    image: {
      width: number;
      height: number;
      fit: "scale-down";
      format: "jpeg";
      quality: number;
      background: string;
      anim: false;
      metadata: "none";
    };
  };
};

async function encodeWithImageTransform(imageUrl: string): Promise<Uint8Array> {
  const transformed = await fetch(imageUrl, {
    cf: {
      image: {
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE,
        fit: "scale-down",
        format: "jpeg",
        quality: PREVIEW_QUALITY,
        background: "#000000",
        anim: false,
        metadata: "none",
      },
    },
    headers: { Accept: PREVIEW_CONTENT_TYPE },
  } as CloudflareImageRequestInit);
  if (!transformed.ok || !transformed.body) throw new Error(`Preview transform failed: ${transformed.status}`);
  const contentType = transformed.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (contentType !== PREVIEW_CONTENT_TYPE) throw new Error("Image transform returned an unexpected format");
  return new Uint8Array(await transformed.arrayBuffer());
}

async function createPreviewBytes(imageUrl: string, originalBytes: Uint8Array, env: CloudflareEnvLike): Promise<Uint8Array> {
  if (originalBytes.byteLength <= IMAGE_BINDING_MAX_BYTES && env.IMAGES) {
    try {
      return await encodeWithImagesBinding(originalBytes, env.IMAGES);
    } catch (error) {
      console.warn("[preview] Images binding failed; using transform fallback", error);
    }
  }
  return encodeWithImageTransform(imageUrl);
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
  const previewKey = getGeneratedPreviewKeyFromOriginalKey(originalKey);
  if (!previewKey) return false;
  const env = getCloudflareEnv(cloudflareEnv);
  const bucket = env.SHUNTU_GENERATED_IMAGES;
  if (!bucket?.put) return false;

  if (bucket.get) {
    try {
      if (await bucket.get(previewKey)) return true;
    } catch (error) {
      console.warn("[preview] existing preview lookup failed", error);
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

  const previewBytes = await createPreviewBytes(imageUrl, bytes, env);
  await putGeneratedPreview(previewKey, previewBytes, env);
  return true;
}

export async function ensureGeneratedPreviewFromBytes(
  imageUrl: string,
  originalBytes: Uint8Array,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const originalKey = getGeneratedR2KeyFromPublicUrl(imageUrl);
  const previewKey = getGeneratedPreviewKeyFromOriginalKey(originalKey);
  if (!originalKey || !previewKey) return false;
  const existing = previewInFlight.get(previewKey);
  if (existing) return existing;

  const operation = ensurePreviewInternal(imageUrl, originalKey, originalBytes, cloudflareEnv)
    .catch((error) => {
      console.warn("[preview] best-effort creation failed", error);
      return false;
    })
    .finally(() => {
      if (previewInFlight.get(previewKey) === operation) previewInFlight.delete(previewKey);
    });
  previewInFlight.set(previewKey, operation);
  return operation;
}

export async function ensureGeneratedPreviewFromOriginalUrl(
  imageUrl: string,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const parsed = parseGeneratedImageUrl(imageUrl);
  const previewKey = getGeneratedPreviewKeyFromOriginalKey(parsed?.key);
  if (!parsed || !previewKey) return false;
  const existing = previewInFlight.get(previewKey);
  if (existing) return existing;

  const operation = ensurePreviewInternal(parsed.url.href, parsed.key, null, cloudflareEnv)
    .catch((error) => {
      console.warn("[preview] lazy migration failed", error);
      return false;
    })
    .finally(() => {
      if (previewInFlight.get(previewKey) === operation) previewInFlight.delete(previewKey);
    });
  previewInFlight.set(previewKey, operation);
  return operation;
}

export async function deleteGeneratedPreviewForOriginalUrl(
  imageUrl: string | null | undefined,
  cloudflareEnv?: unknown,
): Promise<boolean> {
  const previewKey = getGeneratedPreviewKeyFromPublicUrl(imageUrl);
  const bucket = getCloudflareEnv(cloudflareEnv).SHUNTU_GENERATED_IMAGES;
  if (!previewKey || !bucket?.delete) return false;
  try {
    await bucket.delete(previewKey);
    return true;
  } catch (error) {
    console.warn("[preview] paired delete failed", error);
    return false;
  }
}

export const GENERATED_PREVIEW_CONTENT_TYPE = PREVIEW_CONTENT_TYPE;
export const GENERATED_PREVIEW_CACHE_CONTROL = "private, max-age=604800";
