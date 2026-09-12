alter table public.fleet_vehicle_activity_logs
  drop constraint if exists fleet_vehicle_activity_logs_action_check,
  add constraint fleet_vehicle_activity_logs_action_check
    check (
      action in (
        'vehicle_created',
        'vehicle_updated',
        'vehicle_suspended',
        'vehicle_reactivated',
        'vehicle_archived',
        'vehicle_restored',
        'assigned_driver_changed',
        'authorized_person_changed',
        'technical_status_changed',
        'operating_card_changed',
        'odometer_correction',
        'odometer_baseline_reset'
      )
    );

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

  insert into public.fleet_vehicle_activity_logs (
    id,
    organization_id,
    vehicle_id,
    actor_user_id,
    action,
    old_values,
    new_values,
    note
  ) values (
    gen_random_uuid(),
    v_vehicle.organization_id,
    v_vehicle.id,
    v_actor_id,
    'odometer_baseline_reset',
    null,
    jsonb_build_object(
      'reset_id', v_reset.id,
      'vehicle_id', v_vehicle.id,
      'baseline_reading', p_baseline_reading,
      'reason', p_reason,
      'reset_at', v_reset.reset_at
    ),
    p_note
  );

  return v_reset;
end;
$$;

grant execute on function public.admin_set_vehicle_odometer_baseline(uuid, bigint, timestamptz, text, text) to authenticated;

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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
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

    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at <= v_shift.started_at
    order by reset_at desc
    limit 1;

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

    if v_prev_reading is null and v_latest_reset.baseline_reading is not null then
      v_prev_reading := v_latest_reset.baseline_reading;
    end if;

    if v_prev_reading is not null and p_odometer_reading < v_prev_reading then
      raise exception 'SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING' using errcode = '22023';
    end if;

    update public.driver_shifts
    set start_odometer_reading = p_odometer_reading,
        start_review_status = 'approved',
        start_reviewed_by = v_actor_id,
        start_reviewed_at = now(),
        start_review_note = v_reason,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;

  else
    v_old_reading := v_shift.end_odometer_reading;
    if v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
      raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
    end if;

    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at > coalesce(v_shift.ended_at, v_shift.started_at)
    order by reset_at asc
    limit 1;

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
        end_review_status = 'approved',
        end_reviewed_by = v_actor_id,
        end_reviewed_at = now(),
        end_review_note = v_reason,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;
  end if;

  if v_shift.vehicle_id is not null then
    insert into public.fleet_vehicle_activity_logs (
      id,
      organization_id,
      vehicle_id,
      actor_user_id,
      action,
      old_values,
      new_values,
      note
    ) values (
      gen_random_uuid(),
      v_shift.organization_id,
      v_shift.vehicle_id,
      v_actor_id,
      'odometer_correction',
      jsonb_build_object(
        'shift_id', p_shift_id,
        'driver_id', v_shift.driver_id,
        'vehicle_id', v_shift.vehicle_id,
        'phase', p_phase,
        'odometer_reading', v_old_reading
      ),
      jsonb_build_object(
        'shift_id', p_shift_id,
        'driver_id', v_shift.driver_id,
        'vehicle_id', v_shift.vehicle_id,
        'phase', p_phase,
        'odometer_reading', p_odometer_reading,
        'reason', v_reason
      ),
      v_reason
    );
  end if;

  return v_shift;
end;
$$;

grant execute on function public.admin_update_shift_odometer_reading(uuid, text, bigint, text) to authenticated;
