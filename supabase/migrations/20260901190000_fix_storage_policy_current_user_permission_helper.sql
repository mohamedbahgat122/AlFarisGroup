drop policy if exists driver_odometer_objects_select_org_odometer_manage
  on storage.objects;

create policy driver_odometer_objects_select_org_odometer_manage
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-odometer'
    and exists (
      select 1
      from public.driver_shifts ds
      where (
        ds.start_photo_path = storage.objects.name
        or ds.end_photo_path = storage.objects.name
      )
      and (
        public.is_system_owner()
        or public.has_current_user_organization_permission(
          ds.organization_id,
          'odometer.manage'
        )
      )
    )
  );

notify pgrst, 'reload schema';
