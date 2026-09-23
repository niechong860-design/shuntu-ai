CREATE TABLE IF NOT EXISTS public.credit_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  source text NOT NULL,
  model_key text NULL,
  model_name text NULL,
  generation_history_id uuid NULL,
  generation_task_id uuid NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_user_created
  ON public.credit_usage_logs (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_idempotency_key_uidx
  ON public.credit_usage_logs (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_generation_history_id_uidx
  ON public.credit_usage_logs (generation_history_id)
  WHERE generation_history_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_generation_task_id_uidx
  ON public.credit_usage_logs (generation_task_id)
  WHERE generation_task_id IS NOT NULL;

ALTER TABLE public.credit_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_usage_logs_select_own_or_admin ON public.credit_usage_logs;
CREATE POLICY credit_usage_logs_select_own_or_admin
  ON public.credit_usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));

DROP POLICY IF EXISTS credit_usage_logs_admin_all ON public.credit_usage_logs;
CREATE POLICY credit_usage_logs_admin_all
  ON public.credit_usage_logs
  FOR ALL
  TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

INSERT INTO public.credit_usage_logs (
  user_id,
  amount,
  source,
  model_name,
  generation_history_id,
  idempotency_key,
  created_at,
  metadata
)
SELECT
  gh.user_id,
  gh.cost,
  'backfill_generation_history',
  gh.model,
  gh.id,
  'history:' || gh.id::text,
  gh.created_at,
  jsonb_build_object('backfilledAt', now())
FROM public.generation_history gh
WHERE gh.cost IS NOT NULL
  AND gh.cost > 0
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.consume_credits_for_generation(_model_key text, _prompt text)
RETURNS TABLE(success boolean, message text, credits numeric, cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost numeric;
  v_model_name text;
  v_balance numeric;
  v_new_balance numeric;
  v_history_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated'::text, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;

  SELECT mc.cost, mc.name INTO v_cost, v_model_name
  FROM public.models_config mc
  WHERE mc.model_key = _model_key AND mc.is_enabled = true;

  IF v_cost IS NULL THEN
    RETURN QUERY SELECT false, 'model not found or disabled'::text, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  SELECT p.credits INTO v_balance FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN QUERY SELECT false, 'insufficient credits'::text, COALESCE(v_balance, 0)::numeric, v_cost::numeric;
    RETURN;
  END IF;

  v_new_balance := v_balance - v_cost;

  UPDATE public.profiles AS p
    SET credits = v_new_balance, updated_at = now()
    WHERE p.id = v_uid;

  INSERT INTO public.generation_history (user_id, model, cost, prompt)
  VALUES (v_uid, v_model_name, v_cost, _prompt)
  RETURNING id INTO v_history_id;

  INSERT INTO public.credit_usage_logs (
    user_id,
    amount,
    source,
    model_key,
    model_name,
    generation_history_id,
    idempotency_key,
    metadata
  )
  VALUES (
    v_uid,
    v_cost,
    'legacy_generation',
    _model_key,
    v_model_name,
    v_history_id,
    'history:' || v_history_id::text,
    jsonb_build_object('prompt', _prompt)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN QUERY SELECT true, 'charged'::text, v_new_balance::numeric, v_cost::numeric;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_generation_task_once(p_task_id uuid, p_image_url text)
RETURNS TABLE(
  success boolean,
  message text,
  task_id uuid,
  status text,
  deduction_status text,
  history_id uuid,
  credits numeric,
  cost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task record;
  v_model_name text;
  v_cost numeric;
  v_balance numeric;
  v_new_balance numeric;
  v_history_id uuid;
  v_now timestamptz := now();
  v_required_cols text[] := ARRAY[
    'id',
    'user_id',
    'status',
    'model_id',
    'prompt',
    'input_params',
    'deduction_status',
    'deduction_id',
    'result_image_url',
    'completed_at',
    'updated_at'
  ];
  v_missing_col text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF NOT public.has_admin_access(v_uid) THEN
    RETURN QUERY SELECT false, 'admin access required'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF p_image_url IS NULL OR trim(p_image_url) = '' THEN
    RETURN QUERY SELECT false, 'image url is required'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF to_regclass('public.generation_tasks') IS NULL THEN
    RAISE EXCEPTION 'public.generation_tasks does not exist';
  END IF;

  SELECT c
  INTO v_missing_col
  FROM unnest(v_required_cols) AS c
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generation_tasks'
      AND column_name = c
  )
  LIMIT 1;

  IF v_missing_col IS NOT NULL THEN
    RAISE EXCEPTION 'public.generation_tasks missing required column: %', v_missing_col;
  END IF;

  SELECT *
  INTO v_task
  FROM public.generation_tasks
  WHERE id = p_task_id
    AND user_id = v_uid
    AND (input_params @> '{"adminPreviewOnly": true}'::jsonb)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'task not found or not owned by current admin preview user'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF v_task.deduction_status = 'charged' THEN
    RETURN QUERY SELECT true, 'already finalized'::text, v_task.id, v_task.status, v_task.deduction_status, v_task.deduction_id, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  IF v_task.deduction_status <> 'not_charged' THEN
    RETURN QUERY SELECT false, 'task deduction status is not finalizable'::text, v_task.id, v_task.status, v_task.deduction_status, v_task.deduction_id, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF v_task.status NOT IN ('running', 'succeeded') THEN
    RETURN QUERY SELECT false, 'task status is not finalizable'::text, v_task.id, v_task.status, v_task.deduction_status, v_task.deduction_id, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  SELECT mc.cost, mc.name
  INTO v_cost, v_model_name
  FROM public.models_config mc
  WHERE mc.model_key = v_task.model_id
    AND mc.is_enabled = true;

  IF v_cost IS NULL THEN
    UPDATE public.generation_tasks
    SET error_message = 'model not found or disabled',
        updated_at = v_now
    WHERE id = v_task.id;

    RETURN QUERY SELECT false, 'model not found or disabled'::text, v_task.id, v_task.status, v_task.deduction_status, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;

  SELECT p.credits
  INTO v_balance
  FROM public.profiles p
  WHERE p.id = v_uid
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < v_cost THEN
    UPDATE public.generation_tasks
    SET error_message = 'insufficient credits',
        updated_at = v_now
    WHERE id = v_task.id;

    RETURN QUERY SELECT false, 'insufficient credits'::text, v_task.id, v_task.status, v_task.deduction_status, NULL::uuid, COALESCE(v_balance, 0)::numeric, v_cost::numeric;
    RETURN;
  END IF;

  v_new_balance := v_balance - v_cost;

  UPDATE public.profiles
  SET credits = v_new_balance,
      updated_at = v_now
  WHERE id = v_uid;

  INSERT INTO public.generation_history (user_id, model, cost, prompt, image_url, generation_task_id)
  VALUES (v_uid, v_model_name, v_cost, v_task.prompt, p_image_url, v_task.id)
  RETURNING id INTO v_history_id;

  INSERT INTO public.credit_usage_logs (
    user_id,
    amount,
    source,
    model_key,
    model_name,
    generation_history_id,
    generation_task_id,
    idempotency_key,
    metadata
  )
  VALUES (
    v_uid,
    v_cost,
    'admin_generation_task',
    v_task.model_id,
    v_model_name,
    v_history_id,
    v_task.id,
    'task:' || v_task.id::text,
    jsonb_build_object('prompt', v_task.prompt)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.generation_tasks
  SET deduction_status = 'charged',
      deduction_id = v_history_id,
      charged_at = v_now,
      status = 'succeeded',
      result_image_url = p_image_url,
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now,
      error_message = NULL
  WHERE id = v_task.id;

  RETURN QUERY SELECT true, 'finalized'::text, v_task.id, 'succeeded'::text, 'charged'::text, v_history_id, v_new_balance::numeric, v_cost::numeric;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_generation_task_once(uuid, text) TO authenticated;
