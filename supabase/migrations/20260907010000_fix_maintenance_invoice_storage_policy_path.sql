drop policy if exists maintenance_invoice_objects_insert_provider
  on storage.objects;
create policy maintenance_invoice_objects_insert_provider
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'maintenance-invoices'
    and exists (
      select 1
      from public.maintenance_jobs mj
      join public.maintenance_provider_organizations mpo
        on mpo.provider_id = mj.provider_id
       and mpo.organization_id = mj.organization_id
       and mpo.is_active = true
      join public.maintenance_providers provider
        on provider.id = mj.provider_id
       and provider.is_active = true
      where mj.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and mj.provider_id::text = (storage.foldername(storage.objects.name))[2]
        and mj.id::text = (storage.foldername(storage.objects.name))[3]
        and mj.status in ('ready', 'in_progress')
        and public.maintenance_partner_has_provider_access(mj.provider_id)
    )
  );

drop policy if exists maintenance_invoice_objects_delete_provider
  on storage.objects;
create policy maintenance_invoice_objects_delete_provider
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'maintenance-invoices'
    and exists (
      select 1
      from public.maintenance_jobs mj
      join public.maintenance_provider_organizations mpo
        on mpo.provider_id = mj.provider_id
       and mpo.organization_id = mj.organization_id
       and mpo.is_active = true
      join public.maintenance_providers provider
        on provider.id = mj.provider_id
       and provider.is_active = true
      where mj.organization_id::text = (storage.foldername(storage.objects.name))[1]
        and mj.provider_id::text = (storage.foldername(storage.objects.name))[2]
        and mj.id::text = (storage.foldername(storage.objects.name))[3]
        and mj.status in ('ready', 'in_progress')
        and public.maintenance_partner_has_provider_access(mj.provider_id)
    )
  );
