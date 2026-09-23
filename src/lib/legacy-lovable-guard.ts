import { resolveDatabasePrimary } from "@/lib/database-primary";

type ServerContextLike =
  | { cloudflare?: { env?: unknown }; cloudflareEnv?: unknown }
  | null
  | undefined;

export function assertLovableOnlyLegacyWrite(context: unknown, feature: string): void {
  const env = getCloudflareEnvFromContext(context as ServerContextLike);
  if (resolveDatabasePrimary(env) !== "d1") return;
  throw new Error(`${feature} 尚未接入 D1 主库；D1 主库模式下已禁用旧 Lovable 写路径。`);
}

function getCloudflareEnvFromContext(context?: ServerContextLike): Record<string, unknown> | undefined {
  const explicit = context?.cloudflare?.env ?? context?.cloudflareEnv;
  if (explicit && typeof explicit === "object") return explicit as Record<string, unknown>;

  const globalEnv = (globalThis as Record<string, unknown>).__SHUNTU_CLOUDFLARE_ENV__;
  return globalEnv && typeof globalEnv === "object" ? globalEnv as Record<string, unknown> : undefined;
}
