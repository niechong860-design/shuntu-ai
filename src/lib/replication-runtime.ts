import { createClient } from "@supabase/supabase-js";
import { processReplicationOutbox, SupabaseReplicationTarget, type ReplicationProcessorResult } from "@/lib/replication-processor";
import type { D1DatabaseBindingLike } from "@/lib/d1-business-database";

export type ReplicationRuntimeEnv = {
  DB?: D1DatabaseBindingLike;
  DATABASE_PRIMARY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export async function runReplicationBatch(env: ReplicationRuntimeEnv, batchSize = 10): Promise<ReplicationProcessorResult> {
  if (env.DATABASE_PRIMARY !== "d1") throw new Error("REPLICATION_REQUIRES_DATABASE_PRIMARY_D1");
  if (!env.DB || typeof env.DB.prepare !== "function") throw new Error("REPLICATION_D1_BINDING_MISSING");
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("REPLICATION_SUPABASE_ADMIN_ENV_MISSING");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const target = new SupabaseReplicationTarget(supabase, { allowWrites: true });
  return processReplicationOutbox({ db: env.DB, target, batchSize });
}
