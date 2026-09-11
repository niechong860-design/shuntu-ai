# SHUNTU Remote D1 Cutover And Rollback Runbook

Generated at: 2026-09-11

This is a runbook only. No production operation is executed by this file.

## Preconditions

- Current frozen migration baseline is `C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13`.
- That baseline is not fresh enough by itself for cutover; production must run baseline import, incremental catch-up, and final maintenance-window catch-up.
- `DATABASE_PRIMARY` defaults to `lovable` until an explicit authorized cutover sets it to `d1`.
- Supabase Auth stays active during this stage.
- Supabase Storage buckets still used by the app stay active during this stage.
- Generated images continue using Cloudflare R2. Existing `https://img.shuntu.cc/generated/...` objects are not re-uploaded.

## Phase A - Create remote D1

Create the Cloudflare remote D1 database only after user authorization. Record database name, id, account, and binding. Do not import data yet.

Planned command, not executed in this phase:

```powershell
npx wrangler d1 create shuntu-prod
```

After the database id is known, update the D1 binding to `DB` in Cloudflare environment configuration through the approved release path. Do not set `DATABASE_PRIMARY=d1` yet.

## Phase B - Resolve legacy image references

- For manifest objects classified `ALREADY_IN_R2`, do not upload duplicates.
- For manifest objects classified `NEEDS_UPLOAD`, upload only those legacy binaries to the fallback namespace.
- If any object is `AMBIGUOUS` or `MISMATCH`, stop before database import.
- Verify legacy final URLs by key, content type, decoded byte length, and SHA256 when safe.

Dry-run before any write:

```powershell
node d1/scripts/upload-legacy-images-to-r2.mjs
```

Authorized production upload command, only after explicit approval:

```powershell
node d1/scripts/upload-legacy-images-to-r2.mjs --execute --confirm-production-r2
```

## Phase C - Initialize D1 schema

Apply `d1/migrations/*.sql` in lexical order to the empty remote D1 database.

Planned commands, not executed in this phase:

```powershell
npx wrangler d1 execute shuntu-prod --remote --file d1/migrations/0001_initial.sql
npx wrangler d1 execute shuntu-prod --remote --file d1/migrations/0002_replication_outbox.sql
```

## Phase D - Import baseline

Generate production-compatible import data from the frozen baseline plus approved supplements and legacy image manifest. Import baseline rows into remote D1.

Baseline package must be generated from the frozen source, the recharge supplement, and `d1/reports/legacy-image-externalization-manifest.json`; no production JSON, production INSERT SQL, base64, binary, API key, or secret belongs in Git.

## Phase E - Supabase to D1 incremental catch-up

Replay source changes created after `2026-09-11_01-55-13` from Lovable/Supabase into D1. Use primary keys, request IDs, order numbers, and idempotency keys. Do not call business RPCs that recalculate side effects.

Dry-run/read-only planning:

```powershell
node d1/scripts/supabase-to-d1-catchup.mjs --source=supabase-readonly
```

Generate a gitignored local package for review:

```powershell
node d1/scripts/supabase-to-d1-catchup.mjs --source=supabase-readonly --write-package
```

Authorized production D1 execution requires both flags and remains blocked until Phase A-D are complete:

```powershell
node d1/scripts/supabase-to-d1-catchup.mjs --source=supabase-readonly --execute --confirm-production-d1
```

## Phase F - Source vs D1 reconciliation

Reconcile counts, key aggregates, unique constraints, credit balances, orders, coupons, generation tasks, generation history, and redeem logs.

## Phase G - Enter short maintenance mode

Pause critical writes. Reads may continue only if they cannot create stale state or side effects.

## Phase H - Final source to D1 delta

Apply the final Lovable/Supabase delta into D1 while critical writes are paused.

## Phase I - Final reconciliation

Run the same count, aggregate, unique, size, and critical-table checks again. Stop if any check fails.

## Phase J - Enable D1 primary

Set `DATABASE_PRIMARY=d1` only after final reconciliation passes. Do not enable naive dual-write.

## Phase K - Exit maintenance mode

Resume traffic with D1 as the only authoritative business database.

## Phase L - Start D1 to Lovable outbox replication

Run the replication processor that reads `replication_outbox` and writes final row-state to Lovable/Supabase warm standby. Do not call Supabase business RPCs from replication.

## Phase M - Monitor production

Monitor pending outbox count, oldest pending age, last successful replication time, D1 errors, credit mismatches, order mismatches, coupon mismatches, and generation-task mismatches.

## Rollback runbook

Rollback is controlled and manual. Do not auto-route writes to Lovable because of a single D1 query error.

1. Enter maintenance mode and pause critical writes.
2. Check pending outbox count, oldest pending age, and last successful replication time.
3. If D1 is reachable, flush D1 to Lovable replication as far as possible.
4. Reconcile `profiles.credits`, `credit_usage_logs`, `generation_tasks`, `generation_history`, `user_orders`, `coupons`, and `redeem_logs`.
5. Confirm Lovable/Supabase has reached an acceptable sync point.
6. Set `DATABASE_PRIMARY=lovable` only after accepting any remaining RPO risk.
7. Restore traffic.
8. Keep D1 read/write paths paused until root cause and forward recovery are decided.

## Data loss warning

If D1 is completely inaccessible and there are unsynced outbox events, switching directly to Lovable can lose the latest D1-authoritative writes. This design minimizes RPO through low-latency replication but does not guarantee zero data loss.

## Full Lovable shutdown gates

Do not shut down Lovable/Supabase until all of the following are complete:

- D1 primary has run cleanly through production verification.
- D1 to Lovable warm-standby replication health has been accepted or intentionally retired.
- Supabase Auth migration is complete.
- Remaining Supabase Storage buckets are migrated or retired.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_*`, and Lovable-specific runtime dependencies are no longer required.

## Prohibited in this phase

- No remote D1 create/write.
- No production R2 PUT, DELETE, COPY, or MOVE.
- No Supabase/Lovable data mutation.
- No Cloudflare env or Secret mutation.
- No deploy, commit, push, or git add.
