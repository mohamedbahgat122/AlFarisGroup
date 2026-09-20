-- Make drivers.vehicle_id the canonical current Driver <-> Fleet assignment.
-- The legacy fleet_vehicles.assigned_driver_* columns remain for compatibility/history.

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

  -- A stable driver lock order keeps concurrent set replacements and moves safe.
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
     or d.organization_id <> v_vehicle.assigned_organization_id
     or d.deleted_at is not null
     or (
       d.status <> 'active'::public.driver_status
       and d.vehicle_id is distinct from p_vehicle_id
     );

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
      jsonb_build_object('driver_id', d.id, 'from_vehicle_id', d.vehicle_id)
      order by d.id
    ),
    '[]'::jsonb
  )
  into v_moved_drivers
  from public.drivers d
  where d.id = any(v_driver_ids)
    and d.vehicle_id is not null
    and d.vehicle_id <> p_vehicle_id;

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
      jsonb_build_object('driver_ids', to_jsonb(v_old_driver_ids)),
      jsonb_build_object(
        'driver_ids', to_jsonb(v_driver_ids),
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

-- Preserve an existing canonical link. Only fill a missing link from the valid
-- legacy organization-driver relationship, then synchronize the compatibility plate.
with legacy_assignment as (
  select distinct on (d.id)
    d.id as driver_id,
    fv.id as vehicle_id,
    fv.plate_number
  from public.drivers d
  join public.fleet_vehicles fv
    on fv.assigned_driver_id = d.id
   and fv.assigned_driver_source = 'organization_driver'
   and fv.archived_at is null
   and fv.assigned_organization_id = d.organization_id
  where d.vehicle_id is null
    and d.deleted_at is null
  order by d.id, fv.updated_at desc nulls last, fv.created_at desc, fv.id desc
)
update public.drivers d
set vehicle_id = legacy.vehicle_id,
    vehicle_number = legacy.plate_number
from legacy_assignment legacy
where d.id = legacy.driver_id;

update public.drivers d
set vehicle_number = fv.plate_number
from public.fleet_vehicles fv
where d.vehicle_id = fv.id
  and d.vehicle_number is distinct from fv.plate_number;
