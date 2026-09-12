create or replace function public.get_organization_driver_cumulative_distances(
  p_organization_id uuid
)
returns table (
  driver_id uuid,
  total_distance_km bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    d.id as driver_id,
    coalesce(sum(ds.end_odometer_reading - ds.start_odometer_reading), 0)::bigint as total_distance_km
  from public.drivers d
  left join public.driver_shifts ds
    on ds.driver_id = d.id
    and ds.organization_id = p_organization_id
    and ds.status = 'completed'
    and ds.start_odometer_reading is not null
    and ds.end_odometer_reading is not null
    and ds.end_odometer_reading >= ds.start_odometer_reading
    and ds.start_review_status is distinct from 'rejected'
    and ds.end_review_status is distinct from 'rejected'
  where d.organization_id = p_organization_id
  group by d.id;
end;
$$;

grant execute on function public.get_organization_driver_cumulative_distances(uuid) to authenticated;

create or replace function public.get_odometer_page_shifts_context(
  p_organization_id uuid,
  p_date date
)
returns table (
  shift_id uuid,
  expected_previous_reading bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with date_shifts as (
    select ds.id, ds.vehicle_id, ds.started_at
    from public.driver_shifts ds
    where ds.organization_id = p_organization_id
      and (ds.started_at at time zone 'Asia/Riyadh')::date = p_date
      and ds.vehicle_id is not null
  ),
  reset_context as (
    select
      ds.id as shift_id,
      r.reset_at,
      r.baseline_reading
    from date_shifts ds
    left join lateral (
      select fr.reset_at, fr.baseline_reading
      from public.fleet_vehicle_odometer_resets fr
      where fr.organization_id = p_organization_id
        and fr.vehicle_id = ds.vehicle_id
        and fr.reset_at <= ds.started_at
      order by fr.reset_at desc
      limit 1
    ) r on true
  ),
  previous_context as (
    select
      ds.id as shift_id,
      rc.baseline_reading,
      previous.valid_reading as previous_reading,
      previous.started_at as previous_started_at
    from date_shifts ds
    left join reset_context rc on rc.shift_id = ds.id
    left join lateral (
      select
        coalesce(
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
        ) as valid_reading,
        s.started_at
      from public.driver_shifts s
      where s.organization_id = p_organization_id
        and s.vehicle_id = ds.vehicle_id
        and s.id <> ds.id
        and s.started_at < ds.started_at
        and (rc.reset_at is null or s.started_at >= rc.reset_at)
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
    case
      when pc.baseline_reading is not null
        and (pc.previous_started_at is null or pc.previous_started_at < (
          select rc.reset_at from reset_context rc where rc.shift_id = pc.shift_id
        ))
      then pc.baseline_reading
      else coalesce(pc.previous_reading, pc.baseline_reading)
    end as expected_previous_reading
  from previous_context pc;
end;
$$;

grant execute on function public.get_odometer_page_shifts_context(uuid, date) to authenticated;
