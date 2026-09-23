CREATE OR REPLACE FUNCTION public.finalize_user_generation_task_once(p_task_id uuid, p_image_url text)
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'not authenticated'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF p_image_url IS NULL OR trim(p_image_url) = '' THEN
    RETURN QUERY SELECT false, 'image url is required'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  SELECT *
  INTO v_task
  FROM public.generation_tasks
  WHERE id = p_task_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'task not found or not owned by current user'::text, p_task_id, NULL::text, NULL::text, NULL::uuid, 0::numeric, 0::numeric;
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
    'generation_task',
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

REVOKE ALL ON FUNCTION public.finalize_user_generation_task_once(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_user_generation_task_once(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_user_generation_task_once(uuid, text) TO authenticated;
