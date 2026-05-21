CREATE TABLE IF NOT EXISTS public.generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model text NOT NULL,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gh_created_at ON public.generation_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_model ON public.generation_history (model);
CREATE INDEX IF NOT EXISTS idx_gh_user ON public.generation_history (user_id);

ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY gh_select_own ON public.generation_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY gh_insert_own ON public.generation_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY gh_admin_all ON public.generation_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));