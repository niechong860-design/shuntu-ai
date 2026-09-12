# SHUNTU D1 Cutover Readiness Final Report

Generated at: 2026-09-11

## Summary

- CUTOVER_BLOCKER remaining count: 0 for critical business database cutover; Auth/Storage shutdown remains out of scope.
- Dual-primary-causing WRITE count: 0.
- Default primary remains `lovable`; only exact `DATABASE_PRIMARY=d1` routes critical business data to D1.
- Invalid `DATABASE_PRIMARY` values fail safe to `lovable`.
- Browser code has no direct D1 binding; D1 is reached through server-side `BusinessDatabase` only.

## Production Path Status

- Profile/credits: PASS.
- Generation task/history/finalize: PASS.
- Consume credits: PASS.
- Payment order/create/confirm/notify: PASS.
- Coupon redeem: PASS.
- Config/recharge reads: PASS.
- Admin/inspiration legacy write paths: isolated and blocked when `DATABASE_PRIMARY=d1`.

## Validation Status

- Legacy image SHA validation: PASS, 22 unique binaries, 112,526,291 bytes staged, dry-run uploader only.
- Local D1 rebuild: PASS, 19 tables, counts/aggregates/unique constraints PASS, no remaining `data:image/` values.
- Remote D1 size compatibility: PASS.
- Production call-site inventory: PASS, critical write bypass count 0.
- Business router simulation: PASS.
- D1 business layer integration tests: PASS.
- Warm standby rollback/outbox test: PASS.
- Frozen baseline vs local D1 reconciliation: PASS.
- Supabase to D1 catch-up dry-run: READY; frozen and `supabase-readonly` modes both PASS without production writes.

## Production Operation Sequence

1. Create Cloudflare remote D1 `shuntu-prod` and record the database id.
2. Bind remote D1 as `DB` in the approved Cloudflare environment; keep `DATABASE_PRIMARY=lovable`.
3. Run legacy R2 uploader dry-run, then upload only `NEEDS_UPLOAD` legacy objects with explicit production confirmation.
4. Verify legacy R2 object key, public URL, content type, byte length, and SHA256 where safe.
5. Apply D1 schema migrations to the empty remote D1.
6. Import the frozen baseline package generated from the frozen backup, recharge supplement, and legacy image manifest.
7. Run Supabase-to-D1 incremental catch-up dry-run, package review, authorized execute, and reconciliation.
8. Enter maintenance mode, pause critical writes, run final delta catch-up, and reconcile again.
9. Connect Preview to remote D1 with `DATABASE_PRIMARY=d1` and validate critical flows.
10. Switch production `DATABASE_PRIMARY=d1` only after Preview passes and user authorization is explicit.
11. Start D1-to-Lovable outbox replication and monitor pending outbox, oldest pending age, D1 errors, credit/order/coupon mismatches.
12. Keep Lovable/Supabase online until Supabase Auth and remaining Supabase Storage buckets are migrated or intentionally retired.
