
insert into storage.buckets (id, name, public)
values ('reference-images', 'reference-images', true)
on conflict (id) do update set public = true;

create policy "reference-images public read"
on storage.objects for select
using (bucket_id = 'reference-images');

create policy "reference-images authenticated upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'reference-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "reference-images owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'reference-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
