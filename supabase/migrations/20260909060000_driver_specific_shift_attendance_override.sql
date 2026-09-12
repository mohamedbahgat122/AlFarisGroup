-- Phase 2.1: make manual attendance opening driver-specific.
-- 20260909050000 is deployed and is intentionally not edited.

alter table public.drivers
  add constraint drivers_organization_id_id_key unique (organization_id, id);

alter table public.organization_shift_attendance_overrides
  add column if not exists driver_id uuid null;

alter table public.organization_shift_attendance_overrides
  add constraint organization_shift_attendance_overrides_driver_org_fk
  foreign key (organization_id, driver_id)
  references public.drivers(organization_id, id)
  on delete restrict;

alter table public.organization_shift_attendance_overrides
  drop constraint if exists organization_shift_attendance_overrides_unique_date;

create unique index if not exists organization_shift_attendance_overrides_legacy_unique
  on public.organization_shift_attendance_overrides (
    organization_id, shift_template_id, scheduled_business_date
  ) where driver_id is null;

create unique index if not exists organization_shift_attendance_overrides_driver_unique
  on public.organization_shift_attendance_overrides (
    organization_id, shift_template_id, driver_id, scheduled_business_date
  ) where driver_id is not null;

create index if not exists organization_shift_attendance_overrides_driver_active_idx
  on public.organization_shift_attendance_overrides (
    organization_id, shift_template_id, driver_id, scheduled_business_date, override_expires_at
  );

-- The old RPC is intentionally no longer callable by authenticated Admins:
-- its contract can only create a shift-wide override.
revoke execute on function public.open_shift_attendance_start_now(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.open_driver_shift_attendance_start_now(
  p_organization_id uuid,
  p_shift_template_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_template public.organization_shift_templates%rowtype;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_occurrence record;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    raise exception 'SHIFT_OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;

  select d.* into v_driver
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'tiers'::public.driver_settlement_type
  for update;

  if not found then
    raise exception 'SHIFT_DRIVER_NOT_ELIGIBLE' using errcode = '22023';
  end if;

  select t.* into v_template
  from public.organization_shift_templates t
  where t.id = p_shift_template_id
    and t.organization_id = p_organization_id
    and t.is_active = true
    and t.archived_at is null
  for update;

  if not found then
    raise exception 'SHIFT_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_occurrence
  from public.resolve_shift_attendance_occurrence(
    p_organization_id, p_shift_template_id, p_driver_id
  );

  if not found then
    raise exception 'SHIFT_DRIVER_NOT_ASSIGNED' using errcode = '22023';
  end if;

  select p.* into v_policy
  from public.organization_shift_attendance_policies p
  where p.organization_id = p_organization_id
    and p.shift_template_id = p_shift_template_id
  for update;

  if not found
     or v_policy.start_open_before_minutes is null
     or v_policy.minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  if v_now >= v_occurrence.scheduled_start_at then
    return jsonb_build_object(
      'status', 'already_in_window',
      'server_now', v_now,
      'scheduled_business_date', v_occurrence.scheduled_business_date,
      'scheduled_start_at', v_occurrence.scheduled_start_at,
      'driver_id', p_driver_id,
      'override_created', false
    );
  end if;

  insert into public.organization_shift_attendance_overrides (
    organization_id,
    shift_template_id,
    driver_id,
    scheduled_business_date,
    override_opened_at,
    override_expires_at,
    opened_by
  ) values (
    p_organization_id,
    p_shift_template_id,
    p_driver_id,
    v_occurrence.scheduled_business_date,
    v_now,
    v_occurrence.scheduled_start_at,
    v_actor_id
  )
  on conflict (organization_id, shift_template_id, driver_id, scheduled_business_date)
    where driver_id is not null
  do update set
    override_opened_at = excluded.override_opened_at,
    override_expires_at = excluded.override_expires_at,
    opened_by = excluded.opened_by
  returning * into v_override;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id,
    p_organization_id,
    'driver_shift_attendance_start_opened_manually',
    'organization_shift_attendance_override',
    v_override.id,
    jsonb_build_object(
      'shift_template_id', v_override.shift_template_id,
      'driver_id', v_override.driver_id,
      'scheduled_business_date', v_override.scheduled_business_date,
      'override_opened_at', v_override.override_opened_at,
      'override_expires_at', v_override.override_expires_at
    ),
    jsonb_build_object('source', 'shift_attendance_control')
  );

  return jsonb_build_object(
    'status', 'opened',
    'server_now', v_now,
    'driver_id', p_driver_id,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'override_opened_at', v_override.override_opened_at,
    'override_expires_at', v_override.override_expires_at,
    'override_created', true
  );
end;
$$;

-- Driver context and Start must filter by the authenticated driver. Legacy
-- shift-wide rows remain historical data and are deliberately ignored.
create or replace function public.get_driver_shift_attendance_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_template public.organization_shift_templates%rowtype;
  v_assignment public.organization_shift_assignments%rowtype;
  v_occurrence record;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_open_shift public.driver_shifts%rowtype;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_now timestamptz := now();
  v_start_available_at timestamptz;
  v_end_available_at timestamptz;
  v_override_active boolean := false;
  v_policy_configured boolean := false;
  v_has_occurrence boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status and p.deleted_at is null
      and p.must_change_password = false
  ) then raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501'; end if;

  select d.* into v_driver from public.drivers d
  where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status
    and d.deleted_at is null;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;

  for v_assignment in
    select a.* from public.organization_shift_assignments a
    where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id
      and a.is_active = true
    order by a.assignment_start_date desc nulls last, a.created_at asc
  loop
    select t.* into v_template from public.organization_shift_templates t
    where t.id = v_assignment.shift_template_id and t.organization_id = v_assignment.organization_id
      and t.is_active = true and t.archived_at is null;
    if found then
      select * into v_occurrence from public.resolve_shift_attendance_occurrence(
        v_driver.organization_id, v_template.id, v_driver.id
      );
      if found then v_has_occurrence := true; exit; end if;
    end if;
  end loop;

  if not v_has_occurrence then
    return jsonb_build_object('success', true, 'server_now', v_now,
      'policy_configured', false, 'state', 'no_current_assignment',
      'reason_code', 'SHIFT_NO_CURRENT_ASSIGNMENT');
  end if;

  select p.* into v_policy from public.organization_shift_attendance_policies p
  where p.organization_id = v_driver.organization_id and p.shift_template_id = v_template.id;
  v_policy_configured := found and v_policy.start_open_before_minutes is not null
    and v_policy.minimum_work_minutes is not null;
  if v_policy_configured then
    v_start_available_at := v_occurrence.scheduled_start_at
      - make_interval(mins => v_policy.start_open_before_minutes);
  end if;

  select o.* into v_override from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id and o.shift_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now and o.override_expires_at > v_now;
  v_override_active := found;

  select ds.* into v_open_shift from public.driver_shifts ds
  where ds.driver_id = v_driver.id and ds.status = 'open'
  order by ds.started_at desc limit 1;
  if found and v_open_shift.applied_minimum_work_minutes is not null then
    v_end_available_at := v_open_shift.started_at
      + make_interval(mins => v_open_shift.applied_minimum_work_minutes);
  end if;

  return jsonb_build_object(
    'success', true, 'server_now', v_now, 'shift_template_id', v_template.id,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'scheduled_end_at', v_occurrence.scheduled_end_at,
    'policy_configured', v_policy_configured,
    'start_open_before_minutes', case when v_policy_configured then v_policy.start_open_before_minutes else null end,
    'start_available_at', v_start_available_at, 'start_override_active', v_override_active,
    'can_start_now', v_policy_configured and v_open_shift.id is null
      and (v_override_active or v_now >= v_start_available_at),
    'actual_started_at', case when v_open_shift.id is null then null else v_open_shift.started_at end,
    'minimum_work_minutes', case when v_policy_configured then v_policy.minimum_work_minutes else null end,
    'end_available_at', v_end_available_at,
    'can_end_now', v_open_shift.id is not null and (
      (v_open_shift.attendance_control_version is null and v_open_shift.shift_template_id is null
       and v_open_shift.scheduled_business_date is null and v_open_shift.applied_start_open_before_minutes is null
       and v_open_shift.applied_minimum_work_minutes is null)
      or (v_end_available_at is not null and v_now >= v_end_available_at)
    ),
    'state', case
      when v_open_shift.id is not null and v_open_shift.attendance_control_version is null
       and v_open_shift.shift_template_id is null and v_open_shift.scheduled_business_date is null
       and v_open_shift.applied_start_open_before_minutes is null
       and v_open_shift.applied_minimum_work_minutes is null then 'legacy_open'
      when v_open_shift.id is not null then 'open'
      when not v_policy_configured then 'unconfigured'
      when v_override_active or v_now >= v_start_available_at then 'start_available'
      else 'waiting_for_start_window' end,
    'reason_code', case
      when v_open_shift.id is not null and v_open_shift.attendance_control_version is null
       and v_open_shift.shift_template_id is null and v_open_shift.scheduled_business_date is null
       and v_open_shift.applied_start_open_before_minutes is null
       and v_open_shift.applied_minimum_work_minutes is null then 'SHIFT_LEGACY_OPEN_SESSION'
      when not v_policy_configured then 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED'
      when v_open_shift.id is null and not (v_override_active or v_now >= v_start_available_at)
        then 'SHIFT_START_WINDOW_NOT_OPEN' else null end
  );
end;
$$;

create or replace function public.start_driver_shift(
  p_odometer_reading bigint, p_photo_path text, p_photo_captured_at timestamptz
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
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647
    then raise exception 'SHIFT_INVALID_READING' using errcode = '22023'; end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id)
    then raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false)
    then raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501'; end if;
  select d.* into v_driver from public.drivers d where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status and d.deleted_at is null;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;

  for v_assignment in select a.* from public.organization_shift_assignments a
    where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id
      and a.is_active = true
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
  if not found or v_policy.start_open_before_minutes is null or v_policy.minimum_work_minutes is null
    then raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023'; end if;
  v_start_available_at := v_occurrence.scheduled_start_at
    - make_interval(mins => v_policy.start_open_before_minutes);
  select o.* into v_override from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id and o.shift_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now and o.override_expires_at > v_now for update;
  if v_now < v_start_available_at and not found
    then raise exception 'SHIFT_START_WINDOW_NOT_OPEN' using errcode = '42501'; end if;

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

revoke all on function public.open_driver_shift_attendance_start_now(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.open_driver_shift_attendance_start_now(uuid, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
