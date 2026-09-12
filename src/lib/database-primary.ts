export type DatabasePrimary = "lovable" | "d1";
export type ReadFallbackClass = "critical_business" | "non_critical_config";

type EnvLike = Record<string, unknown> | null | undefined;

export function resolveDatabasePrimary(env?: EnvLike): DatabasePrimary {
  const configured = readEnvValue(env, "DATABASE_PRIMARY");
  if (configured == null || configured.trim() === "") return "lovable";

  const normalized = configured.trim();
  if (normalized === "lovable" || normalized === "d1") return normalized;
  console.warn("Unsupported DATABASE_PRIMARY value; falling back to lovable.");
  return "lovable";
}

export function isD1Authoritative(env?: EnvLike): boolean {
  return resolveDatabasePrimary(env) === "d1";
}

export function shouldAllowWarmStandbyReadFallback(input: {
  primary: DatabasePrimary;
  className: ReadFallbackClass;
  d1Error: unknown;
}): boolean {
  if (input.primary !== "d1") return false;
  if (input.className !== "non_critical_config") return false;
  return input.d1Error != null;
}

function readEnvValue(env: EnvLike, name: string): string | null {
  const direct = env?.[name];
  if (typeof direct === "string") return direct;

  const globalEnv = (globalThis as Record<string, unknown>).__SHUNTU_CLOUDFLARE_ENV__;
  if (globalEnv && typeof globalEnv === "object") {
    const value = (globalEnv as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  }

  if (typeof process !== "undefined") {
    const value = process.env?.[name];
    if (typeof value === "string") return value;
  }

  return null;
}
