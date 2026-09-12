create table if not exists public.fleet_vehicle_odometer_resets (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  baseline_reading bigint not null check (baseline_reading >= 0),
  reset_at timestamptz not null default now(),
  reason text not null,
  note text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_vehicle_odometer_resets_vehicle_reset
  on public.fleet_vehicle_odometer_resets(vehicle_id, reset_at desc);

alter table public.fleet_vehicle_odometer_resets enable row level security;

create policy "Organization owners can manage their fleet vehicle odometer resets."
  on public.fleet_vehicle_odometer_resets
  for all
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'odometer.manage')
  );

-- Admin Baseline Reset RPC
create or replace function public.admin_set_vehicle_odometer_baseline(
  p_vehicle_id uuid,
  p_baseline_reading bigint,
  p_reset_at timestamptz,
  p_reason text,
  p_note text default null
)
returns public.fleet_vehicle_odometer_resets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_vehicle public.fleet_vehicles%rowtype;
  v_reset public.fleet_vehicle_odometer_resets%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_baseline_reading is null or p_baseline_reading < 0 then
    raise exception 'INVALID_BASELINE_READING' using errcode = '22023';
  end if;

  select * into v_vehicle from public.fleet_vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_vehicle.organization_id, 'odometer.manage')
  ) then
    raise exception 'ODOMETER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.fleet_vehicle_odometer_resets (
    id,
    organization_id,
    vehicle_id,
    baseline_reading,
    reset_at,
    reason,
    note,
    created_by
  ) values (
    v_id,
    v_vehicle.organization_id,
    v_vehicle.id,
    p_baseline_reading,
    coalesce(p_reset_at, now()),
    p_reason,
    p_note,
    v_actor_id
  )
  returning * into v_reset;

  -- Audit log
  insert into public.fleet_vehicle_activity_logs (
    id,
    organization_id,
    vehicle_id,
    actor_user_id,
    action,
    metadata
  ) values (
    gen_random_uuid(),
    v_vehicle.organization_id,
    v_vehicle.id,
    v_actor_id,
    'odometer_baseline_reset',
    jsonb_build_object(
      'reset_id', v_reset.id,
      'new_baseline', p_baseline_reading,
      'reason', p_reason,
      'note', p_note,
      'reset_at', v_reset.reset_at
    )
  );

  return v_reset;
end;
$$;

grant execute on function public.admin_set_vehicle_odometer_baseline to authenticated;

-- Admin Edit RPC
create or replace function public.admin_update_shift_odometer_reading(
  p_shift_id uuid,
  p_phase text,
  p_odometer_reading bigint,
  p_reason text default null
)
returns public.driver_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift public.driver_shifts%rowtype;
  v_prev_reading bigint;
  v_next_reading bigint;
  v_latest_reset public.fleet_vehicle_odometer_resets%rowtype;
  v_old_reading bigint;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_phase not in ('start', 'end') then
    raise exception 'INVALID_PHASE' using errcode = '22023';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  select * into v_shift from public.driver_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
  ) then
    raise exception 'ODOMETER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_phase = 'start' then
    v_old_reading := v_shift.start_odometer_reading;
    if v_shift.end_odometer_reading is not null and p_odometer_reading > v_shift.end_odometer_reading then
      raise exception 'SHIFT_START_ABOVE_END' using errcode = '22023';
    end if;

    -- Find the latest reset before this shift's start time
    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at <= v_shift.started_at
    order by reset_at desc
    limit 1;

    -- Find previous reading on same vehicle, BUT strictly after the latest reset
    select coalesce(
      case when end_odometer_reading is not null then end_odometer_reading else null end,
      case when start_odometer_reading is not null then start_odometer_reading else null end
    )
    into v_prev_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at < v_shift.started_at
      and (v_latest_reset.reset_at is null or started_at >= v_latest_reset.reset_at)
      and (end_odometer_reading is not null or start_odometer_reading is not null)
    order by started_at desc
    limit 1;

    -- If no prior shift in this continuity boundary, fallback to the baseline itself
    if v_prev_reading is null and v_latest_reset.baseline_reading is not null then
      v_prev_reading := v_latest_reset.baseline_reading;
    end if;

    if v_prev_reading is not null and p_odometer_reading < v_prev_reading then
      raise exception 'SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING' using errcode = '22023';
    end if;

    update public.driver_shifts
    set start_odometer_reading = p_odometer_reading,
        start_review_status = null,
        start_reviewed_by = null,
        start_reviewed_at = null,
        start_review_note = null,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;

  else
    v_old_reading := v_shift.end_odometer_reading;
    if v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
      raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
    end if;

    -- Find next reset after this shift's start/end time
    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at > coalesce(v_shift.ended_at, v_shift.started_at)
    order by reset_at asc
    limit 1;

    -- Find next reading on same vehicle, BUT strictly before the next reset
    select coalesce(
      case when start_odometer_reading is not null then start_odometer_reading else null end,
      case when end_odometer_reading is not null then end_odometer_reading else null end
    )
    into v_next_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at > coalesce(v_shift.ended_at, v_shift.started_at)
      and (v_latest_reset.reset_at is null or coalesce(ended_at, started_at) <= v_latest_reset.reset_at)
      and (start_odometer_reading is not null or end_odometer_reading is not null)
    order by started_at asc
    limit 1;

    if v_next_reading is not null and p_odometer_reading > v_next_reading then
      raise exception 'SHIFT_END_ABOVE_NEXT_VEHICLE_READING' using errcode = '22023';
    end if;

    update public.driver_shifts
    set end_odometer_reading = p_odometer_reading,
        end_review_status = null,
        end_reviewed_by = null,
        end_reviewed_at = null,
        end_review_note = null,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;
  end if;

  -- Audit log
  if v_shift.vehicle_id is not null then
    insert into public.fleet_vehicle_activity_logs (
      id,
      organization_id,
      vehicle_id,
      actor_user_id,
      action,
      metadata
    ) values (
      gen_random_uuid(),
      v_shift.organization_id,
      v_shift.vehicle_id,
      v_actor_id,
      'odometer_correction',
      jsonb_build_object(
        'shift_id', p_shift_id,
        'driver_id', v_shift.driver_id,
        'phase', p_phase,
        'old_reading', v_old_reading,
        'new_reading', p_odometer_reading,
        'reason', p_reason
      )
    );
  end if;

  return v_shift;
end;
$$;

grant execute on function public.admin_update_shift_odometer_reading to authenticated;

-- Cumulative distance fix for No-Approve Workflow
CREATE OR REPLACE FUNCTION public.get_organization_driver_cumulative_distances(
    p_organization_id uuid
)
RETURNS TABLE (
    driver_id uuid,
    total_distance_km bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as driver_id,
        COALESCE(SUM(ds.end_odometer_reading - ds.start_odometer_reading), 0)::bigint as total_distance_km
    FROM public.drivers d
    LEFT JOIN public.driver_shifts ds ON ds.driver_id = d.id
        AND ds.organization_id = p_organization_id
        AND ds.status = 'completed'
        AND ds.start_odometer_reading IS NOT NULL
        AND ds.end_odometer_reading IS NOT NULL
        AND ds.end_odometer_reading >= ds.start_odometer_reading
        AND ds.start_review_status IS DISTINCT FROM 'rejected'
        AND ds.end_review_status IS DISTINCT FROM 'rejected'
    WHERE d.organization_id = p_organization_id
    GROUP BY d.id;
END;
$$;

-- Odometer page RPC to retrieve continuity context without N+1
CREATE OR REPLACE FUNCTION public.get_odometer_page_shifts_context(
    p_organization_id uuid,
    p_date date
)
RETURNS TABLE (
    shift_id uuid,
    expected_previous_reading bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH DateShifts AS (
        SELECT id, vehicle_id, started_at
        FROM public.driver_shifts
        WHERE organization_id = p_organization_id
          AND (started_at AT TIME ZONE 'Asia/Riyadh')::date = p_date
          AND vehicle_id IS NOT NULL
    ),
    LatestResets AS (
        SELECT 
            ds.id as shift_id,
            (
                SELECT reset_at 
                FROM public.fleet_vehicle_odometer_resets r 
                WHERE r.vehicle_id = ds.vehicle_id AND r.reset_at <= ds.started_at
                ORDER BY reset_at DESC LIMIT 1
            ) as reset_time,
            (
                SELECT baseline_reading 
                FROM public.fleet_vehicle_odometer_resets r 
                WHERE r.vehicle_id = ds.vehicle_id AND r.reset_at <= ds.started_at
                ORDER BY reset_at DESC LIMIT 1
            ) as baseline_val
        FROM DateShifts ds
    ),
    PreviousReadings AS (
        SELECT 
            ds.id as shift_id,
            lr.baseline_val,
            (
                SELECT coalesce(
                    case when s.end_odometer_reading is not null then s.end_odometer_reading else null end,
                    case when s.start_odometer_reading is not null then s.start_odometer_reading else null end
                )
                FROM public.driver_shifts s
                WHERE s.vehicle_id = ds.vehicle_id 
                  AND s.id != ds.id
                  AND s.started_at < ds.started_at
                  AND (lr.reset_time IS NULL OR s.started_at >= lr.reset_time)
                  AND (s.end_odometer_reading IS NOT NULL OR s.start_odometer_reading IS NOT NULL)
                ORDER BY s.started_at DESC LIMIT 1
            ) as prev_reading
        FROM DateShifts ds
        LEFT JOIN LatestResets lr ON lr.shift_id = ds.id
    )
    SELECT 
        pr.shift_id,
        COALESCE(pr.prev_reading, pr.baseline_val) as expected_previous_reading
    FROM PreviousReadings pr;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_odometer_page_shifts_context(uuid, date) TO authenticated;