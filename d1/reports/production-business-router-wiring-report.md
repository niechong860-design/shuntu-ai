# Production Business Router Wiring Report

## Scope

- Phase: Cloudflare D1 primary business database preparation.
- Default runtime primary: `DATABASE_PRIMARY` unset or empty routes to Lovable/Supabase.
- D1 runtime primary: only exact `DATABASE_PRIMARY=d1` routes to D1.
- Invalid values, including `D1`, `dl`, `postgres`, `true`, and `1`, fail safe to Lovable/Supabase.
- No production D1, Supabase, Lovable, R2, Auth, Storage, Cloudflare Secret, deploy, git add, commit, or push operation was performed.

## BusinessDatabase Wiring

- Shared interface: `src/lib/business-database.ts`.
- Lovable/Supabase adapter: `src/lib/lovable-business-database.ts`.
- D1 adapter: `src/lib/d1-business-database.ts`.
- Runtime router: `src/lib/business-database-router.ts`.
- Primary resolver: `src/lib/database-primary.ts`.

## Wired Production Server Paths

- Generation credits: `consumeGeneration`, `generateImage`, `checkImageStatus`.
- Generation tasks: `getMyGenerationTasks`, `createGenerationTask`, `cancelMyQueuedGenerationTasks`, `cancelGenerationTask`, `startGenerationTask`, `pollGenerationTask`.
- Generation finalize/history: `finalizeUserGenerationTaskOnce`, `getMyGenerationHistory`, `/api/history-thumbnail/$id`.
- Profile/credits UX: `getCurrentProfile`, `updateCurrentProfile`, and `use-auth` profile loading.
- Public config: `listModelsConfig`, `listVisibleRechargePackages`, `listActiveAds`, `listAnnouncements`, `listStyleTemplates`, `getContactInfo`.
- Payments: `createXunhuPayOrder`, `getUserOrderStatus`, `confirmXunhuPayOrder`, `/api/xunhupay/notify`.
- Coupons: `redeemCoupon`.

## Remaining Direct Supabase DB Calls

- Auth/roles: intentionally remains Supabase for this phase.
- Supabase Storage: intentionally remains Supabase for active non-generated-image buckets.
- Admin analytics/config mutation: still Lovable/Supabase-only until a later admin-D1 phase, with legacy write guards blocking those writes when `DATABASE_PRIMARY=d1`.
- Inspiration/case social workflow: still Lovable/Supabase-only until a later case-D1 phase, with legacy write guards blocking those writes when `DATABASE_PRIMARY=d1`.
- Client profile/credits reads and profile updates no longer use direct browser Supabase DB access; they route through server-side `BusinessDatabase`.

See `d1/reports/production-callsite-inventory.md` for the exact file/line inventory.

## D1 Semantics

- D1 stores credits/cost/package credits as integer centi-credit.
- D1 stores RMB order amount as integer fen.
- Adapter boundaries convert D1 integer units back to legacy business numeric units before returning data to callers.
- Server code must derive `user_id` from authenticated context claims/sub; browser-supplied user IDs are not trusted for D1 writes.
- Browser code does not get a D1 binding; D1 access is server-side through `BusinessDatabase` only.

## Outbox

- D1 authoritative writes include row-state replication events for warm standby.
- Outbox payloads are checked for secret-like keys and bearer/JWT-like values before insertion.
- Replication writes to Lovable/Supabase are row-state UPSERT/DELETE operations only.
- Replication does not call business RPCs such as consume/finalize/payment/coupon RPCs, preventing second business execution.

## Local Validation

- `node d1/scripts/legacy-image-inventory-stability.mjs`: PASS.
- `node d1/scripts/production-callsite-inventory.mjs`: PASS, 0 BUG classifications.
- `node d1/scripts/business-router-production-simulation.mjs`: PASS.
- `node d1/scripts/d1-business-layer-integration-test.mjs`: PASS.
- `node d1/scripts/warm-standby-rollback-test.mjs`: PASS.
- `node d1/scripts/reconcile-databases.mjs`: PASS.
- `node d1/scripts/build-import.mjs --externalize-base64`: PASS.

## Cutover Readiness Notes

- The first production infrastructure write phase can be planned after review: create remote D1 and upload only `NEEDS_UPLOAD` legacy objects.
- `DATABASE_PRIMARY=d1` production switch still requires final baseline-to-delta sync, production remote reconciliation, Preview verification, and explicit user authorization.
- Lovable/Supabase must remain available while Auth, remaining Storage buckets, admin DB paths, and inspiration/case workflows still depend on it.
