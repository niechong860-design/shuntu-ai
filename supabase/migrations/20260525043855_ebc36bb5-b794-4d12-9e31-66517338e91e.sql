-- Fix admin-assets storage policies to reliably allow founder/admin uploads.
-- Use fully-qualified function references and split into per-role policies
-- to avoid any search_path resolution edge cases.

DROP POLICY IF EXISTS admin_assets_admin_insert ON storage.objects;
DROP POLICY IF EXISTS admin_assets_admin_update ON storage.objects;
DROP POLICY IF EXISTS admin_assets_admin_delete ON storage.objects;

CREATE POLICY admin_assets_admin_all
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'admin-assets'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'admin-assets'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  )
);

-- Public read on admin-assets so banners/announcement images render anywhere.
DROP POLICY IF EXISTS admin_assets_public_read ON storage.objects;
CREATE POLICY admin_assets_public_read
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'admin-assets');

-- Clean up the test row created during debugging.
DELETE FROM public.style_templates WHERE id LIKE 'test_%';