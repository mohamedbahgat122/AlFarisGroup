-- Canonical Driver App maintenance vehicle resolution.
-- Keeps maintenance requests tied to real fleet vehicle UUIDs only.

create or replace function public.normalize_vehicle_plate_text(p_plate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(upper(btrim(coalesce(p_plate, ''))), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.resolve_driver_current_vehicle(p_driver_id uuid)
returns table (
  vehicle_id uuid,
  plate_number text,
  vehicle_type text,
  organization_id uuid,
  resolution_code text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype;
  v_driver_plate text;
  v_active_assignment_count integer := 0;
  v_inactive_assignment_count integer := 0;
  v_other_org_assignment_count integer := 0;
  v_active_plate_count integer := 0;
  v_inactive_plate_count integer := 0;
  v_other_org_plate_count integer := 0;
begin
  select *
    into v_driver
  from public.drivers d
  where d.id = p_driver_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    return query select null::uuid, null::text, null::text, null::uuid, 'vehicle_not_linked'::text;
    return;
  end if;

  select count(*)::integer
    into v_other_org_assignment_count
  from public.fleet_vehicles fv
  where fv.archived_at is null
    and fv.organization_id <> v_driver.organization_id
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    );

  select count(*)::integer
    into v_inactive_assignment_count
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    )
    and (
      fv.archived_at is not null
      or fv.operational_status <> 'active'
    );

  select count(*)::integer
    into v_active_assignment_count
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and fv.archived_at is null
    and fv.operational_status = 'active'
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    );

  if v_active_assignment_count = 1 then
    return query
      select fv.id, fv.plate_number, fv.vehicle_type, fv.organization_id, 'ok'::text
      from public.fleet_vehicles fv
      where fv.organization_id = v_driver.organization_id
        and fv.archived_at is null
        and fv.operational_status = 'active'
        and (
          fv.assigned_driver_id = v_driver.id
          or fv.authorized_driver_id = v_driver.id
        )
      order by case when fv.assigned_driver_id = v_driver.id then 0 else 1 end, fv.created_at desc
      limit 1;
    return;
  end if;

  if v_active_assignment_count > 1 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_ambiguous'::text;
    return;
  end if;

  if v_inactive_assignment_count > 0 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_inactive'::text;
    return;
  end if;

  if v_other_org_assignment_count > 0 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_organization_mismatch'::text;
    return;
  end if;

  v_driver_plate := coalesce(
    public.normalize_vehicle_plate_text(v_driver.keeta_vehicle_plate_number),
    public.normalize_vehicle_plate_text(v_driver.vehicle_number)
  );

  if v_driver_plate is null then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_not_linked'::text;
    return;
  end if;

  select count(*)::integer
    into v_other_org_plate_count
  from public.fleet_vehicles fv
  where fv.organization_id <> v_driver.organization_id
    and coalesce(
      public.normalize_vehicle_plate_text(fv.normalized_plate_number),
      public.normalize_vehicle_plate_text(fv.plate_number)
    ) = v_driver_plate;

  select count(*)::integer
    into v_inactive_plate_count
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and coalesce(
      public.normalize_vehicle_plate_text(fv.normalized_plate_number),
      public.normalize_vehicle_plate_text(fv.plate_number)
    ) = v_driver_plate
    and (
      fv.archived_at is not null
      or fv.operational_status <> 'active'
    );

  select count(*)::integer
    into v_active_plate_count
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and fv.archived_at is null
    and fv.operational_status = 'active'
    and coalesce(
      public.normalize_vehicle_plate_text(fv.normalized_plate_number),
      public.normalize_vehicle_plate_text(fv.plate_number)
    ) = v_driver_plate;

  if v_active_plate_count = 1 then
    return query
      select fv.id, fv.plate_number, fv.vehicle_type, fv.organization_id, 'ok'::text
      from public.fleet_vehicles fv
      where fv.organization_id = v_driver.organization_id
        and fv.archived_at is null
        and fv.operational_status = 'active'
        and coalesce(
          public.normalize_vehicle_plate_text(fv.normalized_plate_number),
          public.normalize_vehicle_plate_text(fv.plate_number)
        ) = v_driver_plate
      limit 1;
    return;
  end if;

  if v_active_plate_count > 1 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_ambiguous'::text;
    return;
  end if;

  if v_inactive_plate_count > 0 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_inactive'::text;
    return;
  end if;

  if v_other_org_plate_count > 0 then
    return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_organization_mismatch'::text;
    return;
  end if;

  return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_not_found'::text;
end;
$$;

create or replace function public.get_authenticated_driver_vehicle_status()
returns table (
  vehicle_id uuid,
  plate_number text,
  vehicle_type text,
  organization_id uuid,
  resolution_code text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype := public.get_authenticated_driver_for_request();
begin
  return query
    select rv.vehicle_id, rv.plate_number, rv.vehicle_type, rv.organization_id, rv.resolution_code
    from public.resolve_driver_current_vehicle(v_driver.id) rv
    limit 1;
end;
$$;

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype := public.get_authenticated_driver_for_request();
  v_vehicle record;
  v_request public.driver_app_requests%rowtype;
  v_category text := btrim(coalesce(p_maintenance_category, ''));
  v_problem text := btrim(coalesce(p_problem_description, ''));
begin
  if length(v_category) = 0 or length(v_category) > 120 then
    raise exception 'APP_REQUEST_CATEGORY_REQUIRED';
  end if;

  if p_urgency not in ('normal', 'urgent') then
    raise exception 'APP_REQUEST_INVALID_URGENCY';
  end if;

  if length(v_problem) = 0 or length(v_problem) > 1500 then
    raise exception 'APP_REQUEST_DESCRIPTION_REQUIRED';
  end if;

  select *
    into v_vehicle
  from public.resolve_driver_current_vehicle(v_driver.id)
  limit 1;

  if v_vehicle.vehicle_id is null or v_vehicle.resolution_code <> 'ok' then
    raise exception '%', coalesce(v_vehicle.resolution_code, 'vehicle_not_linked');
  end if;

  if v_vehicle.organization_id <> v_driver.organization_id then
    raise exception 'vehicle_organization_mismatch';
  end if;

  insert into public.driver_app_requests (
    organization_id,
    driver_id,
    vehicle_id,
    vehicle_plate_snapshot,
    request_type,
    submitted_note
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_vehicle.plate_number,
    'maintenance',
    v_problem
  )
  returning * into v_request;

  insert into public.driver_app_maintenance_request_details (
    request_id,
    maintenance_category,
    problem_description,
    urgency
  )
  values (v_request.id, v_category, v_problem, p_urgency);

  perform public.insert_driver_app_request_activity(
    auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
    'driver_app_request_submitted', 'maintenance', 'pending'
  );

  return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', 'pending', 'submitted_at', v_request.submitted_at);
end;
$$;

revoke all on function public.normalize_vehicle_plate_text(text) from public, anon;
revoke all on function public.resolve_driver_current_vehicle(uuid) from public, anon, authenticated;
revoke all on function public.get_authenticated_driver_vehicle_status() from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text) from public, anon, authenticated;

grant execute on function public.get_authenticated_driver_vehicle_status() to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text) to authenticated;

notify pgrst, 'reload schema';
