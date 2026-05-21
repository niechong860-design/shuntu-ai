
-- Models pricing config
CREATE TABLE public.models_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cost numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.models_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read pricing
CREATE POLICY models_config_read_all ON public.models_config
  FOR SELECT TO authenticated USING (true);

-- Only admins can modify
CREATE POLICY models_config_admin_all ON public.models_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_models_config_updated_at
  BEFORE UPDATE ON public.models_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.models_config (model_key, name, description, cost, sort_order) VALUES
  ('gpt-image-2',    'GPT-Image-2',     'OpenAI · 新一代图像生成', 2, 1),
  ('nanobanana2',    'NanoBanana2',     '2K · 4K 高清，支持参考图',  1, 2),
  ('grok_imagine',   'grok_imagine',    'xAI · 极速高质量',          1, 3),
  ('nanobanana_pro', 'NanoBanana_pro',  '专业级高清，最多 14 参考图', 6, 4),
  ('nanobanana',     'NanoBanana',      '轻量一致性图生图',          1, 5),
  ('wan26',          'Wan2.6',          '高清 · 4 参考图，一致性极强', 2, 6);

-- Atomic credit deduction + generation history insert
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, '未登录'::text, 0::numeric, 0::numeric; RETURN;
  END IF;

  SELECT cost, name INTO v_cost, v_model_name FROM public.models_config WHERE model_key = _model_key;
  IF v_cost IS NULL THEN
    RETURN QUERY SELECT false, '模型不存在'::text, 0::numeric, 0::numeric; RETURN;
  END IF;

  SELECT credits INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN QUERY SELECT false, '您的算力余额不足，请联系老板兑换充值卡密'::text, coalesce(v_balance,0), v_cost; RETURN;
  END IF;

  UPDATE public.profiles SET credits = credits - v_cost, updated_at = now() WHERE id = v_uid;
  INSERT INTO public.generation_history (user_id, model, cost, prompt) VALUES (v_uid, v_model_name, v_cost, _prompt);

  RETURN QUERY SELECT true, '扣费成功'::text, v_balance - v_cost, v_cost;
END;
$$;
