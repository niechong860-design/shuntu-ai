-- Public buckets serve files via the public CDN endpoint without needing
-- a SELECT RLS policy on storage.objects. Removing these broad SELECT
-- policies prevents anonymous bucket listing while keeping public URLs working.
DROP POLICY IF EXISTS admin_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS case_images_public_read ON storage.objects;