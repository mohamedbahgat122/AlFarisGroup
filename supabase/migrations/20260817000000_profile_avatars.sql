-- Migration for Profile Avatars

-- 1. Add avatar_path to profiles
alter table public.profiles
  add column if not exists avatar_path text null;


-- 2. Create the profile-avatars bucket (Private)
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- 3. Storage Policies

drop policy if exists
  "Authenticated users can read profile avatars"
on storage.objects;

create policy "Authenticated users can read profile avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
  );


drop policy if exists
  "Users can upload their own avatar"
on storage.objects;

create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists
  "Users can update their own avatar"
on storage.objects;

create policy "Users can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


drop policy if exists
  "Users can delete their own avatar"
on storage.objects;

create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );