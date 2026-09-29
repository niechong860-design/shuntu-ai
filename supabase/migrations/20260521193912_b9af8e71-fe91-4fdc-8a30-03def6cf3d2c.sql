
create table public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  link_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ads enable row level security;

create policy "ads_public_read_active" on public.ads
  for select using (is_active = true);

create policy "ads_admin_all" on public.ads
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger ads_set_updated_at
before update on public.ads
for each row execute function public.set_updated_at();
