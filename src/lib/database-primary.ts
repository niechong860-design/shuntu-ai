export type DatabasePrimary = "lovable" | "d1";
export type ReadFallbackClass = "critical_business" | "non_critical_config";

type EnvLike = Record<string, unknown> | null | undefined;

export function resolveDatabasePrimary(env?: EnvLike): DatabasePrimary {
  const configured = readEnvValue(env, "DATABASE_PRIMARY");
  // D1 is the only supported production authority. An unset value must not
  // silently route business traffic back to the retired Lovable database.
  if (configured == null || configured.trim() === "") return "d1";

  const normalized = configured.trim();
  if (normalized === "d1") return "d1";
  if (normalized === "lovable") throw new Error("LEGACY_LOVABLE_DATABASE_DISABLED");
  throw new Error("UNSUPPORTED_DATABASE_PRIMARY");
}

export function isD1Authoritative(env?: EnvLike): boolean {
  return resolveDatabasePrimary(env) === "d1";
}

export function shouldAllowWarmStandbyReadFallback(input: {
  primary: DatabasePrimary;
  className: ReadFallbackClass;
  d1Error: unknown;
}): boolean {
  // The warm standby has been retired. Keep the helper for callers and tests,
  // but never route a request to the legacy database after a D1 error.
  void input;
  return false;
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
