# Production Call-Site Inventory

## Wired Through BusinessDatabase

- redeemCoupon
- listModelsConfig
- consumeGeneration
- getMyGenerationHistory
- getMyGenerationTasks
- createGenerationTask
- cancelMyQueuedGenerationTasks
- cancelGenerationTask
- startGenerationTask
- pollGenerationTask
- generateImage
- checkImageStatus
- getCurrentProfile
- updateCurrentProfile
- listVisibleRechargePackages
- listActiveAds
- listAnnouncements
- listStyleTemplates
- createXunhuPayOrder
- getUserOrderStatus
- confirmXunhuPayOrder
- /api/xunhupay/notify
- /api/history-thumbnail/$id

## Remaining Direct Supabase Calls

| file | line | operation | target | classification | reason |
|---|---:|---|---|---|---|
| src/lib/admin.functions.ts | 83 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 93 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 123 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 128 | rpc | admin_credit_usage_totals | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 192 | from | credit_usage_logs | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 213 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 225 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 258 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 276 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 281 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 282 | from | generation_history | INTENTIONAL | Lovable-only admin/prune/delete behavior retained; D1 delete semantics remain a later controlled phase. |
| src/lib/admin.functions.ts | 283 | from | profiles | INTENTIONAL | Lovable-only admin/prune/delete behavior retained; D1 delete semantics remain a later controlled phase. |
| src/lib/admin.functions.ts | 312 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 319 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 338 | from | coupons | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 356 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 384 | from | coupons | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 388 | from | coupons | INTENTIONAL | Lovable-only admin/prune/delete behavior retained; D1 delete semantics remain a later controlled phase. |
| src/lib/admin.functions.ts | 407 | from | coupons | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 445 | from | models_config | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 461 | from | models_config | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 492 | from | models_config | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 518 | from | models_config | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 544 | from | models_config | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 604 | from | generation_tasks | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 642 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 656 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 665 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 676 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 685 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 694 | from | generation_history | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 1820 | from | global_config | INTENTIONAL | Residual direct call guarded to Lovable-only compatibility path or admin-only inventory. |
| src/lib/admin.functions.ts | 2342 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 2369 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2370 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2371 | from | coupons | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2372 | from | credit_usage_logs | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2373 | from | credit_usage_logs | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2374 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2490 | from | recharge_packages | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2528 | from | recharge_packages | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2536 | from | recharge_packages | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2551 | from | recharge_packages | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2565 | from | recharge_packages | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2592 | from | ads | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2615 | from | ads | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2621 | from | ads | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2636 | from | ads | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2668 | from | announcements | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2705 | from | announcements | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2708 | from | announcements | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2720 | from | announcements | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2731 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 2738 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2757 | from | profiles | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2764 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 2776 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |
| src/lib/admin.functions.ts | 2811 | from | admin_settings | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2835 | from | style_templates | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2857 | from | style_templates | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2876 | from | style_templates | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2882 | from | style_templates | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2899 | from | style_templates | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2919 | from | admin_settings | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/admin.functions.ts | 2959 | from | admin_settings | LEGACY_DB_ISOLATED | Admin analytics/config legacy DB path remains Lovable-only; mutation paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 46 | from | inspiration_cases | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 69 | from | case_likes | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 70 | from | case_favorites | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 72 | from | profiles | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 92 | from | inspiration_cases | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 119 | from | inspiration_cases | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 121 | from | case_comments | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 127 | from | case_likes | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 133 | from | case_favorites | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 146 | from | profiles | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 168 | rpc | increment_case_view | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 179 | from | case_likes | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 186 | from | case_likes | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 194 | from | case_likes | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 207 | from | case_favorites | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 214 | from | case_favorites | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 222 | from | case_favorites | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 236 | from | case_comments | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/inspiration.functions.ts | 262 | from | inspiration_cases | LEGACY_DB_ISOLATED | Inspiration/case social tables remain Lovable-only; write paths are blocked when DATABASE_PRIMARY=d1. |
| src/lib/lovable-business-database.ts | 47 | from | profiles | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 64 | from | profiles | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 83 | from | profiles | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 114 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 120 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 127 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 137 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 149 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 165 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 178 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 193 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 206 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 232 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 240 | rpc | consume_credits_for_generation | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 256 | rpc | finalize_user_generation_task_once | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 273 | from | generation_history | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 289 | from | generation_history | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 303 | from | generation_tasks | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 310 | from | profiles | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 317 | from | generation_history | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 328 | rpc | set_latest_history_image | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 337 | from | user_orders | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 354 | from | user_orders | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 364 | from | user_orders | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 373 | rpc | complete_paid_order | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 383 | rpc | redeem_gift_card | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 399 | from | models_config | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 407 | from | global_config | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 413 | from | admin_settings | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 419 | from | announcements | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 425 | from | ads | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 431 | from | style_templates | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/lib/lovable-business-database.ts | 438 | from | recharge_packages | INTENTIONAL | Lovable adapter implementation behind BusinessDatabase. |
| src/routes/api/history-thumbnail.$id.ts | 54 | from | user_roles | AUTH | Supabase Auth / role inventory intentionally remains on Supabase for this phase. |

## Summary

- AUTH: 11
- INTENTIONAL: 45
- LEGACY_DB_ISOLATED: 62
- legacy write guards: 28
- critical write bypass count: 0

No raw row data, API keys, tokens, or secrets are included in this inventory.
