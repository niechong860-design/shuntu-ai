CREATE TABLE IF NOT EXISTS public.user_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  out_trade_no TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  credits NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_type TEXT,
  trade_no TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_orders_user_id ON public.user_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orders_status ON public.user_orders(status);

ALTER TABLE public.user_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own_or_admin"
  ON public.user_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR has_admin_access(auth.uid()));

CREATE POLICY "orders_insert_own"
  ON public.user_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders_admin_update"
  ON public.user_orders FOR UPDATE
  TO authenticated
  USING (has_admin_access(auth.uid()))
  WITH CHECK (has_admin_access(auth.uid()));

CREATE TRIGGER trg_user_orders_updated_at
  BEFORE UPDATE ON public.user_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();