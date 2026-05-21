CREATE OR REPLACE FUNCTION public.consume_credits_for_generation(_model_key text, _prompt text)
 RETURNS TABLE(success boolean, message text, credits numeric, cost numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cost numeric;
  v_model_name text;
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, '未登录'::text, 0::numeric, 0::numeric; RETURN;
  END IF;

  SELECT mc.cost, mc.name INTO v_cost, v_model_name
  FROM public.models_config mc
  WHERE mc.model_key = _model_key;

  IF v_cost IS NULL THEN
    RETURN QUERY SELECT false, '模型不存在'::text, 0::numeric, 0::numeric; RETURN;
  END IF;

  SELECT p.credits INTO v_balance FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN QUERY SELECT false, '您的算力余额不足，请联系老板兑换充值卡密'::text, COALESCE(v_balance, 0)::numeric, v_cost::numeric;
    RETURN;
  END IF;

  v_new_balance := v_balance - v_cost;

  UPDATE public.profiles AS p
    SET credits = v_new_balance, updated_at = now()
    WHERE p.id = v_uid;

  INSERT INTO public.generation_history (user_id, model, cost, prompt)
  VALUES (v_uid, v_model_name, v_cost, _prompt);

  RETURN QUERY SELECT true, '扣费成功'::text, v_new_balance::numeric, v_cost::numeric;
END;
$function$;