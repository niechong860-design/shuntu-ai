import type { BusinessDatabase } from "@/lib/business-database";
import { D1BusinessDatabase, type D1DatabaseBindingLike } from "@/lib/d1-business-database";
import { resolveDatabasePrimary } from "@/lib/database-primary";
import { LovableBusinessDatabase } from "@/lib/lovable-business-database";

type EnvLike = Record<string, unknown> | null | undefined;
type ServerContextLike =
  | { cloudflare?: { env?: unknown }; cloudflareEnv?: unknown; supabase?: unknown }
  | null
  | undefined;

export type BusinessDatabaseRouterOptions = {
  env?: EnvLike;
  d1?: D1DatabaseBindingLike | null;
  lovable?: BusinessDatabase;
};

export class DatabaseRouter {
  constructor(private readonly options: BusinessDatabaseRouterOptions = {}) {}

  get primary() {
    return resolveDatabasePrimary(this.options.env);
  }

  get database(): BusinessDatabase {
    const primary = this.primary;
    if (primary === "lovable") return this.options.lovable ?? new LovableBusinessDatabase();
    const d1 = this.options.d1 ?? getD1BindingFromEnv(this.options.env);
    if (!d1) throw new Error("DATABASE_PRIMARY=d1 requires a Cloudflare D1 DB binding");
    return new D1BusinessDatabase(d1);
  }
}

export function createBusinessDatabase(options: BusinessDatabaseRouterOptions = {}): BusinessDatabase {
  return new DatabaseRouter(options).database;
}

export function createBusinessDatabaseFromContext(context?: ServerContextLike): BusinessDatabase {
  const env = getCloudflareEnvFromContext(context);
  return createBusinessDatabase({
    env,
    lovable: new LovableBusinessDatabase({ user: context?.supabase }),
  });
}

export function getCloudflareEnvFromContext(context?: ServerContextLike): EnvLike {
  const explicit = context?.cloudflare?.env ?? context?.cloudflareEnv;
  const globalEnv = (globalThis as Record<string, unknown>).__SHUNTU_CLOUDFLARE_ENV__;
  const explicitEnv: Record<string, unknown> = explicit && typeof explicit === "object" ? explicit as Record<string, unknown> : {};
  const requestEnv: Record<string, unknown> = globalEnv && typeof globalEnv === "object" ? globalEnv as Record<string, unknown> : {};
  if (Object.keys(explicitEnv).length === 0 && Object.keys(requestEnv).length === 0) return undefined;
  return { ...requestEnv, ...explicitEnv };
}

function getD1BindingFromEnv(env: EnvLike): D1DatabaseBindingLike | null {
  const db = env?.DB;
  if (!db || typeof db !== "object") return null;
  if (typeof (db as D1DatabaseBindingLike).prepare !== "function") return null;
  return db as D1DatabaseBindingLike;
}
