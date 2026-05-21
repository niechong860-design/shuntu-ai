CREATE TABLE IF NOT EXISTS public.global_config (
  id integer PRIMARY KEY DEFAULT 1,
  base_url text NOT NULL DEFAULT 'https://api.wuyinkeji.com',
  global_api_key text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT global_config_singleton CHECK (id = 1)
);

INSERT INTO public.global_config (id, base_url) VALUES (1, 'https://api.wuyinkeji.com')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.global_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_config_admin_all ON public.global_config;
CREATE POLICY global_config_admin_all ON public.global_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));