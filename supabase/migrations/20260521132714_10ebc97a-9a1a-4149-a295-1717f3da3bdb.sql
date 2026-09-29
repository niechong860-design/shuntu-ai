-- Change credits to numeric to support fractional initial balance, default 0.2
ALTER TABLE public.profiles ALTER COLUMN credits DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN credits TYPE numeric(12,2) USING credits::numeric;
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 0.2;

-- Reset any existing users still on the old 7847 seed to the new initial 0.2
UPDATE public.profiles SET credits = 0.2 WHERE credits = 7847;

-- Ensure handle_new_user trigger exists (creates profile row on signup; default 0.2 applies)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update redeem_coupon return type to numeric to match new credits type
DROP FUNCTION IF EXISTS public.redeem_coupon(text);
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text)
 RETURNS TABLE(success boolean, message text, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_coupon public.coupons%rowtype;
begin
  if v_uid is null then
    return query select false, '未登录'::text, 0::numeric; return;
  end if;
  select * into v_coupon from public.coupons where code = _code for update;
  if not found then
    return query select false, '卡密无效'::text, 0::numeric; return;
  end if;
  if v_coupon.is_used then
    return query select false, '卡密已被使用'::text, 0::numeric; return;
  end if;
  select email into v_email from auth.users where id = v_uid;
  update public.coupons
    set is_used = true, used_by = v_uid, used_by_email = v_email, used_at = now()
    where id = v_coupon.id;
  update public.profiles
    set credits = credits + v_coupon.amount, updated_at = now()
    where id = v_uid;
  return query select true, '兑换成功'::text, v_coupon.amount::numeric;
end;
$function$;