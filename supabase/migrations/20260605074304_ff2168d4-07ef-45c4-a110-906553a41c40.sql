CREATE TABLE IF NOT EXISTS public.generation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  model_id text NOT NULL,
  prompt text,
  input_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits_required integer NOT NULL DEFAULT 0,
  deduction_status text NOT NULL DEFAULT 'not_charged',
  deduction_id uuid NULL,
  charged_at timestamptz NULL,
  refunded_at timestamptz NULL,
  result_image_url text NULL,
  result_payload jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_tasks_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  CONSTRAINT generation_tasks_deduction_status_check
    CHECK (deduction_status IN ('not_charged', 'charged', 'refund_pending', 'refunded', 'charge_failed'))
);

GRANT SELECT ON public.generation_tasks TO authenticated;
GRANT ALL ON public.generation_tasks TO service_role;

CREATE INDEX IF NOT EXISTS generation_tasks_user_id_status_idx
  ON public.generation_tasks (user_id, status);

CREATE INDEX IF NOT EXISTS generation_tasks_user_id_created_at_idx
  ON public.generation_tasks (user_id, created_at DESC);

ALTER TABLE public.generation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY generation_tasks_select_own ON public.generation_tasks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER generation_tasks_set_updated_at
  BEFORE UPDATE ON public.generation_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();