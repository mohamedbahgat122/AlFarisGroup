alter table public.maintenance_jobs
  add column if not exists invoice_file_name text null,
  add column if not exists invoice_file_path text null,
  add column if not exists invoice_mime_type text null,
  add column if not exists invoice_uploaded_at timestamptz null,
  add column if not exists invoice_uploaded_by uuid null references auth.users(id) on delete set null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'maintenance-invoices',
  'maintenance-invoices',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

drop policy if exists maintenance_invoice_objects_select_authorized
  on storage.objects;
create policy maintenance_invoice_objects_select_authorized
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'maintenance-invoices'
    and exists (
      select 1
      from public.maintenance_jobs mj
      where mj.invoice_file_path = storage.objects.name
        and (
          public.maintenance_partner_has_provider_access(mj.provider_id)
          or public.is_system_owner()
          or public.has_current_user_organization_permission(mj.organization_id, 'app_requests.view')
          or public.has_current_user_organization_permission(mj.organization_id, 'maintenance_jobs.view')
          or public.has_current_user_organization_permission(mj.organization_id, 'maintenance_jobs.assign')
        )
    )
  );

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
      join public.maintenance_providers mp
        on mp.id = mj.provider_id
       and mp.is_active = true
      where mj.organization_id::text = (storage.foldername(name))[1]
        and mj.provider_id::text = (storage.foldername(name))[2]
        and mj.id::text = (storage.foldername(name))[3]
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
      join public.maintenance_providers mp
        on mp.id = mj.provider_id
       and mp.is_active = true
      where mj.organization_id::text = (storage.foldername(name))[1]
        and mj.provider_id::text = (storage.foldername(name))[2]
        and mj.id::text = (storage.foldername(name))[3]
        and mj.status in ('ready', 'in_progress')
        and public.maintenance_partner_has_provider_access(mj.provider_id)
    )
  );

create or replace function public.upload_maintenance_job_invoice(
  p_job_id uuid,
  p_file_name text,
  p_file_path text,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_updated_job public.maintenance_jobs%rowtype;
  v_file_name text := nullif(btrim(coalesce(p_file_name, '')), '');
  v_file_path text := nullif(btrim(coalesce(p_file_path, '')), '');
  v_mime_type text := nullif(btrim(coalesce(p_mime_type, '')), '');
  v_expected_prefix text;
  v_action text := 'maintenance_invoice_uploaded';
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_file_name is null or v_file_path is null or v_mime_type is null then
    raise exception 'MAINTENANCE_INVOICE_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'MAINTENANCE_INVOICE_INVALID_TYPE' using errcode = '22023';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  if v_job.status not in ('ready', 'in_progress') then
    raise exception 'MAINTENANCE_INVOICE_JOB_LOCKED' using errcode = '22023';
  end if;

  v_expected_prefix := v_job.organization_id::text || '/' || v_job.provider_id::text || '/' || v_job.id::text || '/';

  if left(v_file_path, length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'MAINTENANCE_INVOICE_INVALID_PATH' using errcode = '22023';
  end if;

  if v_job.invoice_file_path is not null then
    v_action := 'maintenance_invoice_replaced';
  end if;

  update public.maintenance_jobs
  set
    invoice_file_name = left(v_file_name, 255),
    invoice_file_path = v_file_path,
    invoice_mime_type = v_mime_type,
    invoice_uploaded_at = v_now,
    invoice_uploaded_by = v_actor_id,
    updated_at = v_now
  where id = v_job.id
  returning * into v_updated_job;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_updated_job.organization_id,
    v_action,
    'maintenance_job',
    v_updated_job.id,
    jsonb_build_object(
      'invoice_file_name', v_job.invoice_file_name,
      'invoice_file_path', v_job.invoice_file_path,
      'invoice_mime_type', v_job.invoice_mime_type,
      'invoice_uploaded_at', v_job.invoice_uploaded_at,
      'invoice_uploaded_by', v_job.invoice_uploaded_by
    ),
    jsonb_build_object(
      'invoice_file_name', v_updated_job.invoice_file_name,
      'invoice_file_path', v_updated_job.invoice_file_path,
      'invoice_mime_type', v_updated_job.invoice_mime_type,
      'invoice_uploaded_at', v_updated_job.invoice_uploaded_at,
      'invoice_uploaded_by', v_updated_job.invoice_uploaded_by
    ),
    jsonb_build_object(
      'request_id', v_updated_job.request_id,
      'provider_id', v_updated_job.provider_id,
      'old_invoice_file_path', v_job.invoice_file_path,
      'new_invoice_file_path', v_updated_job.invoice_file_path
    )
  );

  return jsonb_build_object(
    'id', v_updated_job.id,
    'invoice_file_name', v_updated_job.invoice_file_name,
    'invoice_file_path', v_updated_job.invoice_file_path,
    'invoice_mime_type', v_updated_job.invoice_mime_type,
    'invoice_uploaded_at', v_updated_job.invoice_uploaded_at,
    'old_invoice_file_path', v_job.invoice_file_path
  );
end;
$$;

create or replace function public.complete_maintenance_job(
  p_job_id uuid,
  p_completion_notes text,
  p_oil_interval_km integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_request public.driver_app_requests%rowtype;
  v_oil_detail public.driver_app_oil_change_request_details%rowtype;
  v_existing_event public.fleet_vehicle_oil_change_events%rowtype;
  v_completion_notes text := nullif(btrim(coalesce(p_completion_notes, '')), '');
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = v_job.request_id
  for update;

  if not found
    or v_request.organization_id <> v_job.organization_id
    or v_request.driver_id <> v_job.driver_id
    or v_request.vehicle_id is distinct from v_job.vehicle_id
    or v_request.request_type <> v_job.job_type
  then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  if v_job.status = 'completed' then
    if v_request.status <> 'completed' then
      raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
    end if;

    if v_completion_notes is distinct from v_job.completion_notes then
      raise exception 'MAINTENANCE_JOB_COMPLETION_PAYLOAD_CONFLICT' using errcode = '23505';
    end if;

    if v_job.job_type = 'oil_change' then
      select *
        into v_oil_detail
      from public.driver_app_oil_change_request_details
      where request_id = v_request.id
      for update;

      if not found then
        raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
      end if;

      select *
        into v_existing_event
      from public.fleet_vehicle_oil_change_events
      where request_id = v_request.id;

      if not found then
        raise exception 'MAINTENANCE_JOB_COMPLETED_WITHOUT_OIL_EVENT' using errcode = '23514';
      end if;

      if p_oil_interval_km is null or p_oil_interval_km <> v_job.oil_interval_km then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;

      if v_existing_event.organization_id <> v_request.organization_id
        or v_existing_event.vehicle_id <> v_request.vehicle_id
        or v_existing_event.driver_id is distinct from v_request.driver_id
        or v_existing_event.odometer_reading <> v_oil_detail.current_odometer_reading
        or v_existing_event.interval_km is distinct from v_job.oil_interval_km
        or v_existing_event.completed_at is distinct from v_job.completed_at
        or v_existing_event.created_by is distinct from v_job.completed_by
        or v_existing_event.note is distinct from coalesce(v_job.completion_notes, v_oil_detail.note)
      then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;
    elsif p_oil_interval_km is not null then
      raise exception 'MAINTENANCE_OIL_INTERVAL_NOT_ALLOWED' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'id', v_job.id,
      'request_id', v_job.request_id,
      'job_type', v_job.job_type,
      'status', v_job.status,
      'oil_event_id', v_existing_event.id,
      'already_completed', true
    );
  end if;

  if v_job.status <> 'in_progress' then
    raise exception 'MAINTENANCE_JOB_INVALID_STATUS' using errcode = '22023';
  end if;

  if v_job.invoice_file_path is null then
    raise exception 'MAINTENANCE_INVOICE_REQUIRED' using errcode = '23514';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
  end if;

  if v_job.job_type = 'oil_change' then
    if p_oil_interval_km is null
      or p_oil_interval_km <= 0
      or p_oil_interval_km > 2147483647
    then
      raise exception 'APP_REQUEST_INVALID_OIL_INTERVAL' using errcode = '22023';
    end if;

    select *
      into v_oil_detail
    from public.driver_app_oil_change_request_details
    where request_id = v_request.id
    for update;

    if not found then
      raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
    end if;

    insert into public.fleet_vehicle_oil_change_events (
      organization_id,
      vehicle_id,
      driver_id,
      request_id,
      odometer_reading,
      interval_km,
      completed_at,
      note,
      created_by
    )
    values (
      v_request.organization_id,
      v_request.vehicle_id,
      v_request.driver_id,
      v_request.id,
      v_oil_detail.current_odometer_reading,
      p_oil_interval_km,
      v_now,
      coalesce(v_completion_notes, v_oil_detail.note),
      v_actor_id
    )
    on conflict (request_id) where request_id is not null do nothing
    returning * into v_existing_event;

    if not found then
      select *
        into v_existing_event
      from public.fleet_vehicle_oil_change_events
      where request_id = v_request.id;

      if not found then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;
    end if;

    if v_existing_event.organization_id <> v_request.organization_id
      or v_existing_event.vehicle_id <> v_request.vehicle_id
      or v_existing_event.driver_id is distinct from v_request.driver_id
      or v_existing_event.odometer_reading <> v_oil_detail.current_odometer_reading
      or v_existing_event.interval_km <> p_oil_interval_km
      or v_existing_event.completed_at <> v_now
      or v_existing_event.created_by is distinct from v_actor_id
      or v_existing_event.note is distinct from coalesce(v_completion_notes, v_oil_detail.note)
    then
      raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
    end if;
  elsif p_oil_interval_km is not null then
    raise exception 'MAINTENANCE_OIL_INTERVAL_NOT_ALLOWED' using errcode = '22023';
  end if;

  update public.driver_app_requests
  set
    status = 'completed',
    completed_by = v_actor_id,
    completed_at = v_now,
    updated_at = v_now,
    review_note = coalesce(v_completion_notes, review_note)
  where id = v_request.id
    and status = 'approved'
  returning * into v_request;

  if not found then
    raise exception 'MAINTENANCE_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  update public.maintenance_jobs
  set
    status = 'completed',
    completed_at = v_now,
    completed_by = v_actor_id,
    completion_notes = v_completion_notes,
    oil_interval_km = case when job_type = 'oil_change' then p_oil_interval_km else oil_interval_km end,
    updated_at = v_now
  where id = v_job.id
    and status = 'in_progress'
  returning * into v_job;

  if not found then
    raise exception 'MAINTENANCE_JOB_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  perform public.insert_driver_app_request_activity(
    v_actor_id,
    v_request.organization_id,
    v_request.driver_id,
    v_request.id,
    'driver_app_request_completed',
    v_request.request_type,
    'completed'
  );

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_job.organization_id,
    'maintenance_job_completed',
    'maintenance_job',
    v_job.id,
    null,
    to_jsonb(v_job),
    jsonb_build_object(
      'request_id', v_job.request_id,
      'provider_id', v_job.provider_id,
      'oil_event_id', v_existing_event.id
    )
  );

  return jsonb_build_object(
    'id', v_job.id,
    'request_id', v_job.request_id,
    'job_type', v_job.job_type,
    'status', v_job.status,
    'oil_event_id', v_existing_event.id,
    'already_completed', false
  );
end;
$$;

revoke all on function public.upload_maintenance_job_invoice(uuid, text, text, text)
  from public, anon;
grant execute on function public.upload_maintenance_job_invoice(uuid, text, text, text)
  to authenticated, service_role;

revoke all on function public.complete_maintenance_job(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_maintenance_job(uuid, text, integer)
  to service_role;

revoke all on function public.complete_maintenance_job(uuid, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_maintenance_job(uuid, text, integer, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
