-- Keep the legacy Driver App vehicle RPC contract while resolving through drivers.vehicle_id first.

create or replace function public.get_driver_current_vehicle(p_driver_id uuid)
returns table (
  vehicle_id uuid,
  plate_number text
)
language sql
stable
set search_path = ''
as $$
  with driver_record as (
    select d.id, d.organization_id, d.vehicle_id
    from public.drivers d
    where d.id = p_driver_id
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
  ),
  linked_vehicle as (
    select fv.id, fv.plate_number, 0 as resolution_order
    from driver_record d
    join public.fleet_vehicles fv
      on fv.id = d.vehicle_id
    where d.vehicle_id is not null
      and fv.archived_at is null
      and coalesce(fv.assigned_organization_id, fv.organization_id) = d.organization_id
  ),
  legacy_vehicle as (
    select fv.id, fv.plate_number, 1 as resolution_order
    from driver_record d
    join public.fleet_vehicles fv
      on (
        fv.assigned_driver_id = d.id
        or fv.authorized_driver_id = d.id
      )
    where d.vehicle_id is null
      and fv.archived_at is null
  )
  select resolved.id, resolved.plate_number
  from (
    select * from linked_vehicle
    union all
    select * from legacy_vehicle
  ) resolved
  order by resolved.resolution_order
  limit 1;
$$;

notify pgrst, 'reload schema';
