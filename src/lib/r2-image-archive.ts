type R2BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
};

type CloudflareEnvLike = {
  SHUNTU_GENERATED_IMAGES?: R2BucketLike;
  R2_PUBLIC_BASE_URL?: string;
};

type ArchiveGeneratedImageInput = {
  imageUrl: string;
  taskId: string;
  userId?: string | null;
  modelKey?: string | null;
};

const PUBLIC_IMAGE_BASE_URL = "https://img.shuntu.cc";
const CLOUDFLARE_ENV_GLOBAL_KEY = "__SHUNTU_CLOUDFLARE_ENV__";

function getRawCloudflareGlobalEnv(): unknown {
  return (globalThis as Record<string, unknown>)[CLOUDFLARE_ENV_GLOBAL_KEY];
}

function getCloudflareEnv(): CloudflareEnvLike {
  const globalEnv = getRawCloudflareGlobalEnv();
  const cloudflareEnv = globalEnv && typeof globalEnv === "object" ? (globalEnv as CloudflareEnvLike) : {};
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  return {
    ...cloudflareEnv,
    R2_PUBLIC_BASE_URL: processEnv?.R2_PUBLIC_BASE_URL ?? cloudflareEnv.R2_PUBLIC_BASE_URL,
  };
}

function warnArchive(stage: string, data: Record<string, unknown>) {
  console.warn("[r2-image-archive]", { stage, ...data });
}

function getImageUrlHost(imageUrl: string): string | null {
  try {
    return new URL(imageUrl).host;
  } catch {
    return null;
  }
}

function normalizePublicBaseUrl(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  return trimmed || null;
}

function getExtension(contentType: string): "png" | "jpg" | "webp" {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return "jpg";
  if (normalized.includes("image/webp")) return "webp";
  return "png";
}

function getArchiveKey(taskId: string, extension: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `generated/${year}/${month}/${safeTaskId}.${extension}`;
}

export async function archiveGeneratedImageToR2({
  imageUrl,
  taskId,
  userId,
  modelKey,
}: ArchiveGeneratedImageInput): Promise<string> {
  warnArchive("entered", {
    taskId,
    modelKey: modelKey ?? null,
    imageUrlHost: getImageUrlHost(imageUrl),
  });

  if (!imageUrl) return imageUrl;
  if (imageUrl.startsWith(`${PUBLIC_IMAGE_BASE_URL}/`) || imageUrl === PUBLIC_IMAGE_BASE_URL) {
    return imageUrl;
  }

  const globalEnv = getRawCloudflareGlobalEnv();
  const hasGlobalEnv = !!globalEnv && typeof globalEnv === "object";
  const globalEnvKeys = hasGlobalEnv ? Object.keys(globalEnv as Record<string, unknown>) : [];
  const env = getCloudflareEnv();
  const bucket = env.SHUNTU_GENERATED_IMAGES;
  const publicBaseUrl = normalizePublicBaseUrl(env.R2_PUBLIC_BASE_URL);
  warnArchive("env_check", {
    hasGlobalEnv,
    globalEnvKeys,
    hasBucket: !!bucket,
    hasBucketPut: typeof bucket?.put === "function",
    publicBaseUrl,
  });

  if (!bucket || typeof bucket.put !== "function" || !publicBaseUrl) {
    warnArchive("missing_config", {
      taskId,
      userId: userId ?? null,
      modelKey: modelKey ?? null,
      hasBucket: !!bucket,
      hasPublicBaseUrl: !!publicBaseUrl,
    });
    return imageUrl;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      warnArchive("fetch_failed", { taskId, userId: userId ?? null, modelKey: modelKey ?? null, status: response.status });
      return imageUrl;
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      warnArchive("invalid_content_type", { taskId, userId: userId ?? null, modelKey: modelKey ?? null, contentType });
      return imageUrl;
    }

    const extension = getExtension(contentType);
    const key = getArchiveKey(taskId, extension);
    const body = await response.arrayBuffer();
    await bucket.put(key, body, { httpMetadata: { contentType } });
    const finalUrl = `${publicBaseUrl}/${key}`;
    warnArchive("put_success", { key, finalUrl });
    return finalUrl;
  } catch (error) {
    warnArchive("archive_failed", {
      taskId,
      userId: userId ?? null,
      modelKey: modelKey ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    return imageUrl;
  }
}
