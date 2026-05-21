
-- helper：管理员或创始人均视为"有管理权限"
create or replace function public.has_admin_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('admin'::app_role, 'founder'::app_role)
  )
$$;

-- 将所有 admin 相关 RLS 改为 has_admin_access
-- ads
drop policy if exists "ads_admin_all" on public.ads;
create policy "ads_admin_all" on public.ads
  for all to authenticated
  using (public.has_admin_access(auth.uid()))
  with check (public.has_admin_access(auth.uid()));

-- coupons
drop policy if exists "coupons_admin_all" on public.coupons;
create policy "coupons_admin_all" on public.coupons
  for all to authenticated
  using (public.has_admin_access(auth.uid()))
  with check (public.has_admin_access(auth.uid()));

-- generation_history
drop policy if exists "gh_admin_all" on public.generation_history;
create policy "gh_admin_all" on public.generation_history
  for all to authenticated
  using (public.has_admin_access(auth.uid()))
  with check (public.has_admin_access(auth.uid()));
drop policy if exists "gh_select_own" on public.generation_history;
create policy "gh_select_own" on public.generation_history
  for select to authenticated
  using ((auth.uid() = user_id) or public.has_admin_access(auth.uid()));

-- global_config
drop policy if exists "global_config_admin_all" on public.global_config;
create policy "global_config_admin_all" on public.global_config
  for all to authenticated
  using (public.has_admin_access(auth.uid()))
  with check (public.has_admin_access(auth.uid()));

-- models_config
drop policy if exists "models_config_admin_all" on public.models_config;
create policy "models_config_admin_all" on public.models_config
  for all to authenticated
  using (public.has_admin_access(auth.uid()))
  with check (public.has_admin_access(auth.uid()));

-- profiles
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all" on public.profiles
  for select to authenticated
  using (public.has_admin_access(auth.uid()));
drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all" on public.profiles
  for update to authenticated
  using (public.has_admin_access(auth.uid()));

-- user_roles：创始人可管理所有，普通管理员只能读
drop policy if exists "user_roles_admin_all" on public.user_roles;
create policy "user_roles_founder_all" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'founder'::app_role))
  with check (public.has_role(auth.uid(), 'founder'::app_role));
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated
  using ((auth.uid() = user_id) or public.has_admin_access(auth.uid()));

-- 将指定账号设为创始人
insert into public.user_roles (user_id, role)
select id, 'founder'::app_role
from auth.users
where email = '23360767318@qq.com'
on conflict (user_id, role) do nothing;
