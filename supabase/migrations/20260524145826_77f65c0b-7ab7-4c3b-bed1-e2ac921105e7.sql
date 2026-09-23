REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_for_generation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_latest_history_image(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_case_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_info() TO authenticated;