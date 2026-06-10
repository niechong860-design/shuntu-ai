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

export function loadFoxApiConfig(): FoxApiConfig {
  const baseUrl = (process.env.FOXAPI_BASE_URL || "https://foxapi.chat").replace(/\/+$/, "");
  const apiKey = String(process.env.FOXAPI_API_KEY ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) throw new Error("FOXAPI_API_KEY is not configured");
  return { baseUrl, apiKey };
}

function safeLog(stage: string, data: { taskId?: string | null; status?: string | null; elapsedMs?: number | null } = {}) {
  console.log("[foxapi-backup]", {
    stage,
    taskId: data.taskId ?? null,
    status: data.status ?? null,
    elapsedMs: data.elapsedMs ?? null,
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
    payload?.result?.url,
    payload?.result?.image_url,
    payload?.result?.imageUrl,
    payload?.result?.output_url,
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

function hasBase64Result(payload: any): boolean {
  try {
    const seen = new Set<any>();
    const stack: any[] = [payload];
    while (stack.length) {
      const value = stack.pop();
      if (!value || seen.has(value)) continue;

      if (typeof value === "string") {
        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return true;
        if (/^[A-Za-z0-9+/=]{200,}$/.test(value)) return true;
        continue;
      }

      if (typeof value === "object") {
        seen.add(value);
        for (const key of Object.keys(value)) {
          if (/^(b64_json|base64|image_base64)$/i.test(key) && typeof value[key] === "string" && value[key]) {
            return true;
          }
          stack.push(value[key]);
        }
      }
    }
  } catch {
    return false;
  }
  return false;
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
    const imageUrl = extractImageUrl(payload);
    if (imageUrl) return { status: "succeeded", taskId, providerStatus, imageUrl, message: null, elapsedMs };
    if (hasBase64Result(payload)) {
      return {
        status: "failed",
        taskId,
        providerStatus,
        imageUrl: null,
        message: "FoxAPI returned base64 result, not supported yet",
        elapsedMs,
      };
    }
    return { status: "running", taskId, providerStatus, imageUrl: null, message: "FoxAPI result URL is not ready", elapsedMs };
  }

  if (providerStatus && ["pending", "processing", "queued", "running"].includes(providerStatus)) {
    return { status: "running", taskId, providerStatus, imageUrl: null, message: null, elapsedMs };
  }

  return { status: "running", taskId, providerStatus, imageUrl: null, message: "FoxAPI task is still running", elapsedMs };
}
