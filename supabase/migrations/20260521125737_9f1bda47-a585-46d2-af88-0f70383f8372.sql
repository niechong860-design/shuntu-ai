
-- Fix function search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

-- Revoke execute on SECURITY DEFINER trigger function
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Restrict storage listing: only see own folder via API, but keep direct public URLs working
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
