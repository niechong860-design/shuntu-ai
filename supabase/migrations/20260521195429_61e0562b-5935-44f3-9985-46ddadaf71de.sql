
create table if not exists public.admin_settings (
  id integer primary key default 1,
  access_password text not null default '888888',
  updated_at timestamp with time zone not null default now(),
  constraint admin_settings_singleton check (id = 1)
);

insert into public.admin_settings (id, access_password)
values (1, '888888')
on conflict (id) do nothing;

alter table public.admin_settings enable row level security;

-- Only founders can read or modify; admins go through server functions using service role
drop policy if exists admin_settings_founder_all on public.admin_settings;
create policy admin_settings_founder_all on public.admin_settings
  for all to authenticated
  using (has_role(auth.uid(), 'founder'::app_role))
  with check (has_role(auth.uid(), 'founder'::app_role));
