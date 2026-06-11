import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FoxApiConfig = {
  baseUrl: string;
  apiKey: string;
};

export type FoxApiSubmitResult =
  | { ok: true; taskId: string; elapsedMs: number }
  | { ok: false; message: string; elapsedMs: number };

export type FoxApiPollResult =
  | { status: "running"; taskId: string; providerStatus: string | null; imageUrl: null; message: string | null; elapsedMs: number }
  | { status: "succeeded"; taskId: string; providerStatus: string | null; imageUrl: string; message: null; elapsedMs: number }
  | { status: "failed"; taskId: string; providerStatus: string | null; imageUrl: null; message: string; elapsedMs: number };

type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";

type FoxApiBase64Image = {
  base64: string;
  mimeType: SupportedImageMimeType;
};

const FOXAPI_RESULT_BUCKET = "case-images";
const FOXAPI_RESULT_PREFIX = "foxapi-results";
const MAX_FOXAPI_IMAGE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set<SupportedImageMimeType>(["image/png", "image/jpeg", "image/webp"]);

export function loadFoxApiConfig(): FoxApiConfig {
  const baseUrl = (process.env.FOXAPI_BASE_URL || "https://foxapi.chat").replace(/\/+$/, "");
  const apiKey = String(process.env.FOXAPI_API_KEY ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) throw new Error("FOXAPI_API_KEY is not configured");
  return { baseUrl, apiKey };
}

function safeLog(
  stage: string,
  data: { taskId?: string | null; status?: string | null; elapsedMs?: number | null; uploadPath?: string | null; bodySnippet?: string | null } = {},
) {
  console.log("[foxapi-backup]", {
    stage,
    taskId: data.taskId ?? null,
    status: data.status ?? null,
    elapsedMs: data.elapsedMs ?? null,
    uploadPath: data.uploadPath ?? null,
    bodySnippet: data.bodySnippet ?? null,
  });
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractTaskId(payload: any): string | null {
  const candidates = [
    payload?.task_id,
    payload?.taskId,
    payload?.id,
    payload?.data?.task_id,
    payload?.data?.taskId,
    payload?.data?.id,
    payload?.result?.task_id,
    payload?.result?.taskId,
    payload?.result?.id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  if (typeof payload?.data === "string" && payload.data.trim()) return payload.data.trim();
  return null;
}

function extractStatus(payload: any): string | null {
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.task_status,
    payload?.data?.status,
    payload?.data?.state,
    payload?.data?.task_status,
    payload?.result?.status,
    payload?.result?.state,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return null;
}

function extractImageUrl(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string" && /^https?:\/\//i.test(payload)) return payload;

  const candidates = [
    payload?.url,
    payload?.image_url,
    payload?.imageUrl,
    payload?.output_url,
    payload?.result_url,
    payload?.data?.url,
    payload?.data?.image_url,
    payload?.data?.imageUrl,
    payload?.data?.output_url,
    payload?.data?.result_url,
    payload?.data?.[0]?.url,
    payload?.data?.[0]?.image_url,
    payload?.data?.[0]?.imageUrl,
    payload?.result?.url,
    payload?.result?.image_url,
    payload?.result?.imageUrl,
    payload?.result?.output_url,
    payload?.result?.data?.[0]?.url,
    payload?.result?.data?.[0]?.image_url,
    payload?.result?.data?.[0]?.imageUrl,
    payload?.images?.[0]?.url,
    payload?.images?.[0],
    payload?.data?.images?.[0]?.url,
    payload?.data?.images?.[0],
    payload?.result?.images?.[0]?.url,
    payload?.result?.images?.[0],
    payload?.output?.[0]?.url,
    payload?.output?.[0],
    payload?.data?.output?.[0]?.url,
    payload?.data?.output?.[0],
  ];

  for (const value of candidates) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }

  return null;
}

function normalizeImageMimeType(value: unknown): SupportedImageMimeType | null {
  if (typeof value !== "string") return null;
  const mimeType = value.trim().toLowerCase();
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType as SupportedImageMimeType) ? (mimeType as SupportedImageMimeType) : null;
}

function parseBase64Image(value: unknown, mimeHint?: unknown): FoxApiBase64Image | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,(.+)$/is);
  if (dataUrlMatch) {
    const mimeType = normalizeImageMimeType(dataUrlMatch[1]);
    if (!mimeType) return null;
    return { base64: dataUrlMatch[2].replace(/\s/g, ""), mimeType };
  }

  return {
    base64: trimmed.replace(/\s/g, ""),
    mimeType: normalizeImageMimeType(mimeHint) ?? "image/png",
  };
}

function extractBase64Image(payload: any): FoxApiBase64Image | null {
  const candidates = [
    { value: payload?.data?.[0]?.b64_json, mimeType: payload?.data?.[0]?.mime_type ?? payload?.data?.[0]?.mimeType },
    { value: payload?.result?.data?.[0]?.b64_json, mimeType: payload?.result?.data?.[0]?.mime_type ?? payload?.result?.data?.[0]?.mimeType },
    { value: payload?.result?.b64_json, mimeType: payload?.result?.mime_type ?? payload?.result?.mimeType },
    { value: payload?.result?.base64, mimeType: payload?.result?.mime_type ?? payload?.result?.mimeType },
    { value: payload?.data?.base64, mimeType: payload?.data?.mime_type ?? payload?.data?.mimeType },
    { value: payload?.image_base64, mimeType: payload?.mime_type ?? payload?.mimeType },
  ];

  for (const candidate of candidates) {
    const image = parseBase64Image(candidate.value, candidate.mimeType);
    if (image) return image;
  }

  return null;
}

function getImageExtension(mimeType: SupportedImageMimeType): "png" | "jpg" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function getUploadPath(taskId: string, mimeType: SupportedImageMimeType): string {
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${FOXAPI_RESULT_PREFIX}/${safeTaskId}.${getImageExtension(mimeType)}`;
}

function decodeBase64Image(image: FoxApiBase64Image): { arrayBuffer: ArrayBuffer; mimeType: SupportedImageMimeType } | { error: string } {
  const normalizedBase64 = image.base64.replace(/\s/g, "");
  const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4) - (normalizedBase64.endsWith("==") ? 2 : normalizedBase64.endsWith("=") ? 1 : 0);
  if (estimatedBytes > MAX_FOXAPI_IMAGE_BYTES) return { error: "FoxAPI image result is too large." };

  try {
    const binary = atob(normalizedBase64);
    if (binary.length > MAX_FOXAPI_IMAGE_BYTES) return { error: "FoxAPI image result is too large." };
    const arrayBuffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(arrayBuffer);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { arrayBuffer, mimeType: image.mimeType };
  } catch {
    return { error: "FoxAPI result upload failed." };
  }
}

async function uploadBase64ImageResult(
  taskId: string,
  image: FoxApiBase64Image,
): Promise<{ ok: true; imageUrl: string; uploadPath: string } | { ok: false; message: string; uploadPath: string | null }> {
  const decoded = decodeBase64Image(image);
  if ("error" in decoded) return { ok: false, message: decoded.error, uploadPath: null };

  const uploadPath = getUploadPath(taskId, decoded.mimeType);
  const file = new Blob([decoded.arrayBuffer], { type: decoded.mimeType });
  const { error } = await supabaseAdmin.storage.from(FOXAPI_RESULT_BUCKET).upload(uploadPath, file, {
    contentType: decoded.mimeType,
    upsert: true,
  });

  if (error) {
    return { ok: false, message: "FoxAPI result upload failed.", uploadPath };
  }

  const { data } = supabaseAdmin.storage.from(FOXAPI_RESULT_BUCKET).getPublicUrl(uploadPath);
  if (!data.publicUrl) {
    return { ok: false, message: "FoxAPI result upload failed.", uploadPath };
  }

  return { ok: true, imageUrl: data.publicUrl, uploadPath };
}

async function resolveImagePayload(
  taskId: string,
  payload: any,
  startedAt: number,
): Promise<{ ok: true; imageUrl: string; elapsedMs: number } | { ok: false; message: string; elapsedMs: number }> {
  const imageUrl = extractImageUrl(payload);
  if (imageUrl) return { ok: true, imageUrl, elapsedMs: Date.now() - startedAt };

  const base64Image = extractBase64Image(payload);
  if (!base64Image) return { ok: false, message: "FoxAPI result URL is not ready", elapsedMs: Date.now() - startedAt };

  const upload = await uploadBase64ImageResult(taskId, base64Image);
  const elapsedMs = Date.now() - startedAt;
  safeLog(upload.ok ? "result:upload_ok" : "result:upload_error", {
    taskId,
    status: upload.ok ? "succeeded" : "failed",
    elapsedMs,
    uploadPath: upload.uploadPath,
  });

  if (!upload.ok) return { ok: false, message: upload.message, elapsedMs };
  return { ok: true, imageUrl: upload.imageUrl, elapsedMs };
}

export async function submitFoxApiImageEdit(input: {
  prompt: string;
  imageUrl: string;
}): Promise<FoxApiSubmitResult> {
  const startedAt = Date.now();
  let config: FoxApiConfig;
  try {
    config = loadFoxApiConfig();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "FoxAPI config error", elapsedMs: Date.now() - startedAt };
  }

  safeLog("submit:start", { elapsedMs: 0 });

  let imageResponse: Response;
  try {
    imageResponse = await fetch(input.imageUrl, { method: "GET" });
  } catch {
    const elapsedMs = Date.now() - startedAt;
    safeLog("submit:image_fetch_error", { elapsedMs });
    return { ok: false, message: "Failed to fetch reference image", elapsedMs };
  }

  if (!imageResponse.ok) {
    const elapsedMs = Date.now() - startedAt;
    safeLog("submit:image_fetch_http_error", { status: String(imageResponse.status), elapsedMs });
    return { ok: false, message: "Failed to fetch reference image", elapsedMs };
  }

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("image", await imageResponse.blob(), "reference-image.png");
  form.append("prompt", input.prompt);
  form.append("size", "1024x1024");

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/async/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch {
    const elapsedMs = Date.now() - startedAt;
    safeLog("submit:network_error", { elapsedMs });
    return { ok: false, message: "FoxAPI submit request failed", elapsedMs };
  }

  const text = await response.text();
  const payload = parseJson(text);
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    safeLog("submit:http_error", { status: String(response.status), elapsedMs });
    return { ok: false, message: `FoxAPI submit HTTP ${response.status}`, elapsedMs };
  }

  const taskId = extractTaskId(payload);
  if (!taskId) {
    safeLog("submit:no_task_id", { elapsedMs });
    return { ok: false, message: "FoxAPI did not return a task id", elapsedMs };
  }

  safeLog("submit:ok", { taskId, elapsedMs });
  return { ok: true, taskId, elapsedMs };
}

export async function submitFoxApiImageGenerationTask(input: {
  prompt: string;
}): Promise<FoxApiSubmitResult> {
  const startedAt = Date.now();
  let config: FoxApiConfig;
  try {
    config = loadFoxApiConfig();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "FoxAPI config error", elapsedMs: Date.now() - startedAt };
  }

  safeLog("generation_task:start", { elapsedMs: 0 });

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", input.prompt);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/async/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch {
    const elapsedMs = Date.now() - startedAt;
    safeLog("generation_task:network_error", { elapsedMs });
    return { ok: false, message: "FoxAPI generation task request failed", elapsedMs };
  }

  const text = await response.text();
  const payload = parseJson(text);
  const elapsedMs = Date.now() - startedAt;

  if (!response.ok) {
    const bodySnippet = text.slice(0, 300);
    console.log(`[foxapi-backup] generation_task:http_error status=${response.status} elapsedMs=${elapsedMs} body=${bodySnippet}`);
    return { ok: false, message: `FoxAPI generation task HTTP ${response.status}: ${bodySnippet}`, elapsedMs };
  }

  const taskId = extractTaskId(payload);
  if (!taskId) {
    safeLog("generation_task:no_task_id", { elapsedMs });
    return { ok: false, message: "FoxAPI did not return a task id", elapsedMs };
  }

  safeLog("generation_task:ok", { taskId, elapsedMs });
  return { ok: true, taskId, elapsedMs };
}

export async function pollFoxApiTask(taskId: string): Promise<FoxApiPollResult> {
  const startedAt = Date.now();
  let config: FoxApiConfig;
  try {
    config = loadFoxApiConfig();
  } catch (error) {
    return {
      status: "failed",
      taskId,
      providerStatus: null,
      imageUrl: null,
      message: error instanceof Error ? error.message : "FoxAPI config error",
      elapsedMs: Date.now() - startedAt,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/task/${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch {
    const elapsedMs = Date.now() - startedAt;
    safeLog("poll:network_error", { taskId, elapsedMs });
    return { status: "running", taskId, providerStatus: null, imageUrl: null, message: "FoxAPI poll request failed", elapsedMs };
  }

  const text = await response.text();
  const payload = parseJson(text);
  const providerStatus = extractStatus(payload);
  const elapsedMs = Date.now() - startedAt;
  safeLog("poll", { taskId, status: providerStatus ?? String(response.status), elapsedMs });

  if (!response.ok) {
    return { status: "running", taskId, providerStatus, imageUrl: null, message: `FoxAPI poll HTTP ${response.status}`, elapsedMs };
  }

  if (providerStatus && ["failed", "error", "cancelled", "canceled"].includes(providerStatus)) {
    const message = String(payload?.error?.message ?? payload?.message ?? payload?.data?.message ?? "FoxAPI task failed");
    return { status: "failed", taskId, providerStatus, imageUrl: null, message, elapsedMs };
  }

  if (providerStatus === "completed") {
    const resolved = await resolveImagePayload(taskId, payload, startedAt);
    if (resolved.ok) {
      return { status: "succeeded", taskId, providerStatus, imageUrl: resolved.imageUrl, message: null, elapsedMs: resolved.elapsedMs };
    }
    if (resolved.message !== "FoxAPI result URL is not ready") {
      return {
        status: "failed",
        taskId,
        providerStatus,
        imageUrl: null,
        message: resolved.message,
        elapsedMs: resolved.elapsedMs,
      };
    }
    return { status: "running", taskId, providerStatus, imageUrl: null, message: "FoxAPI result URL is not ready", elapsedMs };
  }

  if (providerStatus && ["pending", "processing", "queued", "running"].includes(providerStatus)) {
    return { status: "running", taskId, providerStatus, imageUrl: null, message: null, elapsedMs };
  }

  return { status: "running", taskId, providerStatus, imageUrl: null, message: "FoxAPI task is still running", elapsedMs };
}
