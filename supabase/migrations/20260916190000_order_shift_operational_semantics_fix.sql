begin;

-- Keep the existing resolver signature for compatibility. In this contract,
-- opens_at is the earliest start and closes_at is only the optional
-- auto-close target; neither field is a late-start deadline.
create or replace function public.resolve_order_period_occurrence(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid default null
)
returns table (
  scheduled_business_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  assignment_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_assignment uuid;
begin
  select * into v_template from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id
    and is_active and archived_at is null and is_published;
  if not found then return; end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id;
  if not found then return; end if;

  -- Resolve an in-progress overnight occurrence first, then today's one.
  for v_date in select v_today - 1 union all select v_today loop
    if v_date = v_today - 1 and not v_template.crosses_midnight then continue; end if;
    v_start := (v_date + v_template.start_time) at time zone 'Asia/Riyadh';
    v_end := (v_date + case when v_template.crosses_midnight then 1 else 0 end + v_template.end_time) at time zone 'Asia/Riyadh';
    if v_date = v_today - 1 and now() > v_end then continue; end if;
    select a.id into v_assignment from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
      and (p_driver_id is null or a.driver_id = p_driver_id) and a.is_active
      and a.assignment_start_date <= v_date and (a.assignment_end_date is null or a.assignment_end_date >= v_date)
    order by a.assignment_start_date desc, a.created_at asc limit 1;
    if found then
      return query select v_date, v_start, v_end,
        v_start - make_interval(mins => coalesce(v_policy.open_before_minutes, 0)),
        case when v_policy.close_after_minutes is null then null
          else v_start + make_interval(mins => v_policy.close_after_minutes) end,
        v_assignment;
      return;
    end if;
  end loop;
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
  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then raise exception 'SHIFT_INVALID_READING' using errcode = '22023'; end if;
  if p_photo_captured_at is null or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status and p.deleted_at is null and p.must_change_password = false) then raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501'; end if;
  select d.* into v_driver from public.drivers d join public.profiles p on p.id = d.auth_user_id where d.auth_user_id = v_user_id and d.status = 'active'::public.driver_status and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status and p.deleted_at is null and p.must_change_password = false;
  if not found then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  select a.order_period_template_id into v_selected_template_id from public.organization_order_period_assignments a where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active and a.assignment_start_date <= v_today and (a.assignment_end_date is null or a.assignment_end_date >= v_today) order by a.assignment_start_date desc, a.id desc limit 1;
  if not found then raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501'; end if;
  select * into v_template from public.organization_order_period_templates where id = v_selected_template_id and organization_id = v_driver.organization_id for update;
  if not found then raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501'; end if;
  select * into v_policy from public.organization_order_period_operational_policies where organization_id = v_driver.organization_id and order_period_template_id = v_template.id for update;
  if not found then raise exception 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED' using errcode = '22023'; end if;
  select d.* into v_locked_driver from public.drivers d where d.id = v_driver.id and d.auth_user_id = v_user_id for update;
  if not found or v_locked_driver.organization_id <> v_driver.organization_id or v_locked_driver.status <> 'active'::public.driver_status or v_locked_driver.deleted_at is not null or v_locked_driver.settlement_type <> 'per_order'::public.driver_settlement_type then raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501'; end if;
  perform 1 from public.organization_order_period_assignments a where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active order by a.id for update;
  select * into v_assignment from public.organization_order_period_assignments a where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active and a.assignment_start_date <= v_today and (a.assignment_end_date is null or a.assignment_end_date >= v_today) order by a.assignment_start_date desc, a.id desc limit 1;
  if not found or v_assignment.order_period_template_id <> v_template.id then raise exception 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED' using errcode = '42501'; end if;
  if not v_template.is_active or v_template.archived_at is not null or not v_template.is_published then raise exception 'ORDER_PERIOD_TEMPLATE_INVALID' using errcode = '42501'; end if;
  select ds.* into v_shift from public.driver_shifts ds where ds.driver_id = v_driver.id and ds.status = 'open' order by ds.started_at desc limit 1 for update;
  if found then raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505'; end if;
  select * into v_occ from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  if not found then raise exception 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE' using errcode = '42501'; end if;
  select * into v_override from public.organization_order_period_open_overrides o where o.organization_id = v_driver.organization_id and o.order_period_template_id = v_template.id and o.driver_id = v_driver.id and o.scheduled_business_date = v_occ.scheduled_business_date and o.opened_at <= v_now and o.expires_at > v_now for update;
  if not found and v_now < v_occ.opens_at then raise exception 'ORDER_PERIOD_START_WINDOW_NOT_OPEN' using errcode = '42501'; end if;
  select fv.* into v_vehicle from public.fleet_vehicles fv where fv.organization_id = v_driver.organization_id and fv.archived_at is null and (fv.assigned_driver_id = v_driver.id or fv.authorized_driver_id = v_driver.id) order by case when fv.assigned_driver_id = v_driver.id then 0 else 1 end, fv.created_at desc limit 1;
  v_plate := coalesce(nullif(v_vehicle.plate_number, ''), nullif(v_driver.keeta_vehicle_plate_number, ''), nullif(v_driver.vehicle_number, ''));
  if v_plate is null then raise exception 'SHIFT_VEHICLE_UNAVAILABLE' using errcode = '22023'; end if;
  insert into public.driver_shifts (driver_id, organization_id, vehicle_id, vehicle_plate_snapshot, status, attendance_control_version, shift_template_id, order_period_template_id, scheduled_business_date, applied_start_open_before_minutes, applied_minimum_work_minutes, started_at, start_odometer_reading, start_photo_path, start_photo_captured_at)
  values (v_driver.id, v_driver.organization_id, v_vehicle.id, v_plate, 'open', 1, null, v_template.id, v_occ.scheduled_business_date, coalesce(v_policy.open_before_minutes, 0), v_policy.minimum_work_minutes, v_now, p_odometer_reading, p_photo_path, p_photo_captured_at) returning * into v_shift;
  delete from public.organization_order_period_open_overrides where id = v_override.id;
  insert into public.activity_logs (actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata) values (v_user_id, v_driver.organization_id, 'driver_order_shift_started', 'driver_shift', v_shift.id, jsonb_build_object('driver_id', v_driver.id, 'order_period_template_id', v_template.id, 'scheduled_business_date', v_shift.scheduled_business_date, 'started_at', v_shift.started_at), jsonb_build_object('source', 'driver_order_odometer'));
  return jsonb_build_object('id', v_shift.id, 'status', v_shift.status, 'started_at', v_shift.started_at, 'start_odometer_reading', v_shift.start_odometer_reading, 'order_period_template_id', v_shift.order_period_template_id, 'scheduled_business_date', v_shift.scheduled_business_date, 'applied_minimum_work_minutes', v_shift.applied_minimum_work_minutes);
exception when unique_violation then raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505';
end;
$$;

create or replace function public.open_driver_order_period_now(p_organization_id uuid, p_order_period_template_id uuid, p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype; v_policy public.organization_order_period_operational_policies%rowtype; v_occ record; v_now timestamptz := now(); v_override_expires_at timestamptz := (((v_now at time zone 'Asia/Riyadh')::date + 1) at time zone 'Asia/Riyadh'); v_existing uuid;
begin
  if v_actor is null or not public.has_organization_permission(v_actor, p_organization_id, 'order_periods.assign') then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id = p_order_period_template_id and organization_id = p_organization_id for update;
  if not found or not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_TEMPLATE_INVALID'); end if;
  if not v_template.is_published then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNPUBLISHED'); end if;
  select * into v_policy from public.organization_order_period_operational_policies where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED'); end if;
  select d.id into v_existing from public.drivers d where d.id = p_driver_id and d.organization_id = p_organization_id and d.status = 'active'::public.driver_status and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_INVALID'); end if;
  perform 1 from public.organization_order_period_assignments a where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id and a.driver_id = p_driver_id and a.is_active and a.assignment_start_date <= (v_now at time zone 'Asia/Riyadh')::date and (a.assignment_end_date is null or a.assignment_end_date >= (v_now at time zone 'Asia/Riyadh')::date) order by a.id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED'); end if;
  select * into v_occ from public.resolve_order_period_occurrence(p_organization_id, p_order_period_template_id, p_driver_id);
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE'); end if;
  if v_now >= v_occ.opens_at then return jsonb_build_object('success', true, 'status', 'already_open', 'scheduled_business_date', v_occ.scheduled_business_date); end if;
  insert into public.organization_order_period_open_overrides (organization_id, order_period_template_id, driver_id, scheduled_business_date, opened_at, expires_at, opened_by) values (p_organization_id, p_order_period_template_id, p_driver_id, v_occ.scheduled_business_date, v_now, v_override_expires_at, v_actor) on conflict (organization_id, order_period_template_id, driver_id, scheduled_business_date) do update set opened_at = excluded.opened_at, expires_at = excluded.expires_at, opened_by = excluded.opened_by, updated_at = timezone('utc', now());
  insert into public.activity_logs (actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata) values (v_actor, p_organization_id, 'order_shift_driver_opened_now', 'organization_order_period_open_override', (select id from public.organization_order_period_open_overrides where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id and driver_id = p_driver_id and scheduled_business_date = v_occ.scheduled_business_date), jsonb_build_object('driver_id', p_driver_id, 'scheduled_business_date', v_occ.scheduled_business_date, 'opened_at', v_now, 'expires_at', v_override_expires_at), jsonb_build_object('order_period_template_id', p_order_period_template_id, 'override_lifetime', 'riyadh_calendar_day_end'));
  return jsonb_build_object('success', true, 'status', 'opened', 'scheduled_business_date', v_occ.scheduled_business_date, 'expires_at', v_override_expires_at);
end;
$$;

create or replace function public.get_my_current_order_shift_operational_context()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid(); v_driver public.drivers%rowtype; v_open_shift public.driver_shifts%rowtype; v_template public.organization_order_period_templates%rowtype; v_policy public.organization_order_period_operational_policies%rowtype; v_occ record; v_override public.organization_order_period_open_overrides%rowtype; v_today date := (now() at time zone 'Asia/Riyadh')::date; v_now timestamptz := now(); v_end_available_at timestamptz;
begin
  if v_user is null then return jsonb_build_object('success', false, 'state', 'no_assignment', 'reason_code', 'AUTH_REQUIRED'); end if;
  select d.* into v_driver from public.drivers d join public.profiles p on p.id = d.auth_user_id where d.auth_user_id = v_user and d.status = 'active'::public.driver_status and d.deleted_at is null and d.settlement_type = 'per_order'::public.driver_settlement_type and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status and p.deleted_at is null and p.must_change_password = false;
  if not found then return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_DRIVER_NOT_FOUND'); end if;
  select ds.* into v_open_shift from public.driver_shifts ds where ds.driver_id = v_driver.id and ds.status = 'open' and ds.order_period_template_id is not null and ds.shift_template_id is null order by ds.started_at desc limit 1;
  if found then
    select t.* into v_template from public.organization_order_period_templates t where t.id = v_open_shift.order_period_template_id and t.organization_id = v_open_shift.organization_id;
    if v_open_shift.applied_minimum_work_minutes is null then return jsonb_build_object('success', true, 'state', 'end_available', 'server_now', v_now, 'template_id', v_open_shift.order_period_template_id, 'template_name', v_template.name, 'scheduled_business_date', v_open_shift.scheduled_business_date, 'actual_started_at', v_open_shift.started_at, 'minimum_work_minutes', null, 'end_available_at', null, 'can_end_now', true, 'is_open_now', true, 'manual_override_active', false, 'reason_code', null); end if;
    v_end_available_at := v_open_shift.started_at + make_interval(mins => v_open_shift.applied_minimum_work_minutes);
    return jsonb_build_object('success', true, 'state', case when v_now >= v_end_available_at then 'end_available' else 'started_waiting_for_end' end, 'server_now', v_now, 'template_id', v_open_shift.order_period_template_id, 'template_name', v_template.name, 'scheduled_business_date', v_open_shift.scheduled_business_date, 'actual_started_at', v_open_shift.started_at, 'minimum_work_minutes', v_open_shift.applied_minimum_work_minutes, 'end_available_at', v_end_available_at, 'can_end_now', v_now >= v_end_available_at, 'is_open_now', true, 'manual_override_active', false, 'reason_code', null);
  end if;
  select t.* into v_template from public.organization_order_period_assignments a join public.organization_order_period_templates t on t.id = a.order_period_template_id and t.organization_id = a.organization_id where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active and a.assignment_start_date <= v_today and (a.assignment_end_date is null or a.assignment_end_date >= v_today) order by a.assignment_start_date desc, a.id desc limit 1;
  if not found then return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_NO_CURRENT_ASSIGNMENT'); end if;
  if not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success', true, 'state', 'disabled', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_TEMPLATE_DISABLED'); end if;
  if not v_template.is_published then return jsonb_build_object('success', true, 'state', 'unpublished', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_UNPUBLISHED'); end if;
  select * into v_policy from public.organization_order_period_operational_policies where organization_id = v_driver.organization_id and order_period_template_id = v_template.id;
  if not found then return jsonb_build_object('success', true, 'state', 'policy_unconfigured', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED'); end if;
  select * into v_occ from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  if not found then return jsonb_build_object('success', true, 'state', 'closed', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_CLOSED'); end if;
  select * into v_override from public.organization_order_period_open_overrides o where o.organization_id = v_driver.organization_id and o.order_period_template_id = v_template.id and o.driver_id = v_driver.id and o.scheduled_business_date = v_occ.scheduled_business_date and o.opened_at <= v_now and o.expires_at > v_now;
  return jsonb_build_object('success', true, 'state', case when v_now >= v_occ.opens_at or found then 'open' else 'before_open_window' end, 'server_now', v_now, 'template_id', v_template.id, 'template_name', v_template.name, 'scheduled_business_date', v_occ.scheduled_business_date, 'scheduled_start_at', v_occ.scheduled_start_at, 'scheduled_end_at', v_occ.scheduled_end_at, 'opens_at', v_occ.opens_at, 'closes_at', v_occ.closes_at, 'earliest_start_at', v_occ.opens_at, 'auto_close_at', v_occ.closes_at, 'is_open_now', v_now >= v_occ.opens_at or found, 'manual_override_active', found, 'reason_code', null);
end;
$$;

revoke all on function public.resolve_order_period_occurrence(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_driver_order_shift(bigint, text, timestamptz) from public, anon;
revoke all on function public.open_driver_order_period_now(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_my_current_order_shift_operational_context() from public, anon;
grant execute on function public.start_driver_order_shift(bigint, text, timestamptz) to authenticated;
grant execute on function public.open_driver_order_period_now(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_current_order_shift_operational_context() to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
