
-- 1. Roles
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "user_roles_select_own" on public.user_roles
  for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "user_roles_admin_all" on public.user_roles
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- 2. Admin policies on profiles
create policy "profiles_admin_select_all" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "profiles_admin_update_all" on public.profiles
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 3. Coupons
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount integer not null check (amount > 0),
  is_used boolean not null default false,
  used_by uuid references auth.users(id),
  used_by_email text,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.coupons enable row level security;

create policy "coupons_admin_all" on public.coupons
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "coupons_select_by_code" on public.coupons
  for select to authenticated using (true);

-- 4. Atomic redeem function
create or replace function public.redeem_coupon(_code text)
returns table (success boolean, message text, amount integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_coupon public.coupons%rowtype;
begin
  if v_uid is null then
    return query select false, '未登录'::text, 0; return;
  end if;

  select * into v_coupon from public.coupons where code = _code for update;
  if not found then
    return query select false, '卡密无效'::text, 0; return;
  end if;
  if v_coupon.is_used then
    return query select false, '卡密已被使用'::text, 0; return;
  end if;

  select email into v_email from auth.users where id = v_uid;

  update public.coupons
    set is_used = true, used_by = v_uid, used_by_email = v_email, used_at = now()
    where id = v_coupon.id;

  update public.profiles
    set credits = credits + v_coupon.amount, updated_at = now()
    where id = v_uid;

  return query select true, '兑换成功'::text, v_coupon.amount;
end;
$$;

grant execute on function public.redeem_coupon(text) to authenticated;
