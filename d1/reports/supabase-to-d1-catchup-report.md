# Supabase to D1 Catch-up Plan

- Source mode: supabase-readonly
- Dry run: true
- Status: CATCHUP_READY
- Total inserts: 272
- Total updates: 16
- Allowed generation_history deletes: 77
- Blocked deletes: 0
- Source ID snapshots: 1761/1761, stable=true
- Generated SQL package: C:\Users\21972\Desktop\ai-shuntu-d1\d1\staging\generated\catchup\catchup-upserts.sql

| table | baseline rows | current rows | inserts | updates | blocked deletes |
|---|---:|---:|---:|---:|---:|
| profiles | 475 | 479 | 4 | 14 | 0 | 0 |
| admin_settings | 1 | 1 | 0 | 0 | 0 | 0 |
| global_config | 1 | 1 | 0 | 0 | 0 | 0 |
| models_config | 7 | 7 | 0 | 0 | 0 | 0 |
| style_templates | 12 | 12 | 0 | 0 | 0 | 0 |
| ads | 1 | 1 | 0 | 0 | 0 | 0 |
| announcements | 16 | 16 | 0 | 0 | 0 | 0 |
| recharge_packages | 5 | 5 | 0 | 0 | 0 | 0 |
| coupons | 5956 | 5956 | 0 | 2 | 0 | 0 |
| generation_tasks | 26193 | 26286 | 93 | 0 | 0 | 0 |
| generation_history | 1753 | 1761 | 85 | 0 | 77 | 0 |
| credit_usage_logs | 24154 | 24239 | 85 | 0 | 0 | 0 |
| user_orders | 107 | 110 | 3 | 0 | 0 | 0 |
| redeem_logs | 786 | 788 | 2 | 0 | 0 | 0 |
| user_roles | 2 | 2 | 0 | 0 | 0 | 0 |
| inspiration_cases | 9 | 9 | 0 | 0 | 0 | 0 |
| case_likes | 2 | 2 | 0 | 0 | 0 | 0 |
| case_favorites | 0 | 0 | 0 | 0 | 0 | 0 |
| case_comments | 0 | 0 | 0 | 0 | 0 | 0 |

Deletes are intentionally blocked for manual review; insert/update rows can be converted into D1 UPSERT SQL in gitignored staging.
No production D1 write is performed unless --execute and --confirm-production-d1 are both supplied.
