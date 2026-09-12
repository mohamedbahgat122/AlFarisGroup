-- Restore the UUID-safe current-assignment selection after 09140000.
-- This replaces only the request-window read RPC; it does not mutate business data.

begin;

create or replace function public.get_my_order_shift_change_request_window()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver_id uuid;
  v_organization_id uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday smallint := extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint;
  v_target_week date := public.get_order_shift_change_target_week_start(now());
  v_allowed smallint[] := '{}'::smallint[];
  v_current_template_id uuid;
  v_driver_count integer;
  v_current_count integer;
  v_pending boolean := false;
  v_templates jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'reason_code', 'ORDER_SHIFT_CHANGE_AUTH_REQUIRED');
  end if;

  select count(*) into v_driver_count
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor and p.id = v_actor
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if v_driver_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_DRIVERS';
  end if;

  select d.id, d.organization_id into v_driver_id, v_organization_id
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor and p.id = v_actor
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;

  if v_driver_id is null then
    return jsonb_build_object(
      'success', true, 'today_riyadh', v_today, 'weekday_riyadh', v_weekday,
      'allowed_weekdays', v_allowed, 'can_submit_today', false,
      'target_week_start', v_target_week, 'has_pending_request', false,
      'reason_code', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND', 'templates', v_templates
    );
  end if;

  select coalesce(s.allowed_weekdays, '{}'::smallint[])
    into v_allowed
  from public.organization_order_shift_change_settings s
  where s.organization_id = v_organization_id;

  select count(*) into v_current_count
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_organization_id and a.driver_id = v_driver_id
    and a.is_active
    and v_today >= a.assignment_start_date
    and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
    and t.is_active and t.archived_at is null and t.is_published;

  if v_current_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_CURRENT_ASSIGNMENTS';
  end if;

  if v_current_count = 1 then
    select a.order_period_template_id into v_current_template_id
    from public.organization_order_period_assignments a
    join public.organization_order_period_templates t
      on t.id = a.order_period_template_id and t.organization_id = a.organization_id
    where a.organization_id = v_organization_id and a.driver_id = v_driver_id
      and a.is_active
      and v_today >= a.assignment_start_date
      and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
      and t.is_active and t.archived_at is null and t.is_published
    order by a.assignment_start_date desc, a.id desc
    limit 1;
  end if;

  select exists(
    select 1
    from public.driver_order_shift_change_requests r
    where r.driver_id = v_driver_id
      and r.requested_week_start_date = v_target_week
      and r.status = 'pending'
  ) into v_pending;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'start_time', t.start_time,
      'end_time', t.end_time, 'crosses_midnight', t.crosses_midnight
    ) order by t.start_time, t.id), '[]'::jsonb)
    into v_templates
  from public.organization_order_period_templates t
  where t.organization_id = v_organization_id
    and t.is_active and t.archived_at is null
    and t.is_published and t.id <> v_current_template_id;

  return jsonb_build_object(
    'success', true, 'today_riyadh', v_today, 'weekday_riyadh', v_weekday,
    'allowed_weekdays', v_allowed,
    'can_submit_today', v_allowed @> array[v_weekday]::smallint[]
      and not v_pending and v_current_template_id is not null,
    'target_week_start', v_target_week, 'has_pending_request', v_pending,
    'reason_code', case
      when v_current_template_id is null then 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT'
      when not (v_allowed @> array[v_weekday]::smallint[]) then 'ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED'
      when v_pending then 'ORDER_SHIFT_CHANGE_PENDING_REQUEST_EXISTS'
      else null
    end,
    'templates', v_templates
  );
end;
$$;

revoke all on function public.get_my_order_shift_change_request_window() from public, anon;
grant execute on function public.get_my_order_shift_change_request_window() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
