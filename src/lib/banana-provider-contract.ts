export const BANANA_PROVIDER_BASE_URL = "https://image1.vibelearning.top";
export const BANANA_PROVIDER_CHAT_URL = `${BANANA_PROVIDER_BASE_URL}/v1/chat/completions`;

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

export function buildBananaProviderPayload(input: {
  model: { model_key?: string | null; extra_params?: unknown };
  prompt: string;
  referenceImages?: unknown[];
}): JsonRecord {
  const options = asRecord(input.model.extra_params);
  const modelName = getBananaModelName(input.model, options);
  const references = (input.referenceImages ?? []).filter(asHttpReference);
  const content: unknown = references.length
    ? [
        { type: "text", text: input.prompt.trim() },
        ...references.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : input.prompt.trim();
  const configuredGeneration = asRecord(options.generationConfig);
  return {
    model: modelName,
    messages: [{ role: "user", content }],
    generationConfig: {
      ...configuredGeneration,
      responseModalities: ["TEXT", "IMAGE"],
    },
    stream: false,
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
