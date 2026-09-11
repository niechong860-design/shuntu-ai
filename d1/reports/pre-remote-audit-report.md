# SHUNTU Pre-Remote D1 Compatibility Audit

Generated at: 2026-09-10T20:01:38.749Z
Repository: C:\Users\21972\Desktop\ai-shuntu-d1
Backup source: C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13

## recharge_packages

- Status: SUPPLEMENTAL READ-ONLY SNAPSHOT
- Frozen backup source present: NO
- Production code references: 23
- Service-role read available: YES
- Supplemental rows: 5
- Supplemental SHA256: 2d5e0363da2dc4c2ba5ab707f75e1788238a600dfadfd06d440428a90f30bd03

- src/components/admin/RechargePackagesPanel.tsx:93
- src/components/admin/RechargePackagesPanel.tsx:94
- src/integrations/supabase/types.ts:545
- src/lib/admin.functions.ts:2591
- src/lib/admin.functions.ts:2605
- src/lib/admin.functions.ts:2642
- src/lib/admin.functions.ts:2650
- src/lib/admin.functions.ts:2664
- src/lib/admin.functions.ts:2677
- src/lib/payment.functions.ts:52
- supabase/migrations/20260613090000_create_recharge_packages.sql:5
- supabase/migrations/20260613090000_create_recharge_packages.sql:21
- supabase/migrations/20260613090000_create_recharge_packages.sql:22
- supabase/migrations/20260613090000_create_recharge_packages.sql:23
- supabase/migrations/20260613090000_create_recharge_packages.sql:30
- supabase/migrations/20260613090000_create_recharge_packages.sql:32
- supabase/migrations/20260613090000_create_recharge_packages.sql:36
- supabase/migrations/20260613090000_create_recharge_packages.sql:41
- supabase/migrations/20260613090000_create_recharge_packages.sql:42
- supabase/migrations/20260613090000_create_recharge_packages.sql:45
- supabase/migrations/20260821090000_sync_recharge_package_credits.sql:2

## Sensitive Fields

| table | column | source rows | non-null | max UTF-8 bytes |
| --- | --- | ---: | ---: | ---: |
| admin_settings | access_password | 1 | 1 | 6 |
| global_config | global_api_key | 1 | 1 | 26 |
| models_config | api_key | 7 | 5 | 51 |

## Supabase Auth Dependency

- Still depends on Supabase/Lovable after D1-only migration: YES
- Conclusion: YES - D1 data migration alone still depends on Supabase Auth for sessions, client auth flows, bearer claims, and legacy auth.uid SQL/RLS/RPC logic.

| pattern | occurrences |
| --- | ---: |
| supabase.auth | 13 |
| getUser | 0 |
| getSession | 4 |
| onAuthStateChange | 1 |
| getClaims | 1 |
| auth.uid | 102 |

- src/components/auth/AuthModal.tsx:280
- src/components/auth/AuthModal.tsx:288
- src/components/auth/AuthModal.tsx:298
- src/components/auth/AuthModal.tsx:316
- src/components/auth/SettingsDialog.tsx:33
- src/components/auth/SettingsDialog.tsx:38
- src/components/studio/Canvas.tsx:107
- src/components/studio/Canvas.tsx:916
- src/hooks/use-auth.tsx:35
- src/hooks/use-auth.tsx:43
- src/hooks/use-auth.tsx:56
- src/integrations/supabase/auth-attacher.ts:9
- src/lib/supabase-request-auth.ts:27
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:30
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:32
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:34
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:79
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:80
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:84
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:87
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:89
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:107
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:108
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:117
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:174
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:176
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:179
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:180
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:205
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:206
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:228
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:286
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:287
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:305
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:306
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:329
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:330
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:358
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:359
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:408
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:410
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:413
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:414
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:417
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:433
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:435
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:437
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:449
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:451
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:453
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:470
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:473
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:549
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:576
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:579
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:582
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:583
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:586
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:590
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:593
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:597
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:600
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:601
- supabase/migrations/20260524145741_15d17e93-4401-4e7c-9ef3-30b90581c56b.sql:604
- supabase/migrations/20260524190713_c199bbdc-2e48-4157-b649-40cbcc682304.sql:23
- supabase/migrations/20260524190713_c199bbdc-2e48-4157-b649-40cbcc682304.sql:28
- supabase/migrations/20260524190713_c199bbdc-2e48-4157-b649-40cbcc682304.sql:33
- supabase/migrations/20260524190713_c199bbdc-2e48-4157-b649-40cbcc682304.sql:34
- supabase/migrations/20260524231043_3c34c12a-b4e5-4f9d-8cca-09c8c59b2fe5.sql:21
- supabase/migrations/20260524231043_3c34c12a-b4e5-4f9d-8cca-09c8c59b2fe5.sql:26
- supabase/migrations/20260524231043_3c34c12a-b4e5-4f9d-8cca-09c8c59b2fe5.sql:27
- supabase/migrations/20260524231043_3c34c12a-b4e5-4f9d-8cca-09c8c59b2fe5.sql:34
- supabase/migrations/20260524231043_3c34c12a-b4e5-4f9d-8cca-09c8c59b2fe5.sql:44
- supabase/migrations/20260524235749_5bf7dbc6-a2fa-468d-b20f-e9cbd3eac1db.sql:10
- supabase/migrations/20260524235749_5bf7dbc6-a2fa-468d-b20f-e9cbd3eac1db.sql:28
- supabase/migrations/20260524235749_5bf7dbc6-a2fa-468d-b20f-e9cbd3eac1db.sql:32
- supabase/migrations/20260524235749_5bf7dbc6-a2fa-468d-b20f-e9cbd3eac1db.sql:36
- supabase/migrations/20260525031740_b74e5f31-f43d-4c60-8f5b-c42aebefa3f1.sql:9
- supabase/migrations/20260525031740_b74e5f31-f43d-4c60-8f5b-c42aebefa3f1.sql:13
- supabase/migrations/20260525031740_b74e5f31-f43d-4c60-8f5b-c42aebefa3f1.sql:14

## Supabase Storage Dependency

- Generated image archive has R2 references: YES

| bucket | refs | read | write | already replaced by R2 |
| --- | ---: | --- | --- | --- |
| reference-images | 13 | YES | YES | NO |
| avatars | 13 | YES | YES | NO |
| admin-assets | 17 | YES | YES | NO |
| case-images | 14 | YES | YES | NO |

## Prohibited Operations

- No Supabase/Lovable writes were performed.
- No remote D1 create/write was performed.
- No production R2 write was performed.
- No Auth or Provider code migration was performed.
