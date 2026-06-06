CREATE OR REPLACE FUNCTION public.admin_credit_usage_totals()
RETURNS TABLE(user_id uuid, total_spent numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cul.user_id,
    COALESCE(SUM(cul.amount), 0)::numeric AS total_spent
  FROM public.credit_usage_logs cul
  GROUP BY cul.user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_credit_usage_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_credit_usage_totals() FROM anon;
REVOKE ALL ON FUNCTION public.admin_credit_usage_totals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_usage_totals() TO service_role;
