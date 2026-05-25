
-- Re-scope case-images write policies to authenticated role
DROP POLICY IF EXISTS case_images_owner_insert ON storage.objects;
DROP POLICY IF EXISTS case_images_owner_update ON storage.objects;
DROP POLICY IF EXISTS case_images_owner_delete ON storage.objects;

CREATE POLICY case_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-images' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY case_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'case-images' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'case-images' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY case_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'case-images' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Re-scope reference-images read policy to authenticated role
DROP POLICY IF EXISTS reference_images_owner_read ON storage.objects;

CREATE POLICY reference_images_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'reference-images' AND (storage.foldername(name))[1] = (auth.uid())::text);
