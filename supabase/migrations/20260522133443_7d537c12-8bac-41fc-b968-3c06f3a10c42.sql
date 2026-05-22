DROP POLICY IF EXISTS "coupons_select_by_code" ON public.coupons;

DROP POLICY IF EXISTS "models_config_read_safe" ON public.models_config;

DROP POLICY IF EXISTS "likes_select_all" ON public.case_likes;
CREATE POLICY "likes_select_own" ON public.case_likes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favs_select_all" ON public.case_favorites;
CREATE POLICY "favs_select_own" ON public.case_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_admin_access(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_case_counts() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prune_generation_history() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.redeem_coupon(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_credits_for_generation(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_latest_history_image(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_case_view(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_contact_info() FROM anon, public;

DROP POLICY IF EXISTS "reference-images public read" ON storage.objects;
DROP POLICY IF EXISTS "admin_assets_public_read" ON storage.objects;