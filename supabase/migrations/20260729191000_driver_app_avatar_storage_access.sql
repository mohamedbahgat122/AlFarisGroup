-- Allow Driver App users to read only their own existing profile photo object.

drop policy if exists driver_documents_select_own_profile_photo
  on storage.objects;
create policy driver_documents_select_own_profile_photo
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-documents'
    and exists (
      select 1
      from public.profiles p
      join public.drivers d
        on d.auth_user_id = p.id
       and d.profile_photo_path = storage.objects.name
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );
