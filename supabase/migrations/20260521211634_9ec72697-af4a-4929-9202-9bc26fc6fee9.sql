ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS contact_wechat text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_qq text NOT NULL DEFAULT '';

-- Allow public (any authenticated user) to read contact info via a SECURITY DEFINER fn
CREATE OR REPLACE FUNCTION public.get_contact_info()
RETURNS TABLE(contact_wechat text, contact_qq text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(contact_wechat, ''), COALESCE(contact_qq, '')
  FROM public.admin_settings WHERE id = 1
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_info() TO anon, authenticated;