
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.redeem_coupon(text) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.redeem_coupon(text) to authenticated;
