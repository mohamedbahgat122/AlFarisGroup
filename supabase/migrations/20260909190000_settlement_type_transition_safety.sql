-- Enforce settlement/source isolation and prevent unsafe settlement transitions.
-- Historical completed driver_shifts rows are intentionally not revalidated.

begin;

create or replace function public.enforce_driver_shift_settlement_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_type public.driver_settlement_type;
begin
  if new.status = 'open'
     or (tg_op = 'UPDATE' and old.status = 'open' and new.status <> 'open') then
    select d.settlement_type
      into v_settlement_type
    from public.drivers d
    where d.id = new.driver_id
      and d.organization_id = new.organization_id
    for update;

    if new.shift_template_id is not null
       and new.order_period_template_id is null
       and v_settlement_type is distinct from 'tiers'::public.driver_settlement_type then
      raise exception 'DRIVER_SETTLEMENT_SOURCE_MISMATCH'
        using errcode = '42501';
    end if;

    if new.order_period_template_id is not null
       and new.shift_template_id is null
       and v_settlement_type is distinct from 'per_order'::public.driver_settlement_type then
      raise exception 'DRIVER_SETTLEMENT_SOURCE_MISMATCH'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.start_driver_order_shift(
  p_odometer_reading bigint, p_photo_path text, p_photo_captured_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_assignment public.organization_order_period_assignments%rowtype;
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
  v_override public.organization_order_period_open_overrides%rowtype;
  v_vehicle public.fleet_vehicles%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_plate text;
  v_selected_template_id uuid;
begin
  if v_user_id is null then raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;

  -- The driver row is the first lock in every start path.
  select d.* into v_driver from public.drivers d
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status
    and d.deleted_at is null for update;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  if v_driver.settlement_type is distinct from 'per_order'::public.driver_settlement_type then
    raise exception 'ORDER_PERIOD_DRIVER_INVALID' using errcode = '42501';
  end if;

  select a.order_period_template_id into v_selected_template_id
  from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
    and a.assignment_start_date <= v_today
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.id desc limit 1;
  if not found then raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501'; end if;

  select * into v_template from public.organization_order_period_templates
  where id = v_selected_template_id and organization_id = v_driver.organization_id for update;
  if not found then raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501'; end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = v_driver.organization_id and order_period_template_id = v_template.id for update;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null
     or v_policy.minimum_work_minutes is null then
    raise exception 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  -- Revalidate the locked authoritative row before the final eligibility decision.
  select d.* into v_driver from public.drivers d
  where d.id = v_driver.id and d.auth_user_id = v_user_id for update;
  if not found or v_driver.organization_id is null or v_driver.status <> 'active'::public.driver_status
     or v_driver.deleted_at is not null
     or v_driver.settlement_type is distinct from 'per_order'::public.driver_settlement_type then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;

  perform 1 from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
  order by a.id for update;
  select * into v_assignment from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
    and a.assignment_start_date <= v_today
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.id desc limit 1;
  if not found or v_assignment.order_period_template_id <> v_template.id then
    raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501';
  end if;
  if not v_template.is_active or v_template.archived_at is not null or not v_template.is_published then
    raise exception 'ORDER_PERIOD_TEMPLATE_INVALID' using errcode = '42501';
  end if;

  select ds.* into v_shift from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
  order by ds.started_at desc limit 1 for update;
  if found then raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505'; end if;
  select * into v_occ from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  if not found then raise exception 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE' using errcode = '42501'; end if;
  select * into v_override from public.organization_order_period_open_overrides o
  where o.organization_id = v_driver.organization_id and o.order_period_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occ.scheduled_business_date
    and o.opened_at <= v_now and o.expires_at > v_now for update;
  if not found and (v_now < v_occ.opens_at or v_now >= v_occ.closes_at) then
    raise exception 'ORDER_PERIOD_START_WINDOW_NOT_OPEN' using errcode = '42501';
  end if;

  select fv.* into v_vehicle from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id and fv.archived_at is null
    and (fv.assigned_driver_id = v_driver.id or fv.authorized_driver_id = v_driver.id)
  order by case when fv.assigned_driver_id = v_driver.id then 0 else 1 end, fv.created_at desc limit 1;
  v_plate := coalesce(nullif(v_vehicle.plate_number, ''), nullif(v_driver.keeta_vehicle_plate_number, ''), nullif(v_driver.vehicle_number, ''));
  if v_plate is null then raise exception 'SHIFT_VEHICLE_UNAVAILABLE' using errcode = '22023'; end if;
  insert into public.driver_shifts (
    driver_id, organization_id, vehicle_id, vehicle_plate_snapshot, status,
    attendance_control_version, shift_template_id, order_period_template_id,
    scheduled_business_date, applied_start_open_before_minutes, applied_minimum_work_minutes,
    started_at, start_odometer_reading, start_photo_path, start_photo_captured_at
  ) values (
    v_driver.id, v_driver.organization_id, v_vehicle.id, v_plate, 'open', 1, null, v_template.id,
    v_occ.scheduled_business_date, v_policy.open_before_minutes, v_policy.minimum_work_minutes,
    v_now, p_odometer_reading, p_photo_path, p_photo_captured_at
  ) returning * into v_shift;
  delete from public.organization_order_period_open_overrides where id = v_override.id;
  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_user_id, v_driver.organization_id, 'driver_order_shift_started', 'driver_shift', v_shift.id,
    jsonb_build_object('driver_id', v_driver.id, 'order_period_template_id', v_template.id,
      'scheduled_business_date', v_shift.scheduled_business_date, 'started_at', v_shift.started_at),
    jsonb_build_object('source', 'driver_order_odometer')
  );
  return jsonb_build_object('id', v_shift.id, 'status', v_shift.status,
    'started_at', v_shift.started_at, 'start_odometer_reading', v_shift.start_odometer_reading,
    'order_period_template_id', v_shift.order_period_template_id,
    'scheduled_business_date', v_shift.scheduled_business_date,
    'applied_minimum_work_minutes', v_shift.applied_minimum_work_minutes);
exception when unique_violation then
  raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505';
end;
$$;

drop trigger if exists enforce_driver_shift_settlement_source on public.driver_shifts;
create trigger enforce_driver_shift_settlement_source
  before insert or update on public.driver_shifts
  for each row
  execute function public.enforce_driver_shift_settlement_source();

create or replace function public.prevent_unsafe_driver_settlement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if new.settlement_type is null then
    raise exception 'DRIVER_SETTLEMENT_TYPE_REQUIRED'
      using errcode = '23514';
  end if;

  if new.settlement_type is not distinct from old.settlement_type then
    return new;
  end if;

  if exists (
    select 1
    from public.driver_shifts ds
    where ds.driver_id = old.id
      and ds.status = 'open'
  ) then
    raise exception 'DRIVER_SETTLEMENT_CHANGE_BLOCKED_OPEN_ATTENDANCE'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.organization_shift_assignments a
    where a.driver_id = old.id
      and a.organization_id = old.organization_id
      and a.is_active
      and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  ) or exists (
    select 1
    from public.organization_order_period_assignments a
    where a.driver_id = old.id
      and a.organization_id = old.organization_id
      and a.is_active
      and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  ) then
    raise exception 'DRIVER_SETTLEMENT_CHANGE_BLOCKED_ACTIVE_ASSIGNMENT'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.organization_shift_attendance_overrides o
    where o.driver_id = old.id
      and o.organization_id = old.organization_id
      and o.override_expires_at > now()
  ) or exists (
    select 1
    from public.organization_order_period_open_overrides o
    where o.driver_id = old.id
      and o.organization_id = old.organization_id
      and o.expires_at > now()
  ) then
    raise exception 'DRIVER_SETTLEMENT_CHANGE_BLOCKED_ACTIVE_OVERRIDE'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.driver_shift_change_requests r
    where r.driver_id = old.id
      and r.status = 'pending'
  ) or exists (
    select 1
    from public.driver_order_shift_change_requests r
    where r.driver_id = old.id
      and r.status = 'pending'
  ) then
    raise exception 'DRIVER_SETTLEMENT_CHANGE_BLOCKED_PENDING_REQUEST'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unsafe_driver_settlement_change on public.drivers;
create trigger prevent_unsafe_driver_settlement_change
  before update of settlement_type on public.drivers
  for each row
  execute function public.prevent_unsafe_driver_settlement_change();

create or replace function public.enforce_driver_assignment_settlement_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_type public.driver_settlement_type;
begin
  if not new.is_active then
    return new;
  end if;

  select d.settlement_type into v_settlement_type
  from public.drivers d
  where d.id = new.driver_id
    and d.organization_id = new.organization_id
  for update;

  if v_settlement_type is distinct from 'tiers'::public.driver_settlement_type then
    raise exception 'DRIVER_NOT_TIERS' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_driver_order_assignment_settlement_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_type public.driver_settlement_type;
begin
  if not new.is_active then
    return new;
  end if;

  select d.settlement_type into v_settlement_type
  from public.drivers d
  where d.id = new.driver_id
    and d.organization_id = new.organization_id
  for update;

  if v_settlement_type is distinct from 'per_order'::public.driver_settlement_type then
    raise exception 'ORDER_PERIOD_DRIVER_INVALID' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_driver_assignment_settlement_source
  on public.organization_shift_assignments;
drop trigger if exists enforce_normal_shift_tiers_driver
  on public.organization_shift_assignments;

create trigger enforce_driver_assignment_settlement_source
  before insert or update on public.organization_shift_assignments
  for each row
  execute function public.enforce_driver_assignment_settlement_source();

drop trigger if exists enforce_driver_order_assignment_settlement_source
  on public.organization_order_period_assignments;
create trigger enforce_driver_order_assignment_settlement_source
  before insert or update on public.organization_order_period_assignments
  for each row
  execute function public.enforce_driver_order_assignment_settlement_source();

create or replace function public.enforce_driver_override_settlement_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_type public.driver_settlement_type;
begin
  select d.settlement_type into v_settlement_type
  from public.drivers d
  where d.id = new.driver_id
    and d.organization_id = new.organization_id
  for update;

  if v_settlement_type is distinct from 'tiers'::public.driver_settlement_type then
    raise exception 'DRIVER_NOT_TIERS' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_driver_order_override_settlement_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement_type public.driver_settlement_type;
begin
  select d.settlement_type into v_settlement_type
  from public.drivers d
  where d.id = new.driver_id
    and d.organization_id = new.organization_id
  for update;

  if v_settlement_type is distinct from 'per_order'::public.driver_settlement_type then
    raise exception 'ORDER_PERIOD_DRIVER_INVALID' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_driver_override_settlement_source
  on public.organization_shift_attendance_overrides;
create trigger enforce_driver_override_settlement_source
  before insert or update on public.organization_shift_attendance_overrides
  for each row
  execute function public.enforce_driver_override_settlement_source();

drop trigger if exists enforce_driver_order_override_settlement_source
  on public.organization_order_period_open_overrides;
create trigger enforce_driver_order_override_settlement_source
  before insert or update on public.organization_order_period_open_overrides
  for each row
  execute function public.enforce_driver_order_override_settlement_source();

-- Reassert the deployed attendance RPCs with explicit source checks and a
-- driver-first lock order. These definitions retain the existing contracts
-- while removing late trigger-only source rejection and lock inversion.
create or replace function public.start_driver_shift(
  p_odometer_reading bigint, p_photo_path text, p_photo_captured_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle public.fleet_vehicles%rowtype;
  v_template public.organization_shift_templates%rowtype;
  v_assignment public.organization_shift_assignments%rowtype;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_occurrence record;
  v_now timestamptz := now();
  v_start_available_at timestamptz;
  v_plate text;
  v_has_occurrence boolean := false;
begin
  if v_user_id is null then raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;
  select d.* into v_driver from public.drivers d
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status
    and d.deleted_at is null for update;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  if v_driver.settlement_type is distinct from 'tiers'::public.driver_settlement_type then
    raise exception 'DRIVER_NOT_TIERS' using errcode = '42501';
  end if;

  for v_assignment in select a.* from public.organization_shift_assignments a
    where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active = true
    order by a.assignment_start_date desc nulls last, a.created_at asc
  loop
    select t.* into v_template from public.organization_shift_templates t
    where t.id = v_assignment.shift_template_id and t.organization_id = v_assignment.organization_id
      and t.is_active = true and t.archived_at is null;
    if found then
      select * into v_occurrence from public.resolve_shift_attendance_occurrence(
        v_driver.organization_id, v_template.id, v_driver.id);
      if found then v_has_occurrence := true; exit; end if;
    end if;
  end loop;
  if not v_has_occurrence then raise exception 'SHIFT_NO_CURRENT_ASSIGNMENT' using errcode = '22023'; end if;

  select t.* into v_template from public.organization_shift_templates t
  where t.id = v_template.id and t.organization_id = v_driver.organization_id
    and t.is_active = true and t.archived_at is null for update;
  select p.* into v_policy from public.organization_shift_attendance_policies p
  where p.organization_id = v_driver.organization_id and p.shift_template_id = v_template.id for update;
  if not found or v_policy.start_open_before_minutes is null or v_policy.minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;
  v_start_available_at := v_occurrence.scheduled_start_at
    - make_interval(mins => v_policy.start_open_before_minutes);
  select o.* into v_override from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id and o.shift_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now and o.override_expires_at > v_now for update;
  if v_now < v_start_available_at and not found then
    raise exception 'SHIFT_START_WINDOW_NOT_OPEN' using errcode = '42501';
  end if;

  select fv.* into v_vehicle from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id and fv.archived_at is null
    and (fv.assigned_driver_id = v_driver.id or fv.authorized_driver_id = v_driver.id)
  order by case when fv.assigned_driver_id = v_driver.id then 0 else 1 end, fv.created_at desc limit 1;
  v_plate := coalesce(nullif(v_vehicle.plate_number, ''), nullif(v_driver.keeta_vehicle_plate_number, ''), nullif(v_driver.vehicle_number, ''));
  if v_plate is null then raise exception 'SHIFT_VEHICLE_UNAVAILABLE' using errcode = '22023'; end if;

  insert into public.driver_shifts (
    driver_id, organization_id, vehicle_id, vehicle_plate_snapshot, status,
    attendance_control_version, shift_template_id, scheduled_business_date,
    applied_start_open_before_minutes, applied_minimum_work_minutes,
    started_at, start_odometer_reading, start_photo_path, start_photo_captured_at
  ) values (
    v_driver.id, v_driver.organization_id, v_vehicle.id, v_plate, 'open', 1,
    v_template.id, v_occurrence.scheduled_business_date,
    v_policy.start_open_before_minutes, v_policy.minimum_work_minutes,
    v_now, p_odometer_reading, p_photo_path, p_photo_captured_at
  ) returning * into v_shift;
  return jsonb_build_object('id', v_shift.id, 'status', v_shift.status,
    'started_at', v_shift.started_at, 'start_odometer_reading', v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot, 'shift_template_id', v_shift.shift_template_id,
    'scheduled_business_date', v_shift.scheduled_business_date,
    'applied_minimum_work_minutes', v_shift.applied_minimum_work_minutes);
exception when unique_violation then
  raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505';
end;
$$;

create or replace function public.end_driver_shift(
  p_odometer_reading bigint, p_photo_path text, p_photo_captured_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_now timestamptz := now();
  v_end_available_at timestamptz;
  v_legacy_session boolean := false;
begin
  if v_user_id is null then raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;
  select d.* into v_driver from public.drivers d
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status and d.deleted_at is null
  for update;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  if v_driver.settlement_type is distinct from 'tiers'::public.driver_settlement_type then
    raise exception 'DRIVER_NOT_TIERS' using errcode = '42501';
  end if;
  select ds.* into v_shift from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
    and ds.shift_template_id is not null and ds.order_period_template_id is null
  order by ds.started_at desc limit 1 for update;
  if not found then raise exception 'SHIFT_NO_OPEN_SHIFT' using errcode = 'P0002'; end if;
  v_legacy_session := v_shift.attendance_control_version is null
    and v_shift.shift_template_id is null and v_shift.order_period_template_id is null
    and v_shift.scheduled_business_date is null
    and v_shift.applied_start_open_before_minutes is null
    and v_shift.applied_minimum_work_minutes is null;
  if not v_legacy_session and v_shift.applied_minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNAVAILABLE' using errcode = '22023';
  end if;
  if not v_legacy_session then
    v_end_available_at := v_shift.started_at + make_interval(mins => v_shift.applied_minimum_work_minutes);
  end if;
  if not v_legacy_session and v_now < v_end_available_at then
    raise exception 'SHIFT_END_TOO_EARLY' using errcode = '42501';
  end if;
  if p_odometer_reading < v_shift.start_odometer_reading then
    raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
  end if;
  update public.driver_shifts set status = 'completed', ended_at = v_now,
    end_odometer_reading = p_odometer_reading, end_photo_path = p_photo_path,
    end_photo_captured_at = p_photo_captured_at
  where id = v_shift.id and status = 'open' returning * into v_shift;
  if not found then raise exception 'SHIFT_ALREADY_ENDED' using errcode = '40001'; end if;
  return jsonb_build_object('id', v_shift.id, 'status', v_shift.status,
    'started_at', v_shift.started_at, 'ended_at', v_shift.ended_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'end_odometer_reading', v_shift.end_odometer_reading,
    'distance', v_shift.end_odometer_reading - v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot, 'end_available_at', v_end_available_at);
end;
$$;

create or replace function public.end_driver_order_shift(
  p_odometer_reading bigint, p_photo_path text, p_photo_captured_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_now timestamptz := now();
  v_end_available_at timestamptz;
begin
  if v_user_id is null then raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;
  select d.* into v_driver from public.drivers d join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status and d.deleted_at is null
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false for update;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  if v_driver.settlement_type is distinct from 'per_order'::public.driver_settlement_type then
    raise exception 'ORDER_PERIOD_DRIVER_INVALID' using errcode = '42501';
  end if;
  select * into v_shift from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
    and ds.shift_template_id is null and ds.order_period_template_id is not null
  order by ds.started_at desc limit 1 for update;
  if not found then raise exception 'SHIFT_NO_OPEN_SHIFT' using errcode = 'P0002'; end if;
  if v_shift.applied_minimum_work_minutes is null then
    raise exception 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;
  v_end_available_at := v_shift.started_at + make_interval(mins => v_shift.applied_minimum_work_minutes);
  if v_now < v_end_available_at then raise exception 'SHIFT_END_TOO_EARLY' using errcode = '42501'; end if;
  if p_odometer_reading < v_shift.start_odometer_reading then raise exception 'SHIFT_END_BELOW_START' using errcode = '22023'; end if;
  update public.driver_shifts set status = 'completed', ended_at = v_now,
    end_odometer_reading = p_odometer_reading, end_photo_path = p_photo_path,
    end_photo_captured_at = p_photo_captured_at
  where id = v_shift.id and status = 'open' returning * into v_shift;
  if not found then raise exception 'SHIFT_ALREADY_ENDED' using errcode = '40001'; end if;
  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_user_id, v_driver.organization_id, 'driver_order_shift_completed', 'driver_shift', v_shift.id,
    jsonb_build_object('driver_id', v_driver.id, 'ended_at', v_shift.ended_at,
      'end_odometer_reading', v_shift.end_odometer_reading),
    jsonb_build_object('source', 'driver_order_odometer')
  );
  return jsonb_build_object('id', v_shift.id, 'status', v_shift.status,
    'started_at', v_shift.started_at, 'ended_at', v_shift.ended_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'end_odometer_reading', v_shift.end_odometer_reading,
    'distance', v_shift.end_odometer_reading - v_shift.start_odometer_reading,
    'end_available_at', v_end_available_at);
end;
$$;

-- These existing mutation bodies already perform the complete business
-- workflow. The wrappers acquire driver locks first, then delegate to the
-- deployed body, preserving its validation and return contract.
alter function public.move_order_period_driver(uuid, uuid, uuid, uuid, date, date)
  rename to move_order_period_driver_unchecked;
create or replace function public.move_order_period_driver(
  p_organization_id uuid, p_source_order_period_id uuid, p_target_order_period_id uuid,
  p_driver_id uuid, p_week_start date, p_week_end date
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.drivers where id = p_driver_id and organization_id = p_organization_id for update;
  return public.move_order_period_driver_unchecked(
    p_organization_id, p_source_order_period_id, p_target_order_period_id,
    p_driver_id, p_week_start, p_week_end
  );
end;
$$;

alter function public.replace_order_period_week_members(uuid, uuid, date, date, uuid[])
  rename to replace_order_period_week_members_unchecked;
create or replace function public.replace_order_period_week_members(
  p_organization_id uuid, p_order_period_template_id uuid, p_week_start date,
  p_week_end date, p_driver_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_relevant uuid[];
begin
  v_relevant := coalesce(
    (select array_agg(distinct driver_id order by driver_id)
     from public.organization_order_period_assignments
     where organization_id = p_organization_id
       and order_period_template_id = p_order_period_template_id
       and is_active
       and assignment_start_date <= p_week_end
       and (assignment_end_date is null or assignment_end_date >= p_week_start)),
    '{}'::uuid[]
  ) || coalesce(p_driver_ids, '{}'::uuid[]);
  select coalesce(array_agg(distinct driver_id order by driver_id), '{}'::uuid[])
    into v_relevant from unnest(v_relevant) as relevant(driver_id)
    where driver_id is not null;
  perform 1 from public.drivers
  where organization_id = p_organization_id and id = any(v_relevant)
  order by id for update;
  return public.replace_order_period_week_members_unchecked(
    p_organization_id, p_order_period_template_id, p_week_start, p_week_end, p_driver_ids
  );
end;
$$;

alter function public.approve_order_shift_change_request(uuid, text)
  rename to approve_order_shift_change_request_unchecked;
create or replace function public.approve_order_shift_change_request(
  p_request_id uuid, p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.driver_order_shift_change_requests%rowtype;
begin
  select * into v_request from public.driver_order_shift_change_requests where id = p_request_id;
  if found then
    perform 1 from public.drivers where id = v_request.driver_id and organization_id = v_request.organization_id for update;
  end if;
  return public.approve_order_shift_change_request_unchecked(p_request_id, p_review_note);
end;
$$;

create or replace function public.update_driver_record_v2(
  p_actor_user_id uuid, p_driver_id uuid, p_organization_id uuid, p_full_name text,
  p_nationality text, p_mobile_number text, p_vehicle_type public.driver_vehicle_type,
  p_vehicle_number text, p_keeta_username text, p_keeta_driver_id text,
  p_is_company_sponsored boolean, p_is_vehicle_owner boolean,
  p_settlement_type public.driver_settlement_type, p_iqama_number text,
  p_iqama_expiry_date date, p_driving_license_number text,
  p_driving_license_expiry_date date, p_driver_card_number text,
  p_driver_card_expiry_date date, p_iban text, p_bank_name text,
  p_account_number text, p_documents jsonb default '[]'::jsonb,
  p_vehicle_id uuid default null::uuid, p_nfc_number text default null::text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_existing public.drivers%rowtype;
  v_before jsonb;
  v_full_name text;
  v_nationality text;
  v_mobile_number text;
  v_vehicle_number text;
  v_keeta_username text;
  v_keeta_driver_id text;
  v_iqama_number text;
  v_driving_license_number text;
  v_driver_card_number text;
  v_nfc_number text;
  v_iban text;
  v_bank_name text;
  v_account_number text;
  v_document jsonb;
  v_document_type public.driver_document_type;
  v_replaced_documents jsonb := '[]'::jsonb;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);
  select * into v_existing from public.drivers d
  where d.id = p_driver_id and d.organization_id = p_organization_id for update;
  if not found then raise exception 'Driver update failed: driver is unavailable.'; end if;
  if v_existing.deleted_at is not null then raise exception 'Driver update failed: archived driver cannot be updated.'; end if;
  v_before := public.safe_driver_snapshot(p_driver_id);
  v_full_name := btrim(coalesce(p_full_name, ''));
  v_nationality := btrim(coalesce(p_nationality, ''));
  v_mobile_number := btrim(coalesce(p_mobile_number, ''));
  v_vehicle_number := btrim(coalesce(p_vehicle_number, ''));
  v_keeta_username := btrim(coalesce(p_keeta_username, ''));
  v_keeta_driver_id := nullif(btrim(coalesce(p_keeta_driver_id, '')), '');
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
  v_driving_license_number := btrim(coalesce(p_driving_license_number, ''));
  v_driver_card_number := btrim(coalesce(p_driver_card_number, ''));
  v_nfc_number := nullif(btrim(coalesce(p_nfc_number, '')), '');
  v_iban := nullif(public.normalize_driver_iban(p_iban), '');
  v_bank_name := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_account_number := nullif(btrim(coalesce(p_account_number, '')), '');
  if p_vehicle_id is not null then
    select fv.plate_number into v_vehicle_number from public.fleet_vehicles fv
    where fv.id = p_vehicle_id and fv.assigned_organization_id = p_organization_id and fv.archived_at is null;
    if not found then raise exception 'Driver update failed: invalid fleet vehicle.'; end if;
  end if;
  if v_full_name = '' or length(v_full_name) > 160 then raise exception 'Driver update failed: invalid full name.'; end if;
  if v_nationality = '' or length(v_nationality) > 80 then raise exception 'Driver update failed: invalid nationality.'; end if;
  if v_mobile_number = '' or length(v_mobile_number) > 40 then raise exception 'Driver update failed: invalid mobile number.'; end if;
  if p_vehicle_type not in ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) then raise exception 'Driver update failed: invalid vehicle type.'; end if;
  if length(v_vehicle_number) > 80 then raise exception 'Driver update failed: invalid vehicle plate number.'; end if;
  if v_keeta_username = '' or length(v_keeta_username) > 120 then raise exception 'Driver update failed: invalid Keeta username.'; end if;
  if v_keeta_driver_id is not null and length(v_keeta_driver_id) > 120 then raise exception 'Driver update failed: invalid Keeta driver id.'; end if;
  if p_is_company_sponsored is null then raise exception 'Driver update failed: invalid sponsorship value.'; end if;
  if p_is_vehicle_owner is null then raise exception 'Driver update failed: invalid vehicle ownership value.'; end if;
  if p_settlement_type is null or p_settlement_type not in ('tiers'::public.driver_settlement_type, 'per_order'::public.driver_settlement_type) then
    raise exception 'Driver update failed: invalid settlement type.';
  end if;
  if v_iqama_number = '' or length(v_iqama_number) > 40 then raise exception 'Driver update failed: invalid iqama number.'; end if;
  if p_iqama_expiry_date is null then raise exception 'Driver update failed: invalid iqama expiry date.'; end if;
  if v_driving_license_number = '' or length(v_driving_license_number) > 60 then raise exception 'Driver update failed: invalid driving license number.'; end if;
  if p_driving_license_expiry_date is null then raise exception 'Driver update failed: invalid driving license expiry date.'; end if;
  if v_driver_card_number = '' or length(v_driver_card_number) > 60 then raise exception 'Driver update failed: invalid driver card number.'; end if;
  if p_driver_card_expiry_date is null then raise exception 'Driver update failed: invalid driver card expiry date.'; end if;
  if v_nfc_number is not null and length(v_nfc_number) > 80 then raise exception 'Driver update failed: invalid NFC number.'; end if;
  if v_iban is not null and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then raise exception 'Driver update failed: invalid IBAN.'; end if;
  if v_bank_name is not null and length(v_bank_name) > 120 then raise exception 'Driver update failed: invalid bank name.'; end if;
  if v_account_number is not null and length(v_account_number) > 60 then raise exception 'Driver update failed: invalid account number.'; end if;
  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' then raise exception 'Driver update failed: documents must be an array.'; end if;
  update public.drivers set
    full_name = v_full_name, nationality = v_nationality, mobile_number = v_mobile_number,
    vehicle_type = p_vehicle_type, vehicle_id = p_vehicle_id, vehicle_number = v_vehicle_number,
    keeta_username = v_keeta_username, keeta_driver_id = v_keeta_driver_id,
    is_company_sponsored = p_is_company_sponsored, is_vehicle_owner = p_is_vehicle_owner,
    settlement_type = p_settlement_type, iqama_number = v_iqama_number,
    iqama_expiry_date = p_iqama_expiry_date, driving_license_number = v_driving_license_number,
    driving_license_expiry_date = p_driving_license_expiry_date,
    driver_card_number = v_driver_card_number, driver_card_expiry_date = p_driver_card_expiry_date,
    nfc_number = v_nfc_number, updated_by_user_id = p_actor_user_id, updated_at = now()
  where id = p_driver_id;
  insert into public.driver_bank_details (driver_id, iban, bank_name, account_number)
  values (p_driver_id, v_iban, v_bank_name, v_account_number)
  on conflict (driver_id) do update set iban = excluded.iban, bank_name = excluded.bank_name,
    account_number = excluded.account_number, updated_at = now();
  for v_document in select value from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb)) loop
    perform public.validate_driver_document_item(v_document);
    v_document_type := (v_document ->> 'document_type')::public.driver_document_type;
    insert into public.driver_documents (driver_id, document_type, storage_path, original_filename, mime_type, size_bytes)
    values (p_driver_id, v_document_type, btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'), btrim(v_document ->> 'mime_type'),
      (v_document ->> 'size_bytes')::bigint)
    on conflict (driver_id, document_type) do update set storage_path = excluded.storage_path,
      original_filename = excluded.original_filename, mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes, updated_at = now();
    v_replaced_documents := v_replaced_documents || jsonb_build_array(v_document_type);
  end loop;
  insert into public.activity_logs (actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, p_organization_id, 'driver_updated', 'driver', p_driver_id, v_before,
    public.safe_driver_snapshot(p_driver_id) || jsonb_build_object('replaced_documents', v_replaced_documents));
end;
$function$;

revoke all on function public.update_driver_record_v2 from public;
grant execute on function public.update_driver_record_v2 to authenticated, service_role;

revoke all on function public.move_organization_shift_driver_unchecked(uuid, uuid, uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.move_order_period_driver_unchecked(uuid, uuid, uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.replace_order_period_week_members_unchecked(uuid, uuid, date, date, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.approve_order_shift_change_request_unchecked(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.move_order_period_driver(uuid, uuid, uuid, uuid, date, date)
  to authenticated, service_role;
grant execute on function public.replace_order_period_week_members(uuid, uuid, date, date, uuid[])
  to authenticated, service_role;
grant execute on function public.approve_order_shift_change_request(uuid, text)
  to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
