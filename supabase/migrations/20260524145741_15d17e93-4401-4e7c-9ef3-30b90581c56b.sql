-- ShunTu AI consolidated schema migration

CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'founder');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  display_name text,
  avatar_url text,
  credits numeric(12,2) NOT NULL DEFAULT 0.2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'founder'::public.app_role)
  )
$$;

CREATE POLICY user_roles_founder_all ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'founder'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'founder'::public.app_role));

CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR public.has_admin_access(auth.uid()));

CREATE POLICY profiles_admin_select_all ON public.profiles
  FOR SELECT TO authenticated USING (public.has_admin_access(auth.uid()));
CREATE POLICY profiles_admin_update_all ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_admin_access(auth.uid())) WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid,
  used_by_email text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupons_admin_all ON public.coupons
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text)
RETURNS TABLE (success boolean, message text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_coupon public.coupons%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, '未登录'::text, 0::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_coupon FROM public.coupons WHERE code = trim(_code) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '卡密无效'::text, 0::numeric;
    RETURN;
  END IF;

  IF v_coupon.is_used THEN
    RETURN QUERY SELECT false, '卡密已被使用'::text, 0::numeric;
    RETURN;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  UPDATE public.coupons
    SET is_used = true, used_by = v_uid, used_by_email = v_email, used_at = now()
    WHERE id = v_coupon.id;

  INSERT INTO public.profiles (id, email, display_name)
  VALUES (v_uid, v_email, split_part(coalesce(v_email, ''), '@', 1))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
    SET credits = credits + v_coupon.amount, updated_at = now()
    WHERE id = v_uid;

  RETURN QUERY SELECT true, '兑换成功'::text, v_coupon.amount::numeric;
END;
$$;

CREATE TABLE public.generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model text NOT NULL,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  prompt text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gh_created_at ON public.generation_history (created_at DESC);
CREATE INDEX idx_gh_model ON public.generation_history (model);
CREATE INDEX idx_gh_user ON public.generation_history (user_id);
CREATE INDEX gh_user_created_idx ON public.generation_history (user_id, created_at DESC);

ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY gh_select_own ON public.generation_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));
CREATE POLICY gh_insert_own ON public.generation_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY gh_admin_all ON public.generation_history
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TABLE public.models_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cost numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  api_url text,
  api_key text,
  request_format text NOT NULL DEFAULT 'async_id',
  prompt_key text NOT NULL DEFAULT 'prompt',
  fetch_url text,
  extra_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT models_config_request_format_check CHECK (request_format IN ('async_id', 'sync_url'))
);

ALTER TABLE public.models_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY models_config_admin_all ON public.models_config
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TRIGGER trg_models_config_updated_at
  BEFORE UPDATE ON public.models_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.models_config (model_key, name, description, cost, sort_order, extra_params) VALUES
  ('gpt-image-2', 'GPT-Image-2', 'OpenAI · 新一代图像生成', 2, 1, '{"size": "{{aspect}}"}'::jsonb),
  ('nanobanana2', 'NanoBanana2', '2K · 4K 高清，支持参考图', 1, 2, '{"size": "{{size}}", "aspectRatio": "{{aspect}}"}'::jsonb),
  ('grok_imagine', 'grok_imagine', 'xAI · 极速高质量', 1, 3, '{"image_urls": "{{urls}}", "aspect_ratio": "{{grok_aspect}}"}'::jsonb),
  ('nanobanana_pro', 'NanoBanana_pro', '专业级高清，最多 14 参考图', 6, 4, '{"size": "{{size}}", "aspectRatio": "{{aspect}}"}'::jsonb),
  ('nanobanana', 'NanoBanana', '轻量一致性图生图', 1, 5, '{}'::jsonb),
  ('wan26', 'Wan2.6', '高清 · 4 参考图，一致性极强', 2, 6, '{}'::jsonb)
ON CONFLICT (model_key) DO NOTHING;

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
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, '未登录'::text, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (v_uid)
  ON CONFLICT (id) DO NOTHING;

  SELECT mc.cost, mc.name INTO v_cost, v_model_name
  FROM public.models_config mc
  WHERE mc.model_key = _model_key AND mc.is_enabled = true;

  IF v_cost IS NULL THEN
    RETURN QUERY SELECT false, '模型不存在'::text, 0::numeric, 0::numeric;
    RETURN;
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
$$;

CREATE TABLE public.global_config (
  id integer PRIMARY KEY DEFAULT 1,
  base_url text NOT NULL DEFAULT 'https://api.wuyinkeji.com',
  global_api_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_config_singleton CHECK (id = 1)
);

INSERT INTO public.global_config (id, base_url) VALUES (1, 'https://api.wuyinkeji.com')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.global_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY global_config_admin_all ON public.global_config
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TABLE public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY ads_public_read_active ON public.ads
  FOR SELECT USING (is_active = true);
CREATE POLICY ads_admin_all ON public.ads
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TRIGGER ads_set_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.admin_settings (
  id integer PRIMARY KEY DEFAULT 1,
  access_password text NOT NULL DEFAULT '888888',
  system_prompt text NOT NULL DEFAULT '',
  contact_wechat text NOT NULL DEFAULT '',
  contact_qq text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_singleton CHECK (id = 1)
);

INSERT INTO public.admin_settings (id, access_password) VALUES (1, '888888')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_settings_founder_all ON public.admin_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'founder'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'founder'::public.app_role));

CREATE OR REPLACE FUNCTION public.get_contact_info()
RETURNS TABLE(contact_wechat text, contact_qq text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(contact_wechat, ''), COALESCE(contact_qq, '')
  FROM public.admin_settings WHERE id = 1
$$;

CREATE TABLE public.style_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.style_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY style_templates_read_auth ON public.style_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY style_templates_admin_write ON public.style_templates
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

INSERT INTO public.style_templates (id, name, prompt, sort_order) VALUES
  ('none','无风格','',0),
  ('premium_ecom','高级电商','high-end e-commerce commercial photography, soft cinematic studio lighting, clean composition, premium glossy product feel, refined color grading, luxury advertising aesthetic',10),
  ('xhs','小红书','Xiaohongshu lifestyle photography, soft natural daylight, fresh airy atmosphere, pastel warm tones, cozy aesthetic background, instagrammable lifestyle styling',20),
  ('ins_minimal','INS极简','minimalist instagram aesthetic, lots of negative space, neutral muted palette, soft diffused lighting, clean geometric composition, editorial calm mood',30),
  ('white_ecom','白底电商','pure white seamless studio background, even soft box lighting, crisp clean shadows, commercial catalog product photography, sharp clear details',40),
  ('tech','科技质感','futuristic tech product photography, cool cyan and blue tones, sleek dark gradient background, sharp rim lighting, glowing accent highlights, premium hi-tech mood',50),
  ('trend_ad','潮流广告','trendy streetwear advertising poster, bold contrasting colors, dynamic playful composition, punchy saturated palette, modern editorial energy',60),
  ('jewelry','珠宝高级感','luxury jewelry photography, dark velvet backdrop, sparkling specular highlights, precise focused lighting, refined reflections, opulent premium mood',70),
  ('beauty','美妆海报','high-end beauty cosmetics poster, soft glowing skin-friendly lighting, silky smooth gradient background, elegant pastel or rose tones, dewy luxurious atmosphere',80),
  ('food','食品广告','appetizing food commercial photography, warm golden lighting, rich appetizing colors, mouthwatering textures, steam and freshness, premium culinary mood',90),
  ('shoes','鞋靴高级感','premium footwear advertising, dramatic directional lighting, dynamic shadow play, textured concrete or stone surface, hype sneaker editorial mood',100),
  ('outdoor','户外露营','outdoor camping lifestyle scene, natural golden hour sunlight, rugged mountain or forest environment, earthy organic tones, adventurous warm atmosphere',110),
  ('luxury_stage','奢侈品展台','luxury product display stage, marble or stone pedestal, museum-grade spotlight lighting, elegant deep background, sophisticated high-end gallery atmosphere',120),
  ('white_studio','极简白棚','minimal white studio set, soft wraparound lighting, gentle natural shadows, pure clean backdrop, refined minimalist product mood',130),
  ('dark_premium','暗黑高级感','dark moody premium product photography, deep black background, dramatic chiaroscuro lighting, rich shadows, cinematic luxurious atmosphere',140)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.inspiration_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  model_key text,
  model_name text,
  aspect_ratio text,
  size text,
  style_id text,
  tags text[] NOT NULL DEFAULT '{}',
  views integer NOT NULL DEFAULT 0,
  likes_count integer NOT NULL DEFAULT 0,
  favorites_count integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspiration_cases_created ON public.inspiration_cases (created_at DESC);
CREATE INDEX idx_inspiration_cases_user ON public.inspiration_cases (user_id);
CREATE INDEX idx_inspiration_cases_tags ON public.inspiration_cases USING GIN(tags);
CREATE INDEX idx_inspiration_cases_style ON public.inspiration_cases (style_id);

ALTER TABLE public.inspiration_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY cases_select_published ON public.inspiration_cases
  FOR SELECT TO authenticated
  USING (is_published = true OR auth.uid() = user_id OR public.has_admin_access(auth.uid()));
CREATE POLICY cases_insert_own ON public.inspiration_cases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cases_update_own_or_admin ON public.inspiration_cases
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.has_admin_access(auth.uid()));
CREATE POLICY cases_delete_own_or_admin ON public.inspiration_cases
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));

CREATE TRIGGER trg_inspiration_cases_updated
  BEFORE UPDATE ON public.inspiration_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.case_likes (
  case_id uuid NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

ALTER TABLE public.case_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY likes_select_own ON public.case_likes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY likes_insert_own ON public.case_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY likes_delete_own ON public.case_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.case_favorites (
  case_id uuid NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

ALTER TABLE public.case_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY favs_select_own ON public.case_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY favs_insert_own ON public.case_favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY favs_delete_own ON public.case_favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.case_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.inspiration_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_comments_case ON public.case_comments (case_id, created_at DESC);

ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY comments_select_all ON public.case_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY comments_insert_own ON public.case_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_delete_own_or_admin ON public.case_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_case_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'case_likes' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.inspiration_cases SET likes_count = likes_count + 1 WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.inspiration_cases SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.case_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'case_favorites' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.inspiration_cases SET favorites_count = favorites_count + 1 WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.inspiration_cases SET favorites_count = GREATEST(0, favorites_count - 1) WHERE id = OLD.case_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_case_likes_count
  AFTER INSERT OR DELETE ON public.case_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_case_counts();
CREATE TRIGGER trg_case_favorites_count
  AFTER INSERT OR DELETE ON public.case_favorites
  FOR EACH ROW EXECUTE FUNCTION public.update_case_counts();

CREATE OR REPLACE FUNCTION public.increment_case_view(_case_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.inspiration_cases SET views = views + 1 WHERE id = _case_id;
$$;

CREATE OR REPLACE FUNCTION public.prune_generation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.generation_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.generation_history
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 100
    );

  DELETE FROM public.generation_history
  WHERE created_at < now() - INTERVAL '15 days';

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prune_generation_history
  AFTER INSERT ON public.generation_history
  FOR EACH ROW EXECUTE FUNCTION public.prune_generation_history();

CREATE OR REPLACE FUNCTION public.set_latest_history_image(_model text, _image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR _image_url IS NULL OR _image_url = '' THEN
    RETURN;
  END IF;

  UPDATE public.generation_history
  SET image_url = _image_url
  WHERE id = (
    SELECT id FROM public.generation_history
    WHERE user_id = v_uid
      AND model = _model
      AND image_url IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  );
END;
$$;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('reference-images', 'reference-images', true),
  ('admin-assets', 'admin-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE POLICY avatars_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY reference_images_authenticated_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reference-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY reference_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'reference-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY admin_assets_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'admin-assets' AND public.has_admin_access(auth.uid()));
CREATE POLICY admin_assets_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'admin-assets' AND public.has_admin_access(auth.uid()))
  WITH CHECK (bucket_id = 'admin-assets' AND public.has_admin_access(auth.uid()));
CREATE POLICY admin_assets_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'admin-assets' AND public.has_admin_access(auth.uid()));

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_for_generation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_latest_history_image(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_case_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_info() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_case_counts() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_generation_history() FROM public, anon, authenticated;