-- Fix the create-request audit insert column/value mismatch.
-- No business rows are written while applying this migration.

begin;

create or replace function public.create_my_order_shift_change_request(
  p_requested_order_period_template_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_current_template_id uuid;
  v_requested_template public.organization_order_period_templates%rowtype;
  v_current_count integer;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday smallint := extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint;
  v_target_week date := public.get_order_shift_change_target_week_start(now());
  v_allowed smallint[] := '{}'::smallint[];
  v_request_id uuid;
  v_driver_count integer;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_AUTH_REQUIRED');
  end if;
  if p_reason is not null and length(p_reason) > 2000 then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REASON_TOO_LONG');
  end if;

  select count(*) into v_driver_count
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id and p.id = v_actor_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if v_driver_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_DRIVERS';
  end if;
  select d.* into v_driver
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id and p.id = v_actor_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND');
  end if;

  select * into v_driver
  from public.drivers d
  where d.id = v_driver.id and d.organization_id = v_driver.organization_id
  for update;
  if not found or v_driver.status <> 'active'::public.driver_status
     or v_driver.deleted_at is not null
     or v_driver.settlement_type <> 'per_order'::public.driver_settlement_type then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND');
  end if;

  perform 1 from public.organization_order_period_assignments
  where organization_id = v_driver.organization_id and driver_id = v_driver.id and is_active
  order by id for update;

  select coalesce(s.allowed_weekdays, '{}'::smallint[]) into v_allowed
  from public.organization_order_shift_change_settings s
  where s.organization_id = v_driver.organization_id;
  if not (v_allowed @> array[v_weekday]::smallint[]) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED');
  end if;

  select count(*)
    into v_current_count
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id
    and a.is_active and v_today >= a.assignment_start_date
    and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
    and t.is_active and t.archived_at is null;
  if v_current_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_CURRENT_ASSIGNMENTS';
  end if;
  if v_current_count = 1 then
    select a.order_period_template_id
      into v_current_template_id
    from public.organization_order_period_assignments a
    join public.organization_order_period_templates t
      on t.id = a.order_period_template_id and t.organization_id = a.organization_id
    where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id
      and a.is_active and v_today >= a.assignment_start_date
      and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
      and t.is_active and t.archived_at is null
    order by a.assignment_start_date desc, a.id desc
    limit 1;
  end if;
  if v_current_template_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT');
  end if;
  if p_requested_order_period_template_id = v_current_template_id then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TEMPLATE_UNCHANGED');
  end if;

  select * into v_requested_template
  from public.organization_order_period_templates
  where id = p_requested_order_period_template_id and organization_id = v_driver.organization_id;
  if not found or not v_requested_template.is_active or v_requested_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TEMPLATE_INVALID');
  end if;

  if exists (
    select 1 from public.driver_order_shift_change_requests r
    where r.driver_id = v_driver.id and r.requested_week_start_date = v_target_week
      and r.status in ('pending', 'approved')
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TARGET_ALREADY_REQUESTED');
  end if;

  insert into public.driver_order_shift_change_requests (
    organization_id, driver_id, current_order_period_template_id,
    requested_order_period_template_id, requested_week_start_date, reason
  ) values (
    v_driver.organization_id, v_driver.id, v_current_template_id,
    p_requested_order_period_template_id, v_target_week, nullif(btrim(p_reason), '')
  ) returning id into v_request_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, v_driver.organization_id, 'order_shift_change_request_created',
    'driver_order_shift_change_request', v_request_id,
    jsonb_build_object('driver_id', v_driver.id,
      'current_order_period_template_id', v_current_template_id,
      'requested_order_period_template_id', p_requested_order_period_template_id,
      'requested_week_start_date', v_target_week, 'reason', nullif(btrim(p_reason), '')),
    jsonb_build_object('organization_id', v_driver.organization_id),
    jsonb_build_object('driver_id', v_driver.id,
      'requested_week_start_date', v_target_week)
  );
  return jsonb_build_object('success', true, 'request_id', v_request_id,
    'target_week_start', v_target_week);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TARGET_ALREADY_REQUESTED');
end;
$$;

revoke all on function public.create_my_order_shift_change_request(uuid, text) from public, anon;
grant execute on function public.create_my_order_shift_change_request(uuid, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
