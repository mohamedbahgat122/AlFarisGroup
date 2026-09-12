-- Reuse driver_shifts for per-order attendance without changing historical rows.

begin;

alter table public.driver_shifts
  add column if not exists order_period_template_id uuid null;

alter table public.driver_shifts
  add constraint driver_shifts_order_period_template_org_fk
    foreign key (order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id)
    on delete restrict;

alter table public.driver_shifts
  drop constraint if exists driver_shifts_attendance_snapshot_shape;
alter table public.driver_shifts
  add constraint driver_shifts_attendance_snapshot_shape check (
    (
      attendance_control_version is null
      and shift_template_id is null
      and order_period_template_id is null
      and scheduled_business_date is null
      and applied_start_open_before_minutes is null
      and applied_minimum_work_minutes is null
    )
    or (
      attendance_control_version = 1
      and scheduled_business_date is not null
      and applied_start_open_before_minutes is not null
      and applied_minimum_work_minutes is not null
      and ((shift_template_id is not null and order_period_template_id is null)
        or (shift_template_id is null and order_period_template_id is not null))
    )
  );

create index if not exists driver_shifts_order_period_template_idx
  on public.driver_shifts (organization_id, order_period_template_id, scheduled_business_date);

alter table public.organization_order_period_operational_policies
  add column if not exists minimum_work_minutes integer null;
alter table public.organization_order_period_operational_policies
  add constraint organization_order_period_operational_policies_minimum_bounds
    check (minimum_work_minutes is null or minimum_work_minutes between 1 and 1440);

create or replace function public.set_order_period_operational_policy(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_open_before_minutes integer,
  p_close_after_minutes integer,
  p_minimum_work_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_before public.organization_order_period_operational_policies%rowtype;
  v_after public.organization_order_period_operational_policies%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if (p_open_before_minutes is not null and p_open_before_minutes not between 0 and 1440)
     or (p_close_after_minutes is not null and p_close_after_minutes not between 0 and 1440)
     or (p_minimum_work_minutes is not null and p_minimum_work_minutes not between 1 and 1440) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_INVALID');
  end if;
  select * into v_template from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND'); end if;
  select * into v_before from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id for update;
  insert into public.organization_order_period_operational_policies (
    organization_id, order_period_template_id, open_before_minutes, close_after_minutes,
    minimum_work_minutes, created_by, updated_by
  ) values (
    p_organization_id, p_order_period_template_id, p_open_before_minutes, p_close_after_minutes,
    p_minimum_work_minutes, v_actor, v_actor
  ) on conflict (organization_id, order_period_template_id) do update set
    open_before_minutes = excluded.open_before_minutes,
    close_after_minutes = excluded.close_after_minutes,
    minimum_work_minutes = excluded.minimum_work_minutes,
    updated_at = timezone('utc', now()), updated_by = excluded.updated_by
  returning * into v_after;
  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor, p_organization_id, 'order_shift_operational_policy_updated',
    'organization_order_period_operational_policy', v_after.id,
    case when v_before.id is null then null else jsonb_build_object(
      'open_before_minutes', v_before.open_before_minutes,
      'close_after_minutes', v_before.close_after_minutes,
      'minimum_work_minutes', v_before.minimum_work_minutes
    ) end,
    jsonb_build_object(
      'open_before_minutes', v_after.open_before_minutes,
      'close_after_minutes', v_after.close_after_minutes,
      'minimum_work_minutes', v_after.minimum_work_minutes
    ), jsonb_build_object('order_period_template_id', p_order_period_template_id)
  );
  return jsonb_build_object('success', true, 'id', v_after.id,
    'open_before_minutes', v_after.open_before_minutes,
    'close_after_minutes', v_after.close_after_minutes,
    'minimum_work_minutes', v_after.minimum_work_minutes);
end;
$$;

-- Preserve the old signature for older Admin clients while retaining the
-- currently configured minimum duration.
create or replace function public.set_order_period_operational_policy(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_open_before_minutes integer,
  p_close_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_minimum integer;
begin
  select minimum_work_minutes into v_minimum
  from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id;
  return public.set_order_period_operational_policy(
    p_organization_id, p_order_period_template_id, p_open_before_minutes,
    p_close_after_minutes, v_minimum
  );
end;
$$;

create or replace function public.start_driver_order_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_locked_driver public.drivers%rowtype;
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
  select d.* into v_driver from public.drivers d join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status
    and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;

  -- Order lock order: template, policy, driver, assignments, override.
  -- This matches the deployed Order mutation paths and prevents assignment
  -- and lifecycle changes from racing the final eligibility decision.
  select a.order_period_template_id into v_selected_template_id
  from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
    and a.assignment_start_date <= v_today
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.id desc limit 1;

  if not found then
    raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501';
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = v_selected_template_id and organization_id = v_driver.organization_id
  for update;
  if not found then
    raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501';
  end if;

  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = v_driver.organization_id and order_period_template_id = v_template.id for update;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null
     or v_policy.minimum_work_minutes is null then
    raise exception 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  select d.* into v_locked_driver
  from public.drivers d
  where d.id = v_driver.id and d.auth_user_id = v_user_id
  for update;
  if not found or v_locked_driver.organization_id <> v_driver.organization_id
     or v_locked_driver.status <> 'active'::public.driver_status
     or v_locked_driver.deleted_at is not null
     or v_locked_driver.settlement_type <> 'per_order'::public.driver_settlement_type then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;
  v_driver := v_locked_driver;

  perform 1 from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
  order by a.id for update;

  select * into v_assignment
  from public.organization_order_period_assignments a
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
  where ds.driver_id = v_driver.id and ds.status = 'open' order by ds.started_at desc limit 1 for update;
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

  delete from public.organization_order_period_open_overrides
  where id = v_override.id;
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

create or replace function public.get_my_current_order_shift_operational_context()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_open_shift public.driver_shifts%rowtype;
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
  v_override public.organization_order_period_open_overrides%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now timestamptz := now();
  v_end_available_at timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'state', 'no_assignment', 'reason_code', 'AUTH_REQUIRED');
  end if;

  select d.* into v_driver
  from public.drivers d
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_user and d.status = 'active'::public.driver_status
    and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false;
  if not found then
    return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_DRIVER_NOT_FOUND');
  end if;

  select ds.* into v_open_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
    and ds.order_period_template_id is not null and ds.shift_template_id is null
  order by ds.started_at desc limit 1;
  if found then
    select t.* into v_template
    from public.organization_order_period_templates t
    where t.id = v_open_shift.order_period_template_id
      and t.organization_id = v_open_shift.organization_id;
    v_end_available_at := v_open_shift.started_at
      + make_interval(mins => v_open_shift.applied_minimum_work_minutes);
    return jsonb_build_object('success', true,
      'state', case when v_now >= v_end_available_at then 'end_available' else 'started_waiting_for_end' end,
      'server_now', v_now, 'template_id', v_open_shift.order_period_template_id,
      'template_name', v_template.name, 'scheduled_business_date', v_open_shift.scheduled_business_date,
      'actual_started_at', v_open_shift.started_at,
      'minimum_work_minutes', v_open_shift.applied_minimum_work_minutes,
      'end_available_at', v_end_available_at,
      'can_end_now', v_now >= v_end_available_at,
      'is_open_now', true, 'manual_override_active', false, 'reason_code', null);
  end if;

  select t.* into v_template
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
    and a.assignment_start_date <= v_today
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.id desc limit 1;
  if not found then
    return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_NO_CURRENT_ASSIGNMENT');
  end if;
  if not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', true, 'state', 'disabled', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_TEMPLATE_DISABLED');
  end if;
  if not v_template.is_published then
    return jsonb_build_object('success', true, 'state', 'unpublished', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_UNPUBLISHED');
  end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = v_driver.organization_id and order_period_template_id = v_template.id;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null
     or v_policy.minimum_work_minutes is null then
    return jsonb_build_object('success', true, 'state', 'policy_unconfigured', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;
  select * into v_occ from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  if not found then
    return jsonb_build_object('success', true, 'state', 'closed', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_CLOSED');
  end if;
  select * into v_override from public.organization_order_period_open_overrides o
  where o.organization_id = v_driver.organization_id and o.order_period_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occ.scheduled_business_date
    and o.opened_at <= v_now and o.expires_at > v_now;
  return jsonb_build_object('success', true,
    'state', case when v_now >= v_occ.opens_at and v_now < v_occ.closes_at then case when found then 'manually_opened' else 'open' end
      when found then 'manually_opened' else 'before_open_window' end,
    'server_now', v_now, 'template_id', v_template.id, 'template_name', v_template.name,
    'scheduled_business_date', v_occ.scheduled_business_date, 'scheduled_start_at', v_occ.scheduled_start_at,
    'scheduled_end_at', v_occ.scheduled_end_at, 'opens_at', v_occ.opens_at, 'closes_at', v_occ.closes_at,
    'is_open_now', (v_now >= v_occ.opens_at and v_now < v_occ.closes_at) or found,
    'manual_override_active', found, 'reason_code', null);
end;
$$;

create or replace function public.end_driver_order_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
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
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status
    and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  select * into v_shift from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
    and ds.order_period_template_id is not null and ds.shift_template_id is null
  order by ds.started_at desc limit 1 for update;
  if not found then raise exception 'SHIFT_NO_OPEN_SHIFT' using errcode = 'P0002'; end if;
  if v_shift.applied_minimum_work_minutes is null then raise exception 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED' using errcode = '22023'; end if;
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

revoke all on function public.set_order_period_operational_policy(uuid,uuid,integer,integer,integer) from public, anon;
revoke all on function public.set_order_period_operational_policy(uuid,uuid,integer,integer) from public, anon;
revoke all on function public.start_driver_order_shift(bigint,text,timestamptz) from public, anon;
revoke all on function public.end_driver_order_shift(bigint,text,timestamptz) from public, anon;
grant execute on function public.set_order_period_operational_policy(uuid,uuid,integer,integer,integer) to authenticated, service_role;
grant execute on function public.set_order_period_operational_policy(uuid,uuid,integer,integer) to authenticated, service_role;
grant execute on function public.start_driver_order_shift(bigint,text,timestamptz) to authenticated;
grant execute on function public.end_driver_order_shift(bigint,text,timestamptz) to authenticated;

commit;
notify pgrst, 'reload schema';
