
-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.redeem_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redeem_logs_user ON public.redeem_logs(user_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_code ON public.redeem_logs(code);

ALTER TABLE public.redeem_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS redeem_logs_select_own ON public.redeem_logs;
CREATE POLICY redeem_logs_select_own ON public.redeem_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));

DROP POLICY IF EXISTS redeem_logs_admin_all ON public.redeem_logs;
CREATE POLICY redeem_logs_admin_all ON public.redeem_logs
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

-- 2. Tighten RLS on coupons: allow users to see only codes they themselves redeemed.
-- (Admin policy already exists.)
DROP POLICY IF EXISTS coupons_select_own_redeemed ON public.coupons;
CREATE POLICY coupons_select_own_redeemed ON public.coupons
  FOR SELECT TO authenticated
  USING (used_by = auth.uid());

-- 3. Secure redemption function with row locking + audit logging
CREATE OR REPLACE FUNCTION public.redeem_gift_card(input_code text)
RETURNS TABLE(success boolean, message text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_coupon public.coupons%rowtype;
  v_clean text := trim(coalesce(input_code, ''));
BEGIN
  IF v_uid IS NULL THEN
    INSERT INTO public.redeem_logs(user_id, code, success, error_message)
    VALUES (COALESCE(v_uid, '00000000-0000-0000-0000-000000000000'::uuid), v_clean, false, '未登录');
    RAISE EXCEPTION '未登录';
  END IF;

  IF v_clean = '' THEN
    INSERT INTO public.redeem_logs(user_id, code, success, error_message)
    VALUES (v_uid, v_clean, false, '卡密为空');
    RAISE EXCEPTION '卡密为空';
  END IF;

  -- Lock the row to prevent concurrent double-redeem
  SELECT * INTO v_coupon FROM public.coupons WHERE code = v_clean FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.redeem_logs(user_id, code, success, error_message)
    VALUES (v_uid, v_clean, false, '卡密无效');
    RAISE EXCEPTION '卡密无效';
  END IF;

  IF v_coupon.is_used THEN
    INSERT INTO public.redeem_logs(user_id, code, success, error_message)
    VALUES (v_uid, v_clean, false, '卡密已被使用');
    RAISE EXCEPTION '卡密已被使用';
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

  INSERT INTO public.redeem_logs(user_id, code, amount, success)
  VALUES (v_uid, v_clean, v_coupon.amount, true);

  RETURN QUERY SELECT true, '兑换成功'::text, v_coupon.amount::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_gift_card(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card(text) TO authenticated;
