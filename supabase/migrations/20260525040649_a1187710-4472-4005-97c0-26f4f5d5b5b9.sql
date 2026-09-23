-- Restrict global_config and models_config to founder only (API keys live here)
DROP POLICY IF EXISTS "global_config_admin_all" ON public.global_config;
CREATE POLICY "global_config_founder_all" ON public.global_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder'::public.app_role))
  WITH CHECK (has_role(auth.uid(), 'founder'::public.app_role));

DROP POLICY IF EXISTS "models_config_admin_all" ON public.models_config;
CREATE POLICY "models_config_founder_all" ON public.models_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder'::public.app_role))
  WITH CHECK (has_role(auth.uid(), 'founder'::public.app_role));