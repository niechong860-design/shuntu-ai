-- 1) Make reference-images private
UPDATE storage.buckets SET public = false WHERE id = 'reference-images';

-- Drop any existing public SELECT-on-anyone policies for reference-images (only owner read)
DROP POLICY IF EXISTS "reference_images_public_read" ON storage.objects;

-- Owner-scoped read for reference-images (was missing)
CREATE POLICY "reference_images_owner_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'reference-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Explicit public-read policy for admin-assets (intent is public)
CREATE POLICY "admin_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'admin-assets');

-- 3) New public bucket for community case images
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-images', 'case-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "case_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'case-images');

CREATE POLICY "case_images_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'case-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "case_images_owner_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'case-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "case_images_owner_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'case-images' AND (storage.foldername(name))[1] = auth.uid()::text);