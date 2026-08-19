export const GPT_IMAGE_PRO_MODEL_KEY = "gpt_image_2_native_pro";
export const GPT_IMAGE_PRO_VBL_BASE_URL = "https://image1.vibelearning.top/v1";
export const GPT_IMAGE_PRO_VBL_GENERATIONS_URL = `${GPT_IMAGE_PRO_VBL_BASE_URL}/images/generations`;
export const GPT_IMAGE_PRO_VBL_EDITS_URL = `${GPT_IMAGE_PRO_VBL_BASE_URL}/images/edits`;

const QUALITIES = new Set(["auto", "low", "medium", "high"]);
const RESPONSE_FORMATS: Set<"url" | "b64_json"> = new Set(["url", "b64_json"]);
const OUTPUT_FORMATS: Set<"png" | "jpeg" | "webp"> = new Set(["png", "jpeg", "webp"]);

export type GptImageProQuality = "auto" | "low" | "medium" | "high";

export type GptImageProProviderPayload = {
  model: "gpt-image-2";
  prompt: string;
  size: string;
  quality: GptImageProQuality;
  n: number;
  response_format: "url" | "b64_json";
  output_format: "png" | "jpeg" | "webp";
};

export function normalizeGptImageProQuality(value: unknown): GptImageProQuality {
  if (typeof value !== "string") return "auto";
  const normalized = value.trim().toLowerCase();
  return QUALITIES.has(normalized) ? normalized as GptImageProQuality : "auto";
}

export function resolveGptImageProSize(aspectRatio?: string, resolution?: string): string {
  const ratio = String(aspectRatio ?? "").trim();
  const normalizedResolution = String(resolution ?? "1K").trim().toUpperCase();
  const sizes: Record<string, Record<string, string>> = {
    "1K": { "1:1": "1024x1024", "3:4": "1024x1536", "4:3": "1536x1024", "9:16": "1024x1536", "16:9": "1536x1024", "2:3": "1024x1536", "3:2": "1536x1024" },
    "2K": { "1:1": "2048x2048", "3:4": "1664x2496", "4:3": "2496x1664", "9:16": "1440x2560", "16:9": "2560x1440", "2:3": "1664x2496", "3:2": "2496x1664" },
    "4K": { "1:1": "4096x4096", "3:4": "3072x4096", "4:3": "4096x3072", "9:16": "2224x3712", "16:9": "3712x2224", "2:3": "2224x3712", "3:2": "3712x2224" },
  };
  const fallback = { "1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096" };
  const selectedResolution = sizes[normalizedResolution] ? normalizedResolution : "1K";
  return sizes[selectedResolution][ratio] ?? fallback[selectedResolution as keyof typeof fallback];
}

function normalizeEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase() as T;
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 10 ? count : 1;
}

export function buildGptImageProProviderPayload(input: {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  providerOptions?: Record<string, unknown>;
}): GptImageProProviderPayload {
  const options = input.providerOptions ?? {};
  const payload: GptImageProProviderPayload = {
    model: "gpt-image-2",
    prompt: input.prompt.trim(),
    size: resolveGptImageProSize(input.aspectRatio, input.resolution),
    quality: normalizeGptImageProQuality(options.quality),
    n: normalizeCount(options.n),
    response_format: normalizeEnum(options.response_format, RESPONSE_FORMATS, "url"),
    output_format: normalizeEnum(options.output_format, OUTPUT_FORMATS, "png"),
  };
  validateGptImageProProviderPayload(payload);
  return payload;
}

export function validateGptImageProProviderPayload(
  payload: GptImageProProviderPayload,
  referenceImageCount?: number,
): void {
  if (!payload.prompt) throw new Error("GPT-IMAGE PRO provider payload requires a prompt");
  if (payload.model !== "gpt-image-2") throw new Error("GPT-IMAGE PRO provider model is invalid");
  if (!/^\d{3,5}x\d{3,5}$/.test(payload.size)) throw new Error("GPT-IMAGE PRO provider size is invalid");
  if (!QUALITIES.has(payload.quality)) throw new Error("GPT-IMAGE PRO provider quality is invalid");
  if (!Number.isInteger(payload.n) || payload.n < 1 || payload.n > 10) throw new Error("GPT-IMAGE PRO provider image count is invalid");
  if (!RESPONSE_FORMATS.has(payload.response_format)) throw new Error("GPT-IMAGE PRO provider response format is invalid");
  if (!OUTPUT_FORMATS.has(payload.output_format)) throw new Error("GPT-IMAGE PRO provider output format is invalid");
  if (referenceImageCount !== undefined && referenceImageCount < 1) {
    throw new Error("GPT-IMAGE PRO provider edit requires a reference image");
  }
}
