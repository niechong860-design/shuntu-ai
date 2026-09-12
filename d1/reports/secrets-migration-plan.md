# SHUNTU Cloudflare Secrets Migration Plan

Generated at: 2026-09-10T20:01:38.749Z
Production API keys are reported by the user as already configured in Cloudflare env/secrets. This plan does not read, print, create, update, or delete any Cloudflare Secret.

## Database Secret-Like Fields

| field | non-null | max UTF-8 bytes | current use | migration status |
| --- | ---: | ---: | --- | --- |
| admin_settings.access_password | 1 | 6 | admin access gate setting | keep until admin-password product decision |
| global_config.global_api_key | 1 | 26 | global provider fallback key | candidate for Cloudflare Secret after code migration |
| models_config.api_key | 5 | 51 | provider/admin model configuration | keep until provider secret resolver replaces DB read |

## Recommended Order

1. Keep DB columns during first remote D1 import so current code paths remain readable.
2. Move provider keys to Cloudflare Secrets/env bindings in Worker/server code, with DB values used only as a temporary fallback if explicitly approved.
3. Remove admin UI write/read dependency for provider secret fields after server-side secret resolution is live.
4. Only after production traffic is verified, clear or drop DB secret fields in a separate authorized data-cleanup phase.

## Code Reference Summary

- Secret/config related references found: 138
- src/components/admin/ModelsPanel.tsx:23
- src/components/admin/ModelsPanel.tsx:39
- src/components/admin/ModelsPanel.tsx:52
- src/components/admin/ModelsPanel.tsx:102
- src/components/admin/ModelsPanel.tsx:150
- src/components/admin/ModelsPanel.tsx:180
- src/components/admin/ModelsPanel.tsx:270
- src/components/admin/ModelsPanel.tsx:271
- src/components/admin/ModelsPanel.tsx:425
- src/components/admin/ModelsPanel.tsx:547
- src/components/admin/ModelsPanel.tsx:549
- src/components/admin/ModelsPanel.tsx:559
- src/integrations/supabase/types.ts:17
- src/integrations/supabase/types.ts:19
- src/integrations/supabase/types.ts:27
- src/integrations/supabase/types.ts:35
- src/integrations/supabase/types.ts:380
- src/integrations/supabase/types.ts:383
- src/integrations/supabase/types.ts:389
- src/integrations/supabase/types.ts:395
- src/integrations/supabase/types.ts:461
- src/integrations/supabase/types.ts:463
- src/integrations/supabase/types.ts:480
- src/integrations/supabase/types.ts:497
- src/lib/admin.functions.ts:383
- src/lib/admin.functions.ts:388
- src/lib/admin.functions.ts:390
- src/lib/admin.functions.ts:398
- src/lib/admin.functions.ts:404
- src/lib/admin.functions.ts:405
- src/lib/admin.functions.ts:419
- src/lib/admin.functions.ts:436
- src/lib/admin.functions.ts:449
- src/lib/admin.functions.ts:463
- src/lib/admin.functions.ts:474
- src/lib/admin.functions.ts:481
- src/lib/admin.functions.ts:499
- src/lib/admin.functions.ts:814
- src/lib/admin.functions.ts:1319
- src/lib/admin.functions.ts:1321
- src/lib/admin.functions.ts:1322
- src/lib/admin.functions.ts:1332
- src/lib/admin.functions.ts:1734
- src/lib/admin.functions.ts:1735
- src/lib/admin.functions.ts:1903
- src/lib/admin.functions.ts:1905
- src/lib/admin.functions.ts:1906
- src/lib/admin.functions.ts:1911
- src/lib/admin.functions.ts:1927
- src/lib/admin.functions.ts:1933
- src/lib/admin.functions.ts:1937
- src/lib/admin.functions.ts:2038
- src/lib/admin.functions.ts:2041
- src/lib/admin.functions.ts:2042
- src/lib/admin.functions.ts:2074
- src/lib/admin.functions.ts:2369
- src/lib/admin.functions.ts:2370
- src/lib/admin.functions.ts:2890
- src/lib/admin.functions.ts:2891
- src/lib/admin.functions.ts:2895
- src/lib/admin.functions.ts:2905
- src/lib/admin.functions.ts:2906
- src/lib/admin.functions.ts:2910
- src/lib/admin.functions.ts:2919
- src/lib/admin.functions.ts:2920
- src/lib/admin.functions.ts:3014
- src/lib/admin.functions.ts:3028
- src/lib/admin.functions.ts:3038
- src/lib/admin.functions.ts:3053
- src/lib/admin.functions.ts:3076
- src/lib/admin.functions.ts:3171
- src/lib/admin.functions.ts:3173
- src/lib/admin.functions.ts:3174
- src/lib/admin.functions.ts:3207
- src/lib/xunhupay.server.ts:19
- src/lib/xunhupay.server.ts:20
- src/lib/xunhupay.server.ts:317
- src/lib/xunhupay.server.ts:337
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:182
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:190
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:198
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:201
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:203
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:208
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:209
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:212
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:244
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:271
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:274
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:276
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:279
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:282
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:284
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:312
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:314
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:319
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:322
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:325
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:327
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:340
- supabase/migrations/20260524155938_b0073e9b-cafd-4004-983d-527d5fcde278.sql:2
- supabase/migrations/20260524155938_b0073e9b-cafd-4004-983d-527d5fcde278.sql:5
- supabase/migrations/20260524155938_b0073e9b-cafd-4004-983d-527d5fcde278.sql:7
- supabase/migrations/20260524155938_b0073e9b-cafd-4004-983d-527d5fcde278.sql:25
- supabase/migrations/20260524155938_b0073e9b-cafd-4004-983d-527d5fcde278.sql:27
- supabase/migrations/20260525040649_a1187710-4472-4005-97c0-26f4f5d5b5b9.sql:1
- supabase/migrations/20260525040649_a1187710-4472-4005-97c0-26f4f5d5b5b9.sql:2
- supabase/migrations/20260525040649_a1187710-4472-4005-97c0-26f4f5d5b5b9.sql:3
- supabase/migrations/20260525040649_a1187710-4472-4005-97c0-26f4f5d5b5b9.sql:8
- supabase/migrations/20260525040649_a1187710-4472-4005-97c0-26f4f5d5b5b9.sql:9
- supabase/migrations/20260527233738_c160a42b-9af3-4af9-94e0-86abbf90c668.sql:1
- supabase/migrations/20260605093000_finalize_generation_task_once.sql:112
- supabase/migrations/20260606090000_create_credit_usage_logs.sql:94
- supabase/migrations/20260606090000_create_credit_usage_logs.sql:248
- supabase/migrations/20260606110000_finalize_user_generation_task_once.sql:65
- scripts/backup-shuntu-db.mjs:16
- scripts/backup-shuntu-db.mjs:22
- scripts/backup-shuntu-db.mjs:24

## Current Classification

- models_config.api_key: still used by provider/admin model config paths; not safe to remove from D1 until code resolves provider credentials from Cloudflare Secrets.
- global_config.global_api_key: server code has WUYIN_API_KEY env fallback; strongest candidate for Cloudflare Secret-only operation after code path is hardened.
- admin_settings.access_password: admin access product setting, not a provider API key; can move to a secret only if password management behavior changes.
- XUNHUPAY_APPID / XUNHUPAY_APPSECRET: already env-style references; no DB source field found in frozen backup.

## Not Performed

- No DB secret field was deleted, cleared, masked, or rewritten.
- No Cloudflare Secret was created, updated, or read.
- No Provider/Auth/Canvas/payment code was modified.
