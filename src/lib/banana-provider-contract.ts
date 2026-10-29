export const BANANA_PROVIDER_BASE_URL = "https://image1.vibelearning.top";

const BANANA_ASPECT_RATIOS = new Set([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function asHttpReference(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function isBananaModelConfig(model: {
  model_key?: string | null;
  extra_params?: unknown;
}): boolean {
  const extra = asRecord(model.extra_params);
  return extra.provider === "banana" || String(model.model_key ?? "").startsWith("banana");
}

export function getBananaModelName(
  model: { model_key?: string | null; extra_params?: unknown },
  providerOptions?: unknown,
): string {
  const options = asRecord(providerOptions ?? model.extra_params);
  const modelName = options.model;
  if (typeof modelName !== "string" || !modelName.trim()) {
    throw new Error("BANANA_PROVIDER_MODEL_NAME_MISSING");
  }
  return modelName.trim();
}

export function getBananaProviderUrl(model: {
  model_key?: string | null;
  extra_params?: unknown;
}): string {
  return `${BANANA_PROVIDER_BASE_URL}/v1beta/models/${encodeURIComponent(getBananaModelName(model))}:generateContent`;
}

export function buildBananaProviderPayload(input: {
  model: { model_key?: string | null; extra_params?: unknown };
  prompt: string;
  referenceImages?: Array<{ mimeType: string; data: string }>;
  aspectRatio?: string;
  resolution?: string;
}): JsonRecord {
  const options = asRecord(input.model.extra_params);
  const references = input.referenceImages ?? [];
  const aspectRatio = typeof input.aspectRatio === "string" ? input.aspectRatio.trim() : "";
  const resolution =
    typeof input.resolution === "string" ? input.resolution.trim().toUpperCase() : "";
  const ratioInstruction =
    aspectRatio && aspectRatio !== "auto" && BANANA_ASPECT_RATIOS.has(aspectRatio)
      ? `\nOutput aspect ratio: ${aspectRatio}. Preserve this exact aspect ratio.`
      : "";
  const parts = [
    { text: `${input.prompt.trim()}${ratioInstruction}` },
    ...references.map((image) => ({
      inline_data: { mime_type: image.mimeType, data: image.data },
    })),
  ];
  const configuredGeneration = asRecord(options.generationConfig);
  const configuredImage = asRecord(
    configuredGeneration.imageConfig ?? configuredGeneration.image_config,
  );
  const imageConfig: JsonRecord = { ...configuredImage };
  // Gemini's `auto` means the provider chooses the best ratio. Omit the field
  // instead of sending an unsupported literal value.
  if (aspectRatio && aspectRatio !== "auto" && BANANA_ASPECT_RATIOS.has(aspectRatio)) {
    imageConfig.aspectRatio = aspectRatio;
  }
  if (["1K", "2K", "4K"].includes(resolution)) imageConfig.imageSize = resolution;
  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      ...configuredGeneration,
      responseModalities: ["TEXT", "IMAGE"],
      ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
    },
  };
}

function dataUrlFromInlinePart(value: unknown): string | null {
  const part = asRecord(value);
  const inline = asRecord(part.inlineData ?? part.inline_data);
  const data = inline.data;
  if (typeof data !== "string" || !data.trim()) return null;
  const mime = typeof inline.mimeType === "string" ? inline.mimeType : inline.mime_type;
  const contentType = typeof mime === "string" && mime.startsWith("image/") ? mime : "image/png";
  return `data:${contentType};base64,${data.replace(/\s/g, "")}`;
}

export function extractBananaImageData(payload: unknown): string | null {
  const root = asRecord(payload);
  const choice = asRecord(first(root.choices));
  const message = asRecord(choice.message);
  const candidate = asRecord(first(root.candidates));
  const candidateContent = asRecord(candidate.content);
  const values: unknown[] = [
    message.content,
    ...(Array.isArray(candidateContent.parts) ? candidateContent.parts : []),
    ...(Array.isArray(message.content) ? message.content : []),
  ];
  for (const value of values) {
    const inline = dataUrlFromInlinePart(value);
    if (inline) return inline;
    if (typeof value === "string") {
      const match = value.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/i);
      if (match) return match[0].replace(/\s/g, "");
    }
    if (value && typeof value === "object") {
      const record = asRecord(value);
      const text = record.text;
      if (typeof text === "string") {
        const match = text.match(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/i);
        if (match) return match[0].replace(/\s/g, "");
      }
      const imageUrl = asRecord(record.image_url).url;
      if (typeof imageUrl === "string" && /^data:image\//i.test(imageUrl)) return imageUrl;
    }
  }
  return null;
}
