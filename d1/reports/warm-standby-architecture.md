# SHUNTU D1 Primary With Lovable Warm Standby

Generated at: 2026-09-11

## Target architecture

- Cloudflare D1 is the authoritative business database after cutover.
- Lovable/Supabase PostgreSQL is a warm standby and rollback database, not a second primary.
- Supabase Auth remains active during this stage. Existing auth UUID strings remain the `profiles.id` and `user_id` values.
- Supabase Storage buckets still used by the product remain active during this stage.
- Cloudflare R2 remains the generated-image store. Existing `https://img.shuntu.cc/generated/...` URLs are not re-uploaded or rewritten.

## DATABASE_PRIMARY

- Supported values: `lovable`, `d1`.
- Default when unset or empty: `lovable`.
- Invalid explicit values must fail closed instead of silently enabling D1.
- No production environment variable is changed in this phase.
- `src/lib/database-primary.ts` contains the resolver and read-fallback decision helper.

## Authoritative write semantics

- `DATABASE_PRIMARY=lovable`: existing Supabase/Lovable behavior remains the source of truth.
- `DATABASE_PRIMARY=d1`: business reads and writes use D1 for critical business data.
- At no point should both D1 and Lovable accept primary business writes for the same request.
- Naive dual-write is prohibited because D1 and PostgreSQL do not share an atomic distributed transaction.

## D1 outbox semantics

- Every D1 authoritative business transaction that changes critical business state must also insert a `replication_outbox` event in the same D1 transaction or batch.
- The outbox event stores final row state, not a business action to replay.
- Outbox payloads must not contain API keys, JWTs, Authorization headers, service-role keys, provider secrets, or private keys.
- Lovable/Supabase replication is asynchronous. Failure to replicate does not roll back a committed D1 business transaction.

## Critical transaction coverage

- `profiles` credit mutations.
- `credit_usage_logs` inserts and idempotent credit ledger rows.
- `generation_tasks` create/update/final state.
- `generation_history` inserts/update final image state.
- `user_orders` create/update/payment completion state.
- `coupons` used-state updates.
- `redeem_logs` insert final redeem result.

## Replication processor

- Polls `replication_outbox` for `pending` or retryable `failed` rows in finite batches.
- Marks rows `processing` only during a claim window.
- Writes final row-state to Lovable/Supabase using idempotent UPSERT/UPDATE rules.
- Marks outbox rows `synced` only after Lovable write success.
- Leaves rows `pending` with incremented `attempt_count` and `last_error` when Lovable is unavailable.
- Does not call Supabase RPCs such as credit consumption, finalize generation, paid-order completion, or coupon redemption.

## Table replication strategy

| table | insert | update | delete | idempotency |
| --- | --- | --- | --- | --- |
| profiles | UPSERT complete row-state by `id` | SET current D1 columns, especially `credits` absolute value | No routine business delete known; use explicit tombstone event if introduced | `profiles:{id}:{operation_id}` |
| generation_tasks | UPSERT complete row-state by `id` and preserve `request_id` | SET final task state, deduction fields, result URL/payload, timestamps | No routine business delete known; tombstone only for explicit admin delete | primary `id`, unique `request_id`, `generation_task_id` links |
| generation_history | UPSERT complete row-state by `id` | SET image URL, cost, prompt/model/timestamps from D1 | No routine business delete known; prune must emit tombstone if needed | primary `id`, nullable unique `generation_task_id` |
| credit_usage_logs | INSERT/UPSERT immutable ledger row by `id` | Avoid mutation except corrective row-state sync | No business delete; reversal should be a compensating row, not delete | unique `idempotency_key`, primary `id`, task/history IDs |
| user_orders | UPSERT order by `id` | SET status, paid timestamp, trade number, credits absolute value | No routine business delete known | unique `out_trade_no`, primary `id` |
| coupons | UPSERT coupon by `id` or `code` | SET `is_used`, `used_by`, `used_at`, email from D1 final state | No routine business delete known | unique `code`, primary `id` |
| redeem_logs | INSERT/UPSERT final redeem result by `id` | Avoid mutation except corrective row-state sync | No business delete | primary `id`, coupon `code`, user id |

## Read fallback rules

- Critical reads for credits, orders, generation tasks, generation history, coupons, and redemption must not silently fall back to Lovable when D1 is primary.
- D1 query failure on critical data should return a backend error or degraded state rather than read stale standby data.
- Optional read fallback may be considered only for non-critical config data and must be logged.
- Automatic write failover to Lovable on a single D1 query error is prohibited.

## Monitoring

Expose non-sensitive replication health from an admin-only endpoint after the Worker implementation exists:

```json
{
  "d1Primary": true,
  "pendingReplication": 3,
  "oldestPendingSeconds": 14,
  "lastReplicationAt": "2026-09-11T00:00:00.000Z"
}
```

Do not include payloads, user prompts, images, tokens, API keys, or authorization material in health responses.

## RPO and rollback risk

- Normal operation requires low-latency D1 to Lovable replication.
- If D1 is completely inaccessible and unsynced outbox rows remain, switching to Lovable can lose the most recent D1-authoritative writes.
- This architecture does not claim zero data loss.
- Controlled rollback should flush outbox and reconcile critical tables before switching `DATABASE_PRIMARY=lovable`.

## Local validation

- `d1/scripts/warm-standby-rollback-test.mjs` simulates default Lovable mode, D1 authoritative writes, pending outbox, failed replication that leaves D1 committed, successful fake Lovable replication, idempotent replay, and rollback readiness blocking when pending outbox remains.

## Not implemented in this phase

- No production D1 was created or written.
- No production R2 object was written.
- No Supabase/Lovable data was modified.
- No Cloudflare Secret was created, updated, or deleted.
- No Auth, Storage, Provider, payment, Canvas, ControlPanel, or Studio migration was performed.
