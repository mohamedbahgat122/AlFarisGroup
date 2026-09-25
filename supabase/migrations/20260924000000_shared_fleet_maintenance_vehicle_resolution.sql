-- Allow an explicitly linked shared fleet vehicle to serve a driver from
-- another organization while preserving the driver's organization as the
-- maintenance-request tenant.

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
  v_linked_vehicle public.fleet_vehicles%rowtype;
  v_linked_vehicle_organization_id uuid;
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

  if v_driver.vehicle_id is not null then
    select *
      into v_linked_vehicle
    from public.fleet_vehicles fv
    where fv.id = v_driver.vehicle_id;

    if not found then
      return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_not_found'::text;
      return;
    end if;

    v_linked_vehicle_organization_id := coalesce(
      v_linked_vehicle.assigned_organization_id,
      v_linked_vehicle.organization_id
    );

    -- Organization ownership is not an eligibility boundary for an explicit
    -- shared-fleet link. Tenant ownership remains the driver's organization.
    if v_linked_vehicle.archived_at is not null
      or v_linked_vehicle.operational_status <> 'active'
    then
      return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_inactive'::text;
      return;
    end if;

    return query
      select
        v_linked_vehicle.id,
        v_linked_vehicle.plate_number,
        v_linked_vehicle.vehicle_type,
        v_linked_vehicle_organization_id,
        'ok'::text;
    return;
  end if;

  -- Keep the legacy inferred-assignment path organization-scoped.
  select count(*)::integer
    into v_other_org_assignment_count
  from public.fleet_vehicles fv
  where fv.archived_at is null
    and coalesce(fv.assigned_organization_id, fv.organization_id) <> v_driver.organization_id
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    );

  select count(*)::integer
    into v_inactive_assignment_count
  from public.fleet_vehicles fv
  where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
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
  where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
    and fv.archived_at is null
    and fv.operational_status = 'active'
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    );

  if v_active_assignment_count = 1 then
    return query
      select
        fv.id,
        fv.plate_number,
        fv.vehicle_type,
        coalesce(fv.assigned_organization_id, fv.organization_id),
        'ok'::text
      from public.fleet_vehicles fv
      where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
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
  where coalesce(fv.assigned_organization_id, fv.organization_id) <> v_driver.organization_id
    and coalesce(
      public.normalize_vehicle_plate_text(fv.normalized_plate_number),
      public.normalize_vehicle_plate_text(fv.plate_number)
    ) = v_driver_plate;

  select count(*)::integer
    into v_inactive_plate_count
  from public.fleet_vehicles fv
  where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
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
  where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
    and fv.archived_at is null
    and fv.operational_status = 'active'
    and coalesce(
      public.normalize_vehicle_plate_text(fv.normalized_plate_number),
      public.normalize_vehicle_plate_text(fv.plate_number)
    ) = v_driver_plate;

  if v_active_plate_count = 1 then
    return query
      select
        fv.id,
        fv.plate_number,
        fv.vehicle_type,
        coalesce(fv.assigned_organization_id, fv.organization_id),
        'ok'::text
      from public.fleet_vehicles fv
      where coalesce(fv.assigned_organization_id, fv.organization_id) = v_driver.organization_id
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

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text,
  p_submission_id uuid
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
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

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
    into v_request
  from public.driver_app_requests
  where driver_id = v_driver.id
    and client_submission_id = p_submission_id;

  if found then
    return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
  end if;

  select *
    into v_vehicle
  from public.resolve_driver_current_vehicle(v_driver.id)
  limit 1;

  if v_vehicle.vehicle_id is null or v_vehicle.resolution_code <> 'ok' then
    raise exception '%', coalesce(v_vehicle.resolution_code, 'vehicle_not_linked');
  end if;

  begin
    insert into public.driver_app_requests (
      organization_id,
      driver_id,
      vehicle_id,
      vehicle_plate_snapshot,
      request_type,
      submitted_note,
      client_submission_id
    )
    values (
      v_driver.organization_id,
      v_driver.id,
      v_vehicle.vehicle_id,
      v_vehicle.plate_number,
      'maintenance',
      v_problem,
      p_submission_id
    )
    returning * into v_request;

    v_created := true;
  exception when unique_violation then
    select *
      into v_request
    from public.driver_app_requests
    where driver_id = v_driver.id
      and client_submission_id = p_submission_id;
  end;

  if not found and v_request.id is null then
    raise exception 'APP_REQUEST_INSERT_FAILED';
  end if;

  if v_created then
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
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

revoke all on function public.resolve_driver_current_vehicle(uuid)
  from public, anon, authenticated;
revoke all on function public.get_authenticated_driver_vehicle_status()
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_authenticated_driver_vehicle_status()
  to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
