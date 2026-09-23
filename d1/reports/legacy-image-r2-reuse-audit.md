# SHUNTU Legacy Image R2 Reuse Audit

Generated at: 2026-09-11T11:54:16.777Z
Source backup: C:\Users\21972\Desktop\shuntu-db-backup\2026-09-11_01-55-13
Public host: https://img.shuntu.cc
Generated namespace: generated/
Fallback namespace: migration/legacy-generated-images/v1

## Source Scan

- generation_tasks references: 14
- generation_history references: 16
- total references: 30
- unique binaries: 22
- shared task/history binaries: 8
- task-only binaries: 6
- history-only binaries: 8
- decoded bytes after dedupe: 112526291

## Existing R2 Reuse

- ALREADY_IN_R2: 0
- NEEDS_UPLOAD: 22
- AMBIGUOUS: 0
- MISMATCH: 0

## Key Rule

- src/lib/r2-image-archive.ts / getArchiveKey(taskId, extension, now)
- generated/<UTC year>/<UTC month>/<safe taskId>.<extension>
- archive execution time; candidate audit used task/history created/completed/updated UTC months where available

## Object Classification

| sha256 | status | existing key | fallback key | refs | candidates checked |
| --- | --- | --- | --- | ---: | ---: |
| 00e2456f1ee4ea3eadbba488e70981aeee049995099dffb568d3806b0402c5ba | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/00e2456f1ee4ea3eadbba488e70981aeee049995099dffb568d3806b0402c5ba.png | 1 | 1 |
| 07d81c10403e031912b8b55e477494a76e890035a9c7d96fc822076aa5478fa5 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/07d81c10403e031912b8b55e477494a76e890035a9c7d96fc822076aa5478fa5.png | 1 | 1 |
| 0d00d30643d3b37b4dfd6996b2470bd45d0e98efaed16c2c5a7e4a88c5c55944 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/0d00d30643d3b37b4dfd6996b2470bd45d0e98efaed16c2c5a7e4a88c5c55944.png | 1 | 0 |
| 22bce34adb90cf9103860fc663150a671993850e863a4780949e8b6096d7feea | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/22bce34adb90cf9103860fc663150a671993850e863a4780949e8b6096d7feea.png | 1 | 1 |
| 2a970821254f14b9ca9e56add3b2afb75db71bd6d0cde7b7d084cc9b4f74e2fa | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/2a970821254f14b9ca9e56add3b2afb75db71bd6d0cde7b7d084cc9b4f74e2fa.png | 2 | 1 |
| 3a669a5b1cf0380eb1ebde72540bf2e205da6dc87cc16bce05255664cc9fc85d | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/3a669a5b1cf0380eb1ebde72540bf2e205da6dc87cc16bce05255664cc9fc85d.png | 1 | 1 |
| 44bd9c4aae4bdd250c635289d6dd8c362e801d999e88850da4d07a28e46f8153 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/44bd9c4aae4bdd250c635289d6dd8c362e801d999e88850da4d07a28e46f8153.png | 1 | 0 |
| 4d9503177ce3e41f8fe668dd5484ea4264c7ad1c2b3817cab3161d7f14ab54ea | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/4d9503177ce3e41f8fe668dd5484ea4264c7ad1c2b3817cab3161d7f14ab54ea.png | 1 | 0 |
| 640d6632c3ba3a477162a1c2993f883baf9d4456de778398d4be1aa589d8f128 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/640d6632c3ba3a477162a1c2993f883baf9d4456de778398d4be1aa589d8f128.png | 2 | 1 |
| 6768cef594025ad30632f015771ca6614a43457be48386c8154a96066ef007c7 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/6768cef594025ad30632f015771ca6614a43457be48386c8154a96066ef007c7.png | 1 | 1 |
| 74af9d9f05fd934aa019404d1583f1be4e58c8987d0603d9acbbe9bdff5bb174 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/74af9d9f05fd934aa019404d1583f1be4e58c8987d0603d9acbbe9bdff5bb174.png | 1 | 0 |
| 75f23f7c09c6ffce8612796a65072c16f64d5e966424eb969ca01a7e0de83ed6 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/75f23f7c09c6ffce8612796a65072c16f64d5e966424eb969ca01a7e0de83ed6.png | 1 | 1 |
| 852fb959293322a2763fb6f7637c4f4a51c86c6f6b17296b23796d7b21f08461 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/852fb959293322a2763fb6f7637c4f4a51c86c6f6b17296b23796d7b21f08461.png | 2 | 1 |
| 887c3ca284cba8216b573beb78f13cd44b89b68ea8188446c8aee3a622d19240 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/887c3ca284cba8216b573beb78f13cd44b89b68ea8188446c8aee3a622d19240.png | 1 | 0 |
| 8ae5acdf9bdb22d3896965d92d9821fa3ab35cf1727c2d1d7e545b45e1ee64f7 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/8ae5acdf9bdb22d3896965d92d9821fa3ab35cf1727c2d1d7e545b45e1ee64f7.png | 1 | 0 |
| 8fa858e149c8bb187b69b3b700c0ffe5fb00a2352da8b7c3f699f3c5671a9594 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/8fa858e149c8bb187b69b3b700c0ffe5fb00a2352da8b7c3f699f3c5671a9594.png | 2 | 1 |
| 94252f1c8ec2bc7bd30283783682095c64907a0bf9f53a7c39299a1324c28d65 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/94252f1c8ec2bc7bd30283783682095c64907a0bf9f53a7c39299a1324c28d65.png | 1 | 0 |
| 9a3c4ceb5273726afc686fe90d55804b2d558d5f3076333ae8ce52dcd498d430 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/9a3c4ceb5273726afc686fe90d55804b2d558d5f3076333ae8ce52dcd498d430.png | 2 | 1 |
| aa26311804a79b73442700a230900b509edfdf5c3b8adb063c91f64e9626be58 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/aa26311804a79b73442700a230900b509edfdf5c3b8adb063c91f64e9626be58.png | 2 | 1 |
| e507049752862058b95dc1a316184dc1851f69c4c5aa78d30e3522fcf661269e | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/e507049752862058b95dc1a316184dc1851f69c4c5aa78d30e3522fcf661269e.png | 1 | 0 |
| f0b2422a82669ee0960d81f9364bb11dd373a0088e6dbe3e4dc878414937d182 | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/f0b2422a82669ee0960d81f9364bb11dd373a0088e6dbe3e4dc878414937d182.png | 2 | 1 |
| f9b1d9cde58c52630a92428511b5f20bc393cf776561f1fd4c9f0483ae2a322f | NEEDS_UPLOAD |  | migration/legacy-generated-images/v1/f9b1d9cde58c52630a92428511b5f20bc393cf776561f1fd4c9f0483ae2a322f.png | 2 | 1 |

## Relationship Audit

| history id | generation_task_id | task URL type | history URL type |
| --- | --- | --- | --- |
| 0c30a21d-3839-4d55-ae00-9fa3fff2c74e |  | NONE | DATA_IMAGE |
| 18bc186d-2e8f-4955-9735-2ff34dcf64a9 | 085c3b79-9b1e-4f3e-b4be-18bca102d4d3 | DATA_IMAGE | DATA_IMAGE |
| 1b1f782e-83d2-472e-af51-a0fcf8f7f560 | 279e0794-09a0-4f71-9a1f-ece3dd931f32 | DATA_IMAGE | DATA_IMAGE |
| 289eb09a-eb3b-47ac-8e54-bf72284d84fe |  | NONE | DATA_IMAGE |
| 3bfe21c3-bae6-467f-ad30-9a01a9499a10 |  | NONE | DATA_IMAGE |
| 3c3d20db-4b09-4545-92cf-dcbf45094cc7 |  | NONE | DATA_IMAGE |
| 45b5b075-f346-473e-ab99-b14b786d0b90 | bdc6266a-f2ae-4538-b43f-d95eb677b297 | DATA_IMAGE | DATA_IMAGE |
| 64ebee84-bb6d-44f9-b71a-790d6110bb39 | 76e54da6-931c-40fc-b3d5-7c163becea34 | DATA_IMAGE | DATA_IMAGE |
| 7d8849de-4ba7-443a-805f-abbd8b36ec24 | 11655210-ab45-48f5-80d7-f366d55fc165 | DATA_IMAGE | DATA_IMAGE |
| bb3fe089-4f12-478b-9a9f-adad4a83a42b | ea504908-6dd2-425c-a955-9914e9554340 | DATA_IMAGE | DATA_IMAGE |
| c93dafe0-f103-42f6-bf33-096fbd258fbd | 2a3a45d0-5442-4792-bc11-83fde7457d59 | DATA_IMAGE | DATA_IMAGE |
| ce8bac4e-2519-4188-8496-6959ecc10300 | 7a8057cf-6718-494c-a8d0-65defa0ede64 | DATA_IMAGE | DATA_IMAGE |
| dcb0c987-61b1-4327-ab6a-55b83df810de |  | NONE | DATA_IMAGE |
| e42168a5-7bed-4a40-9c33-bdefd4b185b9 |  | NONE | DATA_IMAGE |
| f741ced3-759a-4717-8de3-817099d8461f |  | NONE | DATA_IMAGE |
| fd50c35f-1a36-4eb9-8a00-d918aab02523 |  | NONE | DATA_IMAGE |

## Prohibited Operations

- No R2 PUT, DELETE, COPY, or MOVE was performed.
- Public HTTPS HEAD was used for candidates; GET was used only for candidate objects that appeared to exist.
- No remote D1, Supabase, Lovable, Auth, Storage, Provider, Canvas, or payment mutation was performed.
