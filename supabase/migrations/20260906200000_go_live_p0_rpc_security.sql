create or replace function public.get_odometer_page_shifts_context(
  p_organization_id uuid,
  p_date date
)
returns table (
  shift_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  expected_previous_reading bigint,
  latest_baseline_reading bigint,
  latest_baseline_reset_at timestamptz,
  latest_baseline_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_current_user_organization_permission(p_organization_id, 'odometer.manage') then
    raise exception 'ODOMETER_CONTEXT_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with organization_drivers as (
    select d.id
    from public.drivers d
    where d.organization_id = p_organization_id
      and d.deleted_at is null
  ),
  date_shifts as (
    select distinct on (ds.driver_id)
      ds.id,
      ds.driver_id,
      ds.vehicle_id,
      ds.started_at
    from public.driver_shifts ds
    where ds.organization_id = p_organization_id
      and (ds.started_at at time zone 'Asia/Riyadh')::date = p_date
    order by ds.driver_id, ds.started_at desc
  ),
  row_vehicles as (
    select
      d.id as driver_id,
      ds.id as shift_id,
      coalesce(ds.vehicle_id, cv.vehicle_id) as vehicle_id,
      ds.started_at
    from organization_drivers d
    left join date_shifts ds on ds.driver_id = d.id
    left join lateral (
      select fv.id as vehicle_id
      from public.fleet_vehicles fv
      where fv.organization_id = p_organization_id
        and fv.archived_at is null
        and (
          fv.assigned_driver_id = d.id
          or fv.authorized_driver_id = d.id
        )
      order by
        case when fv.assigned_driver_id = d.id then 0 else 1 end,
        fv.created_at desc
      limit 1
    ) cv on true
  ),
  baseline_context as (
    select
      rv.driver_id,
      rv.shift_id,
      rv.vehicle_id,
      rv.started_at,
      cr.baseline_reading as continuity_baseline_reading,
      cr.reset_at as continuity_reset_at,
      lb.baseline_reading as latest_baseline_reading,
      lb.reset_at as latest_baseline_reset_at,
      lb.reason as latest_baseline_reason
    from row_vehicles rv
    left join lateral (
      select
        r.baseline_reading,
        r.reset_at
      from public.fleet_vehicle_odometer_resets r
      where r.organization_id = p_organization_id
        and r.vehicle_id = rv.vehicle_id
        and rv.started_at is not null
        and r.reset_at <= rv.started_at
      order by r.reset_at desc
      limit 1
    ) cr on true
    left join lateral (
      select
        r.baseline_reading,
        r.reset_at,
        r.reason
      from public.fleet_vehicle_odometer_resets r
      where r.organization_id = p_organization_id
        and r.vehicle_id = rv.vehicle_id
      order by r.reset_at desc
      limit 1
    ) lb on true
  ),
  previous_context as (
    select
      bc.driver_id,
      bc.shift_id,
      bc.vehicle_id,
      bc.continuity_baseline_reading,
      bc.continuity_reset_at,
      bc.latest_baseline_reading,
      bc.latest_baseline_reset_at,
      bc.latest_baseline_reason,
      previous.valid_reading as previous_reading
    from baseline_context bc
    left join lateral (
      select coalesce(
        case
          when s.end_odometer_reading is not null
            and s.end_review_status is distinct from 'rejected'
          then s.end_odometer_reading
          else null
        end,
        case
          when s.start_odometer_reading is not null
            and s.start_review_status is distinct from 'rejected'
          then s.start_odometer_reading
          else null
        end
      ) as valid_reading
      from public.driver_shifts s
      where s.organization_id = p_organization_id
        and s.vehicle_id = bc.vehicle_id
        and bc.shift_id is not null
        and s.id <> bc.shift_id
        and s.started_at < bc.started_at
        and (bc.continuity_reset_at is null or s.started_at >= bc.continuity_reset_at)
        and (
          (s.end_odometer_reading is not null and s.end_review_status is distinct from 'rejected')
          or (s.start_odometer_reading is not null and s.start_review_status is distinct from 'rejected')
        )
      order by s.started_at desc
      limit 1
    ) previous on true
  )
  select
    pc.shift_id,
    pc.driver_id,
    pc.vehicle_id,
    case
      when pc.shift_id is null then null
      else coalesce(pc.previous_reading, pc.continuity_baseline_reading)
    end as expected_previous_reading,
    pc.latest_baseline_reading,
    pc.latest_baseline_reset_at,
    pc.latest_baseline_reason
  from previous_context pc;
end;
$$;

revoke all on function public.get_odometer_page_shifts_context(uuid, date) from public;
revoke all on function public.get_odometer_page_shifts_context(uuid, date) from anon;
revoke all on function public.get_odometer_page_shifts_context(uuid, date) from authenticated;
grant execute on function public.get_odometer_page_shifts_context(uuid, date) to authenticated, service_role;

revoke all on function public.complete_maintenance_job(uuid, text, integer) from public;
revoke all on function public.complete_maintenance_job(uuid, text, integer) from anon;
revoke all on function public.complete_maintenance_job(uuid, text, integer) from authenticated;
grant execute on function public.complete_maintenance_job(uuid, text, integer) to service_role;
