# Legacy Image Inventory Stability

- source_backup: C:/Users/21972/Desktop/shuntu-db-backup/2026-09-11_01-55-13
- manifest: C:\Users\21972\Desktop\ai-shuntu-d1\d1\reports\legacy-image-externalization-manifest.json
- stable_two_pass_scan: PASS
- task_refs: 14
- history_refs: 16
- total_refs: 30
- unique_binaries: 22
- manifest_sha_match: PASS

## Drift Explanation

The earlier 29 refs / 21 binaries inventory only counted legacy base64 values that tripped the remote D1 string-size risk threshold. The final inventory intentionally scans every data:image/*;base64 reference, including small legacy data URLs, because derived D1 must contain zero data:image values.

## Additional Reference

| table | row_id | column | mime | encoded_bytes | decoded_bytes | sha256 |
|---|---|---|---|---:|---:|---|
| generation_history | fd50c35f-1a36-4eb9-8a00-d918aab02523 | image_url | image/png | 1951782 | 1463819 | 44bd9c4aae4bdd250c635289d6dd8c362e801d999e88850da4d07a28e46f8153 |

Base64 bodies and full data URLs are intentionally omitted.
