# SHUNTU D1 Migration Verification Report

Generated at: 2026-09-10T22:54:04.423Z
Repository: C:\Users\21972\Desktop\ai-shuntu-d1
Backup source: C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13
Local D1 database: C:\Users\21972\Desktop\ai-shuntu-d1\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite
Local D1 mode: wrangler d1 execute --local schema bootstrap + node:sqlite prepared import

## Source SHA256

- Result: PASS
- Matched: 37/37
- SHA256SUMS.csv itself was excluded from recalculation.

## recharge_packages

- Status: SUPPLEMENTAL READ-ONLY SNAPSHOT
- Snapshot SHA256: 2d5e0363da2dc4c2ba5ab707f75e1788238a600dfadfd06d440428a90f30bd03
- Source rows: 5
- Imported: YES
- No default package rows were fabricated.

## generation_tasks base64

- Base64 rows: 14
- Total decoded bytes: 95777338
- Total text bytes: 127703452
- Retained in local D1: NO
- Externalized for remote-compatible import: YES
- Derived changed rows: 30
- D1 remaining data:image base64 rows: 0
- D1 proposed public URL rows: 30

| task id | request id | mime type | encoded bytes | decoded bytes | decoded sha256 | text bytes |
| --- | --- | --- | ---: | ---: | --- | ---: |
| 085c3b79-9b1e-4f3e-b4be-18bca102d4d3 | task_20c1bb1e-e584-4ec9-a181-5bed37f9b90b | image/png | 7717108 | 5787829 | aa26311804a79b73442700a230900b509edfdf5c3b8adb063c91f64e9626be58 | 7717130 |
| 11655210-ab45-48f5-80d7-f366d55fc165 | task_760924df-ef40-4610-a72f-297fd10985e2 | image/png | 3203432 | 2402572 | f0b2422a82669ee0960d81f9364bb11dd373a0088e6dbe3e4dc878414937d182 | 3203454 |
| 1b251dbd-a6f9-4501-b1c1-e94cc9bb5b55 | task_588ff5c9-b954-4060-b74b-f24fe50491b1 | image/png | 25858524 | 19393892 | 07d81c10403e031912b8b55e477494a76e890035a9c7d96fc822076aa5478fa5 | 25858546 |
| 279e0794-09a0-4f71-9a1f-ece3dd931f32 | task_4b464955-42ee-4d74-8ed4-1e9a5f8751d5 | image/png | 8059200 | 6044398 | 2a970821254f14b9ca9e56add3b2afb75db71bd6d0cde7b7d084cc9b4f74e2fa | 8059222 |
| 2a3a45d0-5442-4792-bc11-83fde7457d59 | task_aaa069e8-aaa3-4467-af5d-eded9b24c673 | image/png | 9247404 | 6935551 | 9a3c4ceb5273726afc686fe90d55804b2d558d5f3076333ae8ce52dcd498d430 | 9247426 |
| 76e54da6-931c-40fc-b3d5-7c163becea34 | task_b79a95a2-4af0-41ee-a216-a99449be49a8 | image/png | 8224120 | 6168088 | f9b1d9cde58c52630a92428511b5f20bc393cf776561f1fd4c9f0483ae2a322f | 8224142 |
| 7a8057cf-6718-494c-a8d0-65defa0ede64 | task_8dc6174c-dde0-4e31-af53-a8fc87391ab7 | image/png | 9976696 | 7482520 | 8fa858e149c8bb187b69b3b700c0ffe5fb00a2352da8b7c3f699f3c5671a9594 | 9976718 |
| 8e244dbe-8551-457b-b74a-f3c6e9b1f820 | task_32eafe28-8b50-4c8b-9425-255c2d3c040b | image/png | 24541368 | 18406025 | 00e2456f1ee4ea3eadbba488e70981aeee049995099dffb568d3806b0402c5ba | 24541390 |
| a16027d8-bfb3-4d16-b447-704ef9a1fd3d | task_b2019ab6-9896-4b78-af4d-b8a3dbbb46d2 | image/png | 2419056 | 1814291 | 6768cef594025ad30632f015771ca6614a43457be48386c8154a96066ef007c7 | 2419078 |
| bcc91149-0a55-416c-91d8-c1dc0aefadcb | task_85599b62-5374-487b-9d1c-e9b100b1cf6f | image/png | 2407164 | 1805372 | 3a669a5b1cf0380eb1ebde72540bf2e205da6dc87cc16bce05255664cc9fc85d | 2407186 |
| bdc6266a-f2ae-4538-b43f-d95eb677b297 | task_a350bc1e-7c5b-4fb9-8bb2-77c34ef81fe1 | image/png | 9736744 | 7302558 | 640d6632c3ba3a477162a1c2993f883baf9d4456de778398d4be1aa589d8f128 | 9736766 |
| bf4c89d3-8469-444b-a49a-0da3827dbfa9 | task_1a2572e9-45fb-4984-9f1f-4af55b43f17b | image/png | 3288084 | 2466061 | 22bce34adb90cf9103860fc663150a671993850e863a4780949e8b6096d7feea | 3288106 |
| d5ccf7dd-deb7-498b-b16d-0cffa147fc20 | task_de369dd6-638f-4fc8-854d-e41634201f39 | image/png | 2280732 | 1710548 | 75f23f7c09c6ffce8612796a65072c16f64d5e966424eb969ca01a7e0de83ed6 | 2280754 |
| ea504908-6dd2-425c-a955-9914e9554340 | task_5f496d80-b7b6-4d75-b903-e304e63b41e3 | image/png | 10743512 | 8057633 | 852fb959293322a2763fb6f7637c4f4a51c86c6f6b17296b23796d7b21f08461 | 10743534 |

## generation_history oversized image_url

- Rows >= 2MB before externalization: 15
- Non data-url rows in this set: 0
- Total decoded bytes: 66930102
- Total text bytes: 89240516

| history id | generation_task_id | user_id | type | mime type | encoded bytes | decoded bytes | decoded sha256 | text bytes |
| --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |
| 0c30a21d-3839-4d55-ae00-9fa3fff2c74e |  | 0020d5c1-8c0b-4443-8a13-0368a069338a | data:image/png;base64 | image/png | 2224716 | 1668536 | 4d9503177ce3e41f8fe668dd5484ea4264c7ad1c2b3817cab3161d7f14ab54ea | 2224738 |
| 18bc186d-2e8f-4955-9735-2ff34dcf64a9 | 085c3b79-9b1e-4f3e-b4be-18bca102d4d3 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 7717108 | 5787829 | aa26311804a79b73442700a230900b509edfdf5c3b8adb063c91f64e9626be58 | 7717130 |
| 1b1f782e-83d2-472e-af51-a0fcf8f7f560 | 279e0794-09a0-4f71-9a1f-ece3dd931f32 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 8059200 | 6044398 | 2a970821254f14b9ca9e56add3b2afb75db71bd6d0cde7b7d084cc9b4f74e2fa | 8059222 |
| 289eb09a-eb3b-47ac-8e54-bf72284d84fe |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 3494968 | 2621224 | 0d00d30643d3b37b4dfd6996b2470bd45d0e98efaed16c2c5a7e4a88c5c55944 | 3494990 |
| 3bfe21c3-bae6-467f-ad30-9a01a9499a10 |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 2904472 | 2178354 | 887c3ca284cba8216b573beb78f13cd44b89b68ea8188446c8aee3a622d19240 | 2904494 |
| 3c3d20db-4b09-4545-92cf-dcbf45094cc7 |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 2865692 | 2149268 | 74af9d9f05fd934aa019404d1583f1be4e58c8987d0603d9acbbe9bdff5bb174 | 2865714 |
| 45b5b075-f346-473e-ab99-b14b786d0b90 | bdc6266a-f2ae-4538-b43f-d95eb677b297 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 9736744 | 7302558 | 640d6632c3ba3a477162a1c2993f883baf9d4456de778398d4be1aa589d8f128 | 9736766 |
| 64ebee84-bb6d-44f9-b71a-790d6110bb39 | 76e54da6-931c-40fc-b3d5-7c163becea34 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 8224120 | 6168088 | f9b1d9cde58c52630a92428511b5f20bc393cf776561f1fd4c9f0483ae2a322f | 8224142 |
| 7d8849de-4ba7-443a-805f-abbd8b36ec24 | 11655210-ab45-48f5-80d7-f366d55fc165 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 3203432 | 2402572 | f0b2422a82669ee0960d81f9364bb11dd373a0088e6dbe3e4dc878414937d182 | 3203454 |
| bb3fe089-4f12-478b-9a9f-adad4a83a42b | ea504908-6dd2-425c-a955-9914e9554340 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 10743512 | 8057633 | 852fb959293322a2763fb6f7637c4f4a51c86c6f6b17296b23796d7b21f08461 | 10743534 |
| c93dafe0-f103-42f6-bf33-096fbd258fbd | 2a3a45d0-5442-4792-bc11-83fde7457d59 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 9247404 | 6935551 | 9a3c4ceb5273726afc686fe90d55804b2d558d5f3076333ae8ce52dcd498d430 | 9247426 |
| ce8bac4e-2519-4188-8496-6959ecc10300 | 7a8057cf-6718-494c-a8d0-65defa0ede64 | be8c4685-5452-4f84-8bc6-6cec0327589c | data:image/png;base64 | image/png | 9976696 | 7482520 | 8fa858e149c8bb187b69b3b700c0ffe5fb00a2352da8b7c3f699f3c5671a9594 | 9976718 |
| dcb0c987-61b1-4327-ab6a-55b83df810de |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 2831300 | 2123473 | e507049752862058b95dc1a316184dc1851f69c4c5aa78d30e3522fcf661269e | 2831322 |
| e42168a5-7bed-4a40-9c33-bdefd4b185b9 |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 3258916 | 2444187 | 94252f1c8ec2bc7bd30283783682095c64907a0bf9f53a7c39299a1324c28d65 | 3258938 |
| f741ced3-759a-4717-8de3-817099d8461f |  | 92595c98-4025-4a27-b4eb-00380d21c1b9 | data:image/png;base64 | image/png | 2800124 | 2100092 | 8ae5acdf9bdb22d3896965d92d9821fa3ab35cf1727c2d1d7e545b45e1ee64f7 | 2800146 |

## Legacy image externalization manifest

- Manifest: C:\Users\21972\Desktop\ai-shuntu-d1\d1\reports\legacy-image-externalization-manifest.json
- Staging directory: C:\Users\21972\Desktop\ai-shuntu-d1\d1\staging\legacy-generated-images
- Staging files: 22
- Staging total bytes: 112526291
- Staging verification: PASS
- Proposed R2 namespace: migration/legacy-generated-images/v1
- R2 public host: https://img.shuntu.cc
- R2 host source: wrangler.jsonc vars.R2_PUBLIC_BASE_URL
- R2 reuse ALREADY_IN_R2: 0
- R2 reuse NEEDS_UPLOAD: 22
- R2 reuse AMBIGUOUS: 0
- R2 reuse MISMATCH: 0
- References: 30 (14 generation_tasks, 16 generation_history)
- Unique binaries: 22
- Shared task/history binaries: 8
- Task-only binaries: 6
- History-only binaries: 8
- Decoded bytes after dedupe: 112526291
- generation_tasks changed rows: 14
- generation_history changed rows: 16
- Existing generated R2 URL rows preserved: 18713
- D1 generation_tasks data:image rows: 0
- D1 generation_history data:image rows: 0
- D1 all-table data:image rows: 0
- D1 generation_history image_url >= 2MB rows: 0

| history id | generation_task_id | same decoded sha256 |
| --- | --- | --- |
| 0c30a21d-3839-4d55-ae00-9fa3fff2c74e |  | NO |
| 18bc186d-2e8f-4955-9735-2ff34dcf64a9 | 085c3b79-9b1e-4f3e-b4be-18bca102d4d3 | YES |
| 1b1f782e-83d2-472e-af51-a0fcf8f7f560 | 279e0794-09a0-4f71-9a1f-ece3dd931f32 | YES |
| 289eb09a-eb3b-47ac-8e54-bf72284d84fe |  | NO |
| 3bfe21c3-bae6-467f-ad30-9a01a9499a10 |  | NO |
| 3c3d20db-4b09-4545-92cf-dcbf45094cc7 |  | NO |
| 45b5b075-f346-473e-ab99-b14b786d0b90 | bdc6266a-f2ae-4538-b43f-d95eb677b297 | YES |
| 64ebee84-bb6d-44f9-b71a-790d6110bb39 | 76e54da6-931c-40fc-b3d5-7c163becea34 | YES |
| 7d8849de-4ba7-443a-805f-abbd8b36ec24 | 11655210-ab45-48f5-80d7-f366d55fc165 | YES |
| bb3fe089-4f12-478b-9a9f-adad4a83a42b | ea504908-6dd2-425c-a955-9914e9554340 | YES |
| c93dafe0-f103-42f6-bf33-096fbd258fbd | 2a3a45d0-5442-4792-bc11-83fde7457d59 | YES |
| ce8bac4e-2519-4188-8496-6959ecc10300 | 7a8057cf-6718-494c-a8d0-65defa0ede64 | YES |
| dcb0c987-61b1-4327-ab6a-55b83df810de |  | NO |
| e42168a5-7bed-4a40-9c33-bdefd4b185b9 |  | NO |
| f741ced3-759a-4717-8de3-817099d8461f |  | NO |
| fd50c35f-1a36-4eb9-8a00-d918aab02523 |  | NO |

## Count reconciliation

| table | source rows | D1 rows | result |
| --- | ---: | ---: | --- |
| credit_usage_logs | 24154 | 24154 | PASS |
| profiles | 475 | 475 | PASS |
| generation_tasks | 26193 | 26193 | PASS |
| generation_history | 1753 | 1753 | PASS |
| coupons | 5956 | 5956 | PASS |
| redeem_logs | 786 | 786 | PASS |
| admin_settings | 1 | 1 | PASS |
| ads | 1 | 1 | PASS |
| announcements | 16 | 16 | PASS |
| case_comments | 0 | 0 | PASS |
| case_favorites | 0 | 0 | PASS |
| case_likes | 2 | 2 | PASS |
| global_config | 1 | 1 | PASS |
| inspiration_cases | 9 | 9 | PASS |
| models_config | 7 | 7 | PASS |
| style_templates | 12 | 12 | PASS |
| user_orders | 107 | 107 | PASS |
| user_roles | 2 | 2 | PASS |
| recharge_packages | 5 | 5 | PASS |

## Key aggregate checks

| table | result | source JSON aggregate | local D1 aggregate |
| --- | --- | --- | --- |
| profiles | PASS | `{"count":475,"maxCredits":9186600,"minCredits":20,"sumCredits":54234880}` | `{"count":475,"maxCredits":9186600,"minCredits":20,"sumCredits":54234880}` |
| coupons | PASS | `{"count":5956,"sumAmount":2478829000,"unused":5166,"used":790}` | `{"count":5956,"sumAmount":2478829000,"unused":5166,"used":790}` |
| generation_tasks | PASS | `{"base64ResultImageUrlCount":0,"count":26193,"deductionStatusCounts":{"charged":21467,"not_charged":4726},"distinctRequestId":26193,"statusCounts":{"canceled":1332,"failed":3363,"queued":9,"running":18,"succeeded":21471}}` | `{"base64ResultImageUrlCount":0,"count":26193,"deductionStatusCounts":{"charged":21467,"not_charged":4726},"distinctRequestId":26193,"statusCounts":{"canceled":1332,"failed":3363,"queued":9,"running":18,"succeeded":21471}}` |
| generation_history | PASS | `{"base64ImageUrlCount":0,"count":1753,"imageUrlNonNull":1753,"imageUrlNull":0,"modelCounts":{"GPT-Image-2-VIP":104,"GPT-IMAGE-2.0 Pro":1365,"GPT-IMAGE-2.5 Pro":67,"NanoBanana":9,"NanoBanana_pro":58,"NanoBanana2":150},"sumCost":5028400}` | `{"base64ImageUrlCount":0,"count":1753,"imageUrlNonNull":1753,"imageUrlNull":0,"modelCounts":{"GPT-Image-2-VIP":104,"GPT-IMAGE-2.0 Pro":1365,"GPT-IMAGE-2.5 Pro":67,"NanoBanana":9,"NanoBanana_pro":58,"NanoBanana2":150},"sumCost":5028400}` |
| credit_usage_logs | PASS | `{"count":24154,"distinctIdempotencyKey":24154,"distinctUserId":450,"sumAmount":69446300}` | `{"count":24154,"distinctIdempotencyKey":24154,"distinctUserId":450,"sumAmount":69446300}` |
| user_orders | PASS | `{"count":107,"statusCounts":{"paid":36,"pending":71},"sumAmount":503398,"sumCredits":54746000}` | `{"count":107,"statusCounts":{"paid":36,"pending":71},"sumAmount":503398,"sumCredits":54746000}` |
| redeem_logs | PASS | `{"count":786,"failed":0,"success":786,"sumAmount":108167000}` | `{"count":786,"failed":0,"success":786,"sumAmount":108167000}` |

## Unique constraints

| table | field | index | duplicates | result |
| --- | --- | --- | ---: | --- |
| generation_tasks | request_id | generation_tasks_request_id_uidx | 0 | PASS |
| coupons | code | coupons_code_uidx | 0 | PASS |
| user_orders | out_trade_no | user_orders_out_trade_no_uidx | 0 | PASS |
| credit_usage_logs | idempotency_key | credit_usage_logs_idempotency_key_uidx | 0 | PASS |
| models_config | model_key | models_config_model_key_uidx | 0 | PASS |
| user_roles | user_id + role | user_roles_user_id_role_uidx | 0 | PASS |
| generation_history | generation_task_id | generation_history_generation_task_id_uidx | 0 | PASS |
| credit_usage_logs | generation_history_id | credit_usage_logs_generation_history_id_uidx | 0 | PASS |
| credit_usage_logs | generation_task_id | credit_usage_logs_generation_task_id_uidx | 0 | PASS |

## Scaling verification

| field | kind | converted values | min | max |
| --- | --- | ---: | ---: | ---: |
| coupons.amount | centi-credit | 5956 | 5000 | 2500000 |
| credit_usage_logs.amount | centi-credit | 24154 | 1800 | 5800 |
| generation_history.cost | centi-credit | 1753 | 1800 | 5800 |
| generation_tasks.credits_required | centi-credit | 26193 | 1800 | 5800 |
| models_config.cost | centi-credit | 7 | 1800 | 5800 |
| profiles.credits | centi-credit | 475 | 20 | 9186600 |
| recharge_packages.credits | centi-credit | 5 | 100000 | 2200000 |
| redeem_logs.amount | centi-credit | 786 | 5000 | 2500000 |
| user_orders.amount | fen | 107 | 1 | 19900 |
| user_orders.credits | centi-credit | 107 | 0 | 2200000 |

## D1 2MB compatibility

- Status: REMOTE_D1_SIZE_COMPATIBLE
- Field limit checked: < 2000000 UTF-8 bytes
- Warning threshold: >= 1000000 UTF-8 bytes
- Field exists >= limit: NO
- Estimated row exists >= limit: NO
- Max field: credit_usage_logs.metadata / 11083 bytes / row 2d00b092-9c9d-44ca-b6e6-e55f90584098
- Max conservative row estimate: generation_tasks / 12436 bytes / row 851f33f7-21cf-451d-ab18-8ef8f1b9e481

## Local D1 sizes

- Before externalize SQLite bytes: 327356416
- After externalize SQLite bytes: 110202880

## RPC / Auth notes

- Auth was not migrated. Supabase auth UUIDs and user_id values were preserved as TEXT without regeneration.
- RPCs were not implemented in this phase: consume_credits_for_generation, consume_credits_for_generation_v2, set_latest_history_image, finalize_user_generation_task_once, complete_paid_order, redeem_coupon.
- Future Worker design should replace RPC behavior with D1 transactions / idempotent service functions after this local data baseline is accepted.

## Prohibited operations confirmation

- No Supabase/Lovable writes were performed by this script.
- No remote D1 create/write was performed; Wrangler was used with --local only.
- No R2 upload/write was performed.
- No source backup files were modified.
