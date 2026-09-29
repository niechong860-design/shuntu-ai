-- Re-grant EXECUTE on RLS-helper functions that were over-zealously revoked
GRANT EXECUTE ON FUNCTION public.has_admin_access(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;