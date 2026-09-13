import type { D1DatabaseBindingLike, D1RunResult } from "@/lib/d1-business-database";
import { centiCreditToCredits, fenToYuan, jsonFromD1 } from "@/lib/business-database";
import { assertSafeReplicationPayload } from "@/lib/d1-replication-outbox";

export type ReplicationOutboxRow = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: string;
  idempotency_key: string;
  status: "pending" | "processing" | "synced" | "failed";
  attempt_count: number;
  last_error: string | null;
  locked_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
  synced_at: string | null;
};

export interface ReplicationTarget {
  apply(event: { idempotencyKey: string; eventType: string; entityType: string; entityId: string; payload: unknown }): Promise<void>;
}

export type ReplicationProcessorOptions = {
  db: D1DatabaseBindingLike;
  target: ReplicationTarget;
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
  now?: Date;
};

export type ReplicationProcessorResult = {
  scanned: number;
  synced: number;
  failed: number;
  deferred: number;
};

export async function processReplicationOutbox(options: ReplicationProcessorOptions): Promise<ReplicationProcessorResult> {
  const batchSize = clampInteger(options.batchSize ?? 25, 1, 100);
  const maxAttempts = clampInteger(options.maxAttempts ?? 8, 1, 50);
  const leaseMs = clampInteger(options.leaseMs ?? 5 * 60 * 1000, 1_000, 60 * 60 * 1000);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const leaseCutoffIso = new Date(now.getTime() - leaseMs).toISOString();
  const rows = await selectPendingRows(options.db, batchSize, maxAttempts, nowIso, leaseCutoffIso);
  const result: ReplicationProcessorResult = { scanned: rows.length, synced: 0, failed: 0, deferred: 0 };

  for (const row of rows) {
    const claimed = await claimRow(options.db, row.id, nowIso, leaseCutoffIso);
    if (!claimed) {
      result.deferred += 1;
      continue;
    }

    try {
      const payload = JSON.parse(row.payload) as unknown;
      assertSafeReplicationPayload(payload);
      await options.target.apply({
        idempotencyKey: row.idempotency_key,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        payload,
      });
      await options.db.prepare("UPDATE replication_outbox SET status = 'synced', synced_at = ?, locked_at = NULL, last_error = NULL WHERE id = ?")
        .bind(nowIso, row.id)
        .run();
      result.synced += 1;
    } catch (error) {
      const attempts = row.attempt_count + 1;
      const finalStatus = attempts >= maxAttempts ? "failed" : "pending";
      const nextAttemptAt = finalStatus === "pending" ? new Date(now.getTime() + retryDelayMs(attempts)).toISOString() : null;
      await options.db.prepare(`
        UPDATE replication_outbox
        SET status = ?, attempt_count = ?, last_error = ?, locked_at = NULL, next_attempt_at = ?
        WHERE id = ?
      `).bind(finalStatus, attempts, safeReplicationError(error), nextAttemptAt, row.id).run();
      result.failed += 1;
    }
  }

  return result;
}

export class FakeReplicationTarget implements ReplicationTarget {
  readonly rows = new Map<string, unknown>();
  readonly appliedIdempotencyKeys = new Set<string>();

  constructor(private readonly options: { fail?: boolean } = {}) {}

  async apply(event: { idempotencyKey: string; eventType: string; entityType: string; entityId: string; payload: unknown }): Promise<void> {
    if (this.options.fail) throw new Error("SIMULATED_REPLICATION_TARGET_FAILURE");
    if (this.appliedIdempotencyKeys.has(event.idempotencyKey)) return;
    const row = readPayloadRow(event.payload);
    if (event.eventType.endsWith(".delete")) {
      this.rows.set(`${event.entityType}:${event.entityId}:tombstone`, row);
    } else {
      this.rows.set(`${event.entityType}:${event.entityId}`, row);
    }
    this.appliedIdempotencyKeys.add(event.idempotencyKey);
  }
}

export class SupabaseReplicationTarget implements ReplicationTarget {
  constructor(private readonly supabase: any, private readonly options: { allowWrites: boolean }) {}

  async apply(event: { idempotencyKey: string; eventType: string; entityType: string; entityId: string; payload: unknown }): Promise<void> {
    if (!this.options.allowWrites) {
      throw new Error("SUPABASE_REPLICATION_TARGET_WRITE_DISABLED_FOR_THIS_PHASE");
    }
    const row = convertD1RowStateForSupabase(event.entityType, readPayloadRow(event.payload));
    if (event.eventType.endsWith(".delete")) {
      const { error } = await this.supabase.from(event.entityType).delete().eq("id", event.entityId);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await this.supabase.from(event.entityType).upsert(row, { onConflict: primaryConflictFor(event.entityType) });
    if (error) throw new Error(error.message);
  }
}

async function selectPendingRows(db: D1DatabaseBindingLike, limit: number, maxAttempts: number, nowIso: string, leaseCutoffIso: string): Promise<ReplicationOutboxRow[]> {
  const result = await db.prepare(`
    SELECT * FROM replication_outbox
    WHERE attempt_count < ?
      AND (
        (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
        OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at <= ?)
      )
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(maxAttempts, nowIso, leaseCutoffIso, limit).all<ReplicationOutboxRow>();
  return Array.isArray(result) ? result : result.results ?? [];
}

async function claimRow(db: D1DatabaseBindingLike, id: string, nowIso: string, leaseCutoffIso: string): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE replication_outbox
    SET status = 'processing', locked_at = ?
    WHERE id = ? AND (
      status = 'pending'
      OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at <= ?)
    )
  `).bind(nowIso, id, leaseCutoffIso).run();
  return changedRows(result) === 1;
}

function changedRows(result: D1RunResult): number {
  return Number(result.meta?.changes ?? result.meta?.rows_written ?? 0);
}

function retryDelayMs(attempts: number): number {
  const seconds = Math.min(300, 2 ** Math.max(0, attempts - 1));
  return seconds * 1000;
}

function safeReplicationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT_REDACTED]")
    .replace(/(api[_-]?key|secret|token|authorization|service[_-]?role)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function readPayloadRow(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Replication payload object is required");
  const row = (payload as { row?: unknown }).row;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Replication payload.row object is required");
  return row as Record<string, unknown>;
}

function convertD1RowStateForSupabase(entityType: string, row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  if (entityType === "profiles" && next.credits != null) next.credits = centiCreditToCredits(next.credits as number);
  if (entityType === "generation_tasks" && next.credits_required != null) next.credits_required = centiCreditToCredits(next.credits_required as number);
  if (entityType === "generation_history" && next.cost != null) next.cost = centiCreditToCredits(next.cost as number);
  if (entityType === "credit_usage_logs" && next.amount != null) next.amount = centiCreditToCredits(next.amount as number);
  if (entityType === "user_orders") {
    if (next.amount != null) next.amount = fenToYuan(next.amount as number);
    if (next.credits != null) next.credits = centiCreditToCredits(next.credits as number);
  }
  if (entityType === "coupons" && next.amount != null) next.amount = centiCreditToCredits(next.amount as number);
  if (entityType === "redeem_logs" && next.amount != null) next.amount = centiCreditToCredits(next.amount as number);
  for (const key of ["input_params", "result_payload", "metadata", "extra_params", "features", "tags"]) {
    if (typeof next[key] === "string") next[key] = jsonFromD1(next[key]);
  }
  for (const key of ["is_used", "success", "is_enabled", "is_active", "is_pinned", "is_published", "is_popular", "highlighted", "is_visible"]) {
    if (next[key] === 0 || next[key] === 1) next[key] = next[key] === 1;
  }
  return next;
}

function primaryConflictFor(entityType: string): string {
  if (entityType === "coupons") return "id";
  if (entityType === "user_orders") return "id";
  return "id";
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) throw new Error("integer option required");
  return Math.max(min, Math.min(max, value));
}
