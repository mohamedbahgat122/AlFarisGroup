-- Allow globally authorized Fleet managers to assign active drivers across
-- organization boundaries without changing driver or vehicle ownership.

create or replace function public.set_fleet_vehicle_assigned_drivers(
  p_vehicle_id uuid,
  p_driver_ids uuid[],
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_vehicle public.fleet_vehicles%rowtype;
  v_driver_ids uuid[];
  v_invalid_count integer;
  v_old_driver_ids uuid[];
  v_added_driver_ids uuid[];
  v_removed_driver_ids uuid[];
  v_moved_drivers jsonb;
  v_old_driver_organizations jsonb;
  v_new_driver_organizations jsonb;
begin
  if not public.actor_has_global_permission(p_actor_user_id, 'fleet.update') then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;

  select fv.*
  into v_vehicle
  from public.fleet_vehicles fv
  where fv.id = p_vehicle_id
    and fv.archived_at is null
  for update;

  if not found or v_vehicle.assigned_organization_id is null then
    raise exception using errcode = 'P0002', message = 'vehicle_not_found';
  end if;

  select coalesce(array_agg(driver_id order by driver_id), '{}'::uuid[])
  into v_driver_ids
  from (
    select distinct unnest(coalesce(p_driver_ids, '{}'::uuid[])) as driver_id
  ) requested;

  perform 1
  from public.drivers d
  where d.id = any(v_driver_ids)
     or d.vehicle_id = p_vehicle_id
  order by d.id
  for update;

  select count(*)
  into v_invalid_count
  from unnest(v_driver_ids) requested(driver_id)
  left join public.drivers d on d.id = requested.driver_id
  where d.id is null
     or d.deleted_at is not null
     or d.status <> 'active'::public.driver_status;

  if v_invalid_count > 0 then
    raise exception using errcode = '22023', message = 'invalid_driver_assignment';
  end if;

  select coalesce(array_agg(d.id order by d.id), '{}'::uuid[])
  into v_old_driver_ids
  from public.drivers d
  where d.vehicle_id = p_vehicle_id
    and d.deleted_at is null;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_added_driver_ids
  from unnest(v_driver_ids) requested(id)
  where not (requested.id = any(v_old_driver_ids));

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_removed_driver_ids
  from unnest(v_old_driver_ids) existing(id)
  where not (existing.id = any(v_driver_ids));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'driver_id', d.id,
        'driver_organization_id', d.organization_id,
        'from_vehicle_id', d.vehicle_id
      )
      order by d.id
    ),
    '[]'::jsonb
  )
  into v_moved_drivers
  from public.drivers d
  where d.id = any(v_driver_ids)
    and d.vehicle_id is not null
    and d.vehicle_id <> p_vehicle_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('driver_id', d.id, 'organization_id', d.organization_id)
      order by d.id
    ),
    '[]'::jsonb
  )
  into v_old_driver_organizations
  from public.drivers d
  where d.id = any(v_old_driver_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object('driver_id', d.id, 'organization_id', d.organization_id)
      order by d.id
    ),
    '[]'::jsonb
  )
  into v_new_driver_organizations
  from public.drivers d
  where d.id = any(v_driver_ids);

  update public.drivers d
  set vehicle_id = null,
      vehicle_number = '',
      updated_by_user_id = p_actor_user_id,
      updated_at = timezone('utc', now())
  where d.vehicle_id = p_vehicle_id
    and d.deleted_at is null
    and not (d.id = any(v_driver_ids));

  update public.drivers d
  set vehicle_id = p_vehicle_id,
      vehicle_number = v_vehicle.plate_number,
      updated_by_user_id = p_actor_user_id,
      updated_at = timezone('utc', now())
  where d.id = any(v_driver_ids)
    and (
      d.vehicle_id is distinct from p_vehicle_id
      or d.vehicle_number is distinct from v_vehicle.plate_number
    );

  if v_old_driver_ids is distinct from v_driver_ids then
    update public.fleet_vehicles
    set updated_by = p_actor_user_id,
        updated_at = timezone('utc', now())
    where id = p_vehicle_id;

    insert into public.fleet_vehicle_activity_logs (
      id,
      organization_id,
      vehicle_id,
      actor_user_id,
      action,
      old_values,
      new_values,
      created_at
    ) values (
      gen_random_uuid(),
      v_vehicle.assigned_organization_id,
      p_vehicle_id,
      p_actor_user_id,
      'assigned_driver_changed',
      jsonb_build_object(
        'vehicle_organization_id', v_vehicle.organization_id,
        'vehicle_operating_organization_id', v_vehicle.assigned_organization_id,
        'driver_ids', to_jsonb(v_old_driver_ids),
        'driver_organizations', v_old_driver_organizations
      ),
      jsonb_build_object(
        'vehicle_organization_id', v_vehicle.organization_id,
        'vehicle_operating_organization_id', v_vehicle.assigned_organization_id,
        'driver_ids', to_jsonb(v_driver_ids),
        'driver_organizations', v_new_driver_organizations,
        'added_driver_ids', to_jsonb(v_added_driver_ids),
        'removed_driver_ids', to_jsonb(v_removed_driver_ids),
        'moved_drivers', v_moved_drivers
      ),
      timezone('utc', now())
    );
  end if;

  return jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'driver_ids', to_jsonb(v_driver_ids),
    'added_count', cardinality(v_added_driver_ids),
    'removed_count', cardinality(v_removed_driver_ids)
  );
end;
$function$;

revoke all on function public.set_fleet_vehicle_assigned_drivers(uuid, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.set_fleet_vehicle_assigned_drivers(uuid, uuid[], uuid)
  to service_role;
