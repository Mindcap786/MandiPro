-- Add item_images storage bucket
insert into storage.buckets (id, name, public)
values ('item_images', 'item_images', true)
on conflict (id) do nothing;

create policy "Public Access to item_images"
  on storage.objects for select
  using ( bucket_id = 'item_images' );

create policy "Auth Insert to item_images"
  on storage.objects for insert
  with check ( bucket_id = 'item_images' and auth.role() = 'authenticated' );

create policy "Auth Update to item_images"
  on storage.objects for update
  using ( bucket_id = 'item_images' and auth.role() = 'authenticated' );

create policy "Auth Delete to item_images"
  on storage.objects for delete
  using ( bucket_id = 'item_images' and auth.role() = 'authenticated' );
