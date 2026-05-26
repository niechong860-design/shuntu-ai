CREATE POLICY "reference_images_owner_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reference-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "reference_images_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'reference-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'reference-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);