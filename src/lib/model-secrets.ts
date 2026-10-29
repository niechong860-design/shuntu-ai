export const MODEL_SECRET_REFERENCES = [
  "wuyin:gpt-image-2",
  "wuyin:nanobanana2",
  "wuyin:nanobanana",
  "vibelearning:gpt_image_2_backup",
  "vibelearning:gpt_image_2_native_pro",
] as const;

const SECRET_BY_REFERENCE: Record<(typeof MODEL_SECRET_REFERENCES)[number], string> = {
  "wuyin:gpt-image-2": "WUYIN_MODEL_GPT_IMAGE_2_API_KEY",
  "wuyin:nanobanana2": "WUYIN_MODEL_NANOBANANA2_API_KEY",
  "wuyin:nanobanana": "WUYIN_MODEL_NANOBANANA_API_KEY",
  "vibelearning:gpt_image_2_backup": "VIBELEARNING_GPT_IMAGE_2_BACKUP_API_KEY",
  "vibelearning:gpt_image_2_native_pro": "VIBELEARNING_GPT_IMAGE_2_NATIVE_PRO_API_KEY",
};

function envValue(name: string, env?: Record<string, unknown>): unknown {
  if (env && Object.hasOwn(env, name)) return env[name];
  const globals = globalThis as typeof globalThis & {
    __SHUNTU_CLOUDFLARE_ENV__?: Record<string, unknown>;
  };
  const cloudflare = globals.__SHUNTU_CLOUDFLARE_ENV__;
  if (cloudflare && Object.hasOwn(cloudflare, name)) return cloudflare[name];
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function normalize(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return (
    value
      .trim()
      .replace(/^Bearer\s+/i, "")
      .trim() || null
  );
}

export function getModelSecretStatus(reference: unknown, env?: Record<string, unknown>): boolean {
  if (typeof reference !== "string" || !(reference in SECRET_BY_REFERENCE)) return false;
  return (
    normalize(envValue(SECRET_BY_REFERENCE[reference as keyof typeof SECRET_BY_REFERENCE], env)) !==
    null
  );
}

export function resolveModelSecret(reference: unknown, env?: Record<string, unknown>): string {
  if (reference == null || reference === "") throw new Error("MODEL_SECRET_REFERENCE_MISSING");
  if (typeof reference !== "string" || !(reference in SECRET_BY_REFERENCE))
    throw new Error("MODEL_SECRET_REFERENCE_UNKNOWN");
  const value = normalize(
    envValue(SECRET_BY_REFERENCE[reference as keyof typeof SECRET_BY_REFERENCE], env),
  );
  if (!value) throw new Error("MODEL_SECRET_NOT_CONFIGURED");
  return value;
}
