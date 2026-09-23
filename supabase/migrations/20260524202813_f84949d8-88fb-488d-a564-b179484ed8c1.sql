
CREATE OR REPLACE FUNCTION public.complete_paid_order(
  _out_trade_no text,
  _trade_no text
)
RETURNS TABLE(applied boolean, user_id uuid, credits numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.user_orders%rowtype;
BEGIN
  SELECT * INTO v_order FROM public.user_orders
    WHERE out_trade_no = _out_trade_no
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 0::numeric;
    RETURN;
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN QUERY SELECT false, v_order.user_id, v_order.credits;
    RETURN;
  END IF;

  UPDATE public.user_orders
    SET status = 'paid',
        paid_at = now(),
        trade_no = _trade_no,
        updated_at = now()
    WHERE id = v_order.id;

  INSERT INTO public.profiles (id) VALUES (v_order.user_id)
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
    SET credits = credits + v_order.credits,
        updated_at = now()
    WHERE id = v_order.user_id;

  RETURN QUERY SELECT true, v_order.user_id, v_order.credits;
END;
$$;
