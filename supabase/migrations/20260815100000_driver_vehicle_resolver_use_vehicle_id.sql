-- Driver App vehicle resolution must use drivers.vehicle_id as the source of truth.

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

    if v_linked_vehicle_organization_id is distinct from v_driver.organization_id then
      return query select null::uuid, null::text, null::text, v_driver.organization_id, 'vehicle_organization_mismatch'::text;
      return;
    end if;

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

notify pgrst, 'reload schema';
