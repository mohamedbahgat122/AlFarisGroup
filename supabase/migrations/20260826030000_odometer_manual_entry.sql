-- Drop old signatures to avoid overloads
drop function if exists public.start_driver_shift(bigint, text, timestamptz);
drop function if exists public.end_driver_shift(bigint, text, timestamptz);
drop function if exists public.review_driver_shift_odometer(uuid, text, text, text);

-- Nullability Constraints
alter table public.driver_shifts alter column start_odometer_reading drop not null;

alter table public.driver_shifts
  drop constraint if exists driver_shifts_start_reading_check,
  add constraint driver_shifts_start_reading_check
    check (
      start_odometer_reading is not null
      or start_review_status in ('pending_review', 'rejected')
    );

alter table public.driver_shifts
  drop constraint if exists driver_shifts_end_review_requires_end_reading_check,
  add constraint driver_shifts_end_review_requires_end_reading_check
    check (
      (end_photo_path is null and end_odometer_reading is null and end_review_status is null)
      or (end_photo_path is not null and (
         end_odometer_reading is not null
         or end_review_status in ('pending_review', 'rejected')
      ))
    );

-- Recreation of RPCs
create or replace function public.start_driver_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle public.fleet_vehicles%rowtype;
  v_plate text;
  v_shift public.driver_shifts%rowtype;
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED';
  end if;

  if p_odometer_reading is not null and (p_odometer_reading < 0 or p_odometer_reading > 2147483647) then
    raise exception 'SHIFT_INVALID_READING';
  end if;

  if p_photo_captured_at is null then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE';
  end if;

  select fv.*
    into v_vehicle
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and fv.archived_at is null
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    )
  order by
    case when fv.assigned_driver_id = v_driver.id then 0 else 1 end,
    fv.created_at desc
  limit 1;

  v_plate := coalesce(
    nullif(v_vehicle.plate_number, ''),
    nullif(v_driver.keeta_vehicle_plate_number, ''),
    nullif(v_driver.vehicle_number, '')
  );

  if v_plate is null then
    raise exception 'SHIFT_VEHICLE_UNAVAILABLE';
  end if;

  insert into public.driver_shifts (
    driver_id,
    organization_id,
    vehicle_id,
    vehicle_plate_snapshot,
    status,
    started_at,
    start_odometer_reading,
    start_photo_path,
    start_photo_captured_at,
    start_review_status
  )
  values (
    v_driver.id,
    v_driver.organization_id,
    v_vehicle.id,
    v_plate,
    'open',
    timezone('utc', now()),
    p_odometer_reading,
    p_photo_path,
    p_photo_captured_at,
    case when p_odometer_reading is null then 'pending_review' else null end
  )
  returning * into v_shift;

  return jsonb_build_object(
    'id', v_shift.id,
    'status', v_shift.status,
    'started_at', v_shift.started_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot
  );
exception
  when unique_violation then
    raise exception 'SHIFT_OPEN_EXISTS';
end;
$$;


create or replace function public.end_driver_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_shift public.driver_shifts%rowtype;
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED';
  end if;

  if p_odometer_reading is not null and (p_odometer_reading < 0 or p_odometer_reading > 2147483647) then
    raise exception 'SHIFT_INVALID_READING';
  end if;

  if p_photo_captured_at is null then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE';
  end if;

  select ds.*
    into v_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open';

  if not found then
    raise exception 'SHIFT_NO_OPEN_SHIFT';
  end if;

  if p_odometer_reading is not null and v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
    raise exception 'SHIFT_END_BELOW_START';
  end if;

  update public.driver_shifts
  set
    status = 'completed',
    ended_at = timezone('utc', now()),
    end_odometer_reading = p_odometer_reading,
    end_photo_path = p_photo_path,
    end_photo_captured_at = p_photo_captured_at,
    end_review_status = case when p_odometer_reading is null then 'pending_review' else null end
  where id = v_shift.id
    and status = 'open'
  returning * into v_shift;

  return jsonb_build_object(
    'id', v_shift.id,
    'status', v_shift.status,
    'started_at', v_shift.started_at,
    'ended_at', v_shift.ended_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'end_odometer_reading', v_shift.end_odometer_reading,
    'distance', case when v_shift.end_odometer_reading is not null and v_shift.start_odometer_reading is not null then v_shift.end_odometer_reading - v_shift.start_odometer_reading else null end,
    'vehicle_plate', v_shift.vehicle_plate_snapshot
  );
end;
$$;


create or replace function public.review_driver_shift_odometer(
  p_shift_id uuid,
  p_phase text,
  p_decision text,
  p_review_note text default null,
  p_odometer_reading bigint default null
)
returns public.driver_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift public.driver_shifts%rowtype;
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  v_prev_reading bigint;
  v_next_reading bigint;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_phase not in ('start', 'end') then
    raise exception 'INVALID_PHASE' using errcode = '22023';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  if p_decision = 'rejected' and v_note is null then
    raise exception 'REJECTION_NOTE_REQUIRED' using errcode = '22023';
  end if;

  if p_decision = 'approved' and p_odometer_reading is null then
    raise exception 'APPROVAL_READING_REQUIRED' using errcode = '22023';
  end if;

  if p_odometer_reading is not null and (p_odometer_reading < 0 or p_odometer_reading > 2147483647) then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  select *
  into v_shift
  from public.driver_shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
  ) then
    raise exception 'ODOMETER_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  if p_phase = 'start' and p_decision = 'approved' then
    if v_shift.end_odometer_reading is not null and p_odometer_reading > v_shift.end_odometer_reading then
      raise exception 'SHIFT_START_ABOVE_END' using errcode = '22023';
    end if;

    select coalesce(
      case when end_odometer_reading is not null and (end_review_status is null or end_review_status = 'approved') then end_odometer_reading else null end,
      case when start_odometer_reading is not null and (start_review_status is null or start_review_status = 'approved') then start_odometer_reading else null end
    )
    into v_prev_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at < v_shift.started_at
    order by started_at desc
    limit 1;

    if v_prev_reading is not null and p_odometer_reading < v_prev_reading then
      raise exception 'SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING' using errcode = '22023';
    end if;
  end if;

  if p_phase = 'end' and p_decision = 'approved' then
    if v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
      raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
    end if;

    select coalesce(
      case when start_odometer_reading is not null and (start_review_status is null or start_review_status = 'approved') then start_odometer_reading else null end,
      case when end_odometer_reading is not null and (end_review_status is null or end_review_status = 'approved') then end_odometer_reading else null end
    )
    into v_next_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at > coalesce(v_shift.ended_at, v_shift.started_at)
    order by started_at asc
    limit 1;

    if v_next_reading is not null and p_odometer_reading > v_next_reading then
      raise exception 'SHIFT_END_ABOVE_NEXT_VEHICLE_READING' using errcode = '22023';
    end if;
  end if;

  if p_phase = 'start' then
    if p_decision = 'approved' then
      update public.driver_shifts
      set start_odometer_reading = p_odometer_reading,
          start_review_status = p_decision,
          start_reviewed_by = v_actor_id,
          start_reviewed_at = now(),
          start_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    else
      update public.driver_shifts
      set start_review_status = p_decision,
          start_reviewed_by = v_actor_id,
          start_reviewed_at = now(),
          start_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    end if;
  else
    if p_decision = 'approved' then
      update public.driver_shifts
      set end_odometer_reading = p_odometer_reading,
          end_review_status = p_decision,
          end_reviewed_by = v_actor_id,
          end_reviewed_at = now(),
          end_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    else
      update public.driver_shifts
      set end_review_status = p_decision,
          end_reviewed_by = v_actor_id,
          end_reviewed_at = now(),
          end_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    end if;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    target_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_actor_id,
    null,
    v_shift.organization_id,
    'driver_shift_odometer_' || p_phase || '_' || p_decision,
    'driver_shift',
    v_shift.id,
    jsonb_build_object(
      'phase', p_phase,
      'review_status', p_decision,
      'review_note', v_note,
      'odometer_reading', p_odometer_reading,
      'driver_id', v_shift.driver_id,
      'vehicle_id', v_shift.vehicle_id
    ),
    jsonb_build_object('source', 'dashboard')
  );

  return v_shift;
end;
$$;

revoke all on function public.start_driver_shift(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.end_driver_shift(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.review_driver_shift_odometer(uuid, text, text, text, bigint) from public, anon, authenticated;

grant execute on function public.start_driver_shift(bigint, text, timestamptz) to authenticated;
grant execute on function public.end_driver_shift(bigint, text, timestamptz) to authenticated;
grant execute on function public.review_driver_shift_odometer(uuid, text, text, text, bigint) to authenticated;
