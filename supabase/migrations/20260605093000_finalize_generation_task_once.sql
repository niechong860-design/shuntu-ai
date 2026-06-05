ALTER TABLE public.generation_history
  ADD COLUMN IF NOT EXISTS generation_task_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS generation_history_generation_task_id_uidx
  ON public.generation_history (generation_task_id)
  WHERE generation_task_id IS NOT NULL;

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
