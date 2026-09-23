# SHUNTU D1 Business Layer Audit

Generated at: 2026-09-11

## Summary

| area | result |
| --- | --- |
| Database interface | PASS |
| Lovable adapter | PASS |
| D1 adapter | PASS |
| DATABASE_PRIMARY router | PASS |
| profiles/credits | PASS |
| consume credits | PASS |
| generation task | PASS |
| finalize once | PASS |
| generation history | PASS |
| credit ledger | PASS |
| payment order | PASS |
| coupon redemption | PASS |
| D1 + outbox transaction atomicity | PASS |
| replication processor | PASS |
| row-state replication | PASS |
| unit conversion | PASS |
| reconciliation | PASS |
| local integration tests | PASS |

## Implemented files

- `src/lib/business-database.ts`: shared server-side interface, data shapes, and decimal-safe unit conversions.
- `src/lib/business-database-router.ts`: centralized `DATABASE_PRIMARY` routing.
- `src/lib/lovable-business-database.ts`: Lovable/Supabase adapter that preserves existing Supabase/RPC semantics.
- `src/lib/d1-business-database.ts`: D1 adapter for key reads, writes, idempotency, and outbox-backed mutations.
- `src/lib/replication-processor.ts`: injectable D1 to Lovable row-state replication processor with fake and Supabase targets.
- `d1/migrations/0002_replication_outbox.sql`: outbox schema, indexes, retry fields, and status constraints.
- `d1/scripts/d1-business-layer-integration-test.mjs`: clean local D1 integration test covering critical write/idempotency scenarios.
- `d1/scripts/reconcile-databases.mjs`: read-only reconciliation against frozen baseline or a mock Lovable payload.

## DATABASE_PRIMARY behavior

- Unset or empty value resolves to `lovable`.
- Explicit `lovable` resolves to Lovable/Supabase.
- Explicit `d1` resolves to D1 and requires a D1 binding.
- Invalid values fail closed with startup/runtime error; they do not silently enable D1.

## Critical write semantics

- D1 credit deductions use centi-credit integers.
- D1 order amounts use fen integers.
- Business APIs continue returning legacy business units, not D1 storage units.
- D1 writes create row-state replication events in the same D1 batch used for the business mutation.
- Replication outbox failures abort the local business transaction in the integration test.

## Replication behavior

- Processor claims finite pending batches.
- Failure leaves outbox pending with safe `last_error`, incremented attempts, and `next_attempt_at` backoff.
- Success marks events `synced`.
- Replay uses `idempotency_key` and does not duplicate final target state.
- Supabase target is implemented but write-disabled unless explicitly constructed with `allowWrites: true`; it was not executed in this phase.

## Reconciliation

- `profiles`: MATCH.
- `credit_usage_logs`: MATCH.
- `generation_tasks`: MATCH.
- `generation_history`: MATCH.
- `user_orders`: MATCH.
- `coupons`: MATCH.
- `redeem_logs`: MATCH.
- No sensitive row data is printed by the reconciliation script.

## Local tests

- Sufficient balance debit: PASS.
- Insufficient balance rollback: PASS.
- Finalize same generation task twice: PASS.
- Same payment callback twice: PASS.
- Same coupon redemption twice: PASS.
- D1 mutation with outbox: PASS.
- Forced outbox failure rolls back business mutation: PASS.
- Replication target failure leaves outbox pending: PASS.
- Replication replay is idempotent: PASS.
- `DATABASE_PRIMARY` default Lovable: PASS.
- Unit conversion: PASS.

## Existing dependencies intentionally kept

- Supabase Auth remains active.
- Supabase Storage buckets still used by the product remain active.
- Existing generated images remain on Cloudflare R2.
- Legacy image manifest and staging are preserved; no production R2 write was performed.

## Not performed

- No production database write.
- No remote D1 write.
- No Supabase production write.
- No production R2 write.
- No Cloudflare environment variable or Secret mutation.
- No Auth migration.
- No Storage migration.
- No deploy, git add, commit, or push.
