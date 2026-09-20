begin;

create or replace function public.get_my_current_order_shift_operational_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_open_shift public.driver_shifts%rowtype;
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
  v_override public.organization_order_period_open_overrides%rowtype;
  v_next_template public.organization_order_period_templates%rowtype;
  v_next_policy public.organization_order_period_operational_policies%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now timestamptz := now();
  v_scheduled_end_at timestamptz;
  v_end_available_at timestamptz;
  v_next_date date;
  v_next_start_at timestamptz;
  v_next_end_at timestamptz;
  v_next_opens_at timestamptz;
  v_search_end date;
  v_next_found boolean := false;
  v_has_attendance boolean := false;
  v_current_occurrence_found boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'state', 'no_assignment', 'reason_code', 'AUTH_REQUIRED');
  end if;

  select d.* into v_driver
  from public.drivers d
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_user
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null
    and p.must_change_password = false;
  if not found then
    return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_DRIVER_NOT_FOUND');
  end if;

  select ds.* into v_open_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open'
    and ds.order_period_template_id is not null
    and ds.shift_template_id is null
  order by ds.started_at desc
  limit 1;
  if found then
    select t.* into v_template
    from public.organization_order_period_templates t
    where t.id = v_open_shift.order_period_template_id
      and t.organization_id = v_open_shift.organization_id;
    if v_open_shift.applied_end_before_minutes is not null and v_template.id is not null then
      v_scheduled_end_at := (v_open_shift.scheduled_business_date + case when v_template.crosses_midnight then 1 else 0 end + v_template.end_time) at time zone 'Asia/Riyadh';
      v_end_available_at := v_scheduled_end_at - make_interval(mins => v_open_shift.applied_end_before_minutes);
      return jsonb_build_object('success', true, 'state', case when v_now >= v_end_available_at then 'end_available' else 'started_waiting_for_end' end, 'server_now', v_now, 'template_id', v_open_shift.order_period_template_id, 'template_name', v_template.name, 'scheduled_business_date', v_open_shift.scheduled_business_date, 'scheduled_end_at', v_scheduled_end_at, 'actual_started_at', v_open_shift.started_at, 'applied_end_before_minutes', v_open_shift.applied_end_before_minutes, 'minimum_work_minutes', null, 'end_available_at', v_end_available_at, 'can_end_now', v_now >= v_end_available_at, 'is_open_now', true, 'manual_override_active', false, 'reason_code', null);
    end if;
    if v_open_shift.applied_minimum_work_minutes is not null then
      v_end_available_at := v_open_shift.started_at + make_interval(mins => v_open_shift.applied_minimum_work_minutes);
      return jsonb_build_object('success', true, 'state', case when v_now >= v_end_available_at then 'end_available' else 'started_waiting_for_end' end, 'server_now', v_now, 'template_id', v_open_shift.order_period_template_id, 'template_name', v_template.name, 'scheduled_business_date', v_open_shift.scheduled_business_date, 'actual_started_at', v_open_shift.started_at, 'applied_end_before_minutes', null, 'minimum_work_minutes', v_open_shift.applied_minimum_work_minutes, 'end_available_at', v_end_available_at, 'can_end_now', v_now >= v_end_available_at, 'is_open_now', true, 'manual_override_active', false, 'reason_code', null);
    end if;
    return jsonb_build_object('success', true, 'state', 'end_unconfigured', 'server_now', v_now, 'template_id', v_open_shift.order_period_template_id, 'template_name', v_template.name, 'actual_started_at', v_open_shift.started_at, 'applied_end_before_minutes', null, 'minimum_work_minutes', null, 'end_available_at', null, 'can_end_now', false, 'is_open_now', true, 'manual_override_active', false, 'reason_code', 'ORDER_PERIOD_END_POLICY_UNCONFIGURED');
  end if;

  select t.* into v_template
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id
   and t.organization_id = a.organization_id
  where a.organization_id = v_driver.organization_id
    and a.driver_id = v_driver.id
    and a.is_active
    and a.assignment_start_date <= v_today
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.created_at asc
  limit 1;
  if not found then
    return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_NO_CURRENT_ASSIGNMENT');
  end if;
  if not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', true, 'state', 'disabled', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_TEMPLATE_DISABLED');
  end if;
  if not v_template.is_published then
    return jsonb_build_object('success', true, 'state', 'unpublished', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_UNPUBLISHED');
  end if;

  select * into v_policy
  from public.organization_order_period_operational_policies
  where organization_id = v_driver.organization_id
    and order_period_template_id = v_template.id;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then
    return jsonb_build_object('success', true, 'state', 'policy_unconfigured', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;

  select * into v_occ
  from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  v_current_occurrence_found := found;

  if v_current_occurrence_found then
    select exists (
      select 1
      from public.driver_shifts ds
      where ds.driver_id = v_driver.id
        and ds.organization_id = v_driver.organization_id
        and ds.shift_template_id is null
        and ds.order_period_template_id = v_template.id
        and ds.scheduled_business_date = v_occ.scheduled_business_date
    ) into v_has_attendance;

    if not v_has_attendance and v_now < v_occ.scheduled_end_at then
      select * into v_override
      from public.organization_order_period_open_overrides o
      where o.organization_id = v_driver.organization_id
        and o.order_period_template_id = v_template.id
        and o.driver_id = v_driver.id
        and o.scheduled_business_date = v_occ.scheduled_business_date
        and o.opened_at <= v_now
        and o.expires_at > v_now;

      return jsonb_build_object(
        'success', true,
        'state', case
          when v_now >= v_occ.opens_at then case when found then 'manually_opened' else 'open' end
          when found then 'manually_opened'
          else 'before_open_window'
        end,
        'server_now', v_now,
        'template_id', v_template.id,
        'template_name', v_template.name,
        'scheduled_business_date', v_occ.scheduled_business_date,
        'scheduled_start_at', v_occ.scheduled_start_at,
        'scheduled_end_at', v_occ.scheduled_end_at,
        'opens_at', v_occ.opens_at,
        'closes_at', v_occ.closes_at,
        'earliest_start_at', v_occ.opens_at,
        'auto_close_at', v_occ.closes_at,
        'is_open_now', v_now >= v_occ.opens_at or found,
        'manual_override_active', found,
        'reason_code', null
      );
    end if;
  end if;

  -- The current occurrence is closed or already has attendance. Search only
  -- future Riyadh business dates covered by an active driver assignment.
  select greatest(
    coalesce(max(a.assignment_end_date), v_today + 1),
    coalesce(max(a.assignment_start_date), v_today + 1)
  ) into v_search_end
  from public.organization_order_period_assignments a
  where a.organization_id = v_driver.organization_id
    and a.driver_id = v_driver.id
    and a.is_active
    and (a.assignment_end_date is null or a.assignment_end_date >= v_today + 1);

  for v_next_date in
    select (v_today + day_offset)::date
    from generate_series(1, greatest(1, v_search_end - v_today)) as series(day_offset)
  loop
    v_next_template := null;
    v_next_policy := null;

    select t.* into v_next_template
    from public.organization_order_period_assignments a
    join public.organization_order_period_templates t
      on t.id = a.order_period_template_id
     and t.organization_id = a.organization_id
    where a.organization_id = v_driver.organization_id
      and a.driver_id = v_driver.id
      and a.is_active
      and a.assignment_start_date <= v_next_date
      and (a.assignment_end_date is null or a.assignment_end_date >= v_next_date)
      and t.is_active
      and t.archived_at is null
      and t.is_published
    order by a.assignment_start_date desc, a.created_at asc
    limit 1;

    if found then
      select * into v_next_policy
      from public.organization_order_period_operational_policies
      where organization_id = v_driver.organization_id
        and order_period_template_id = v_next_template.id;

      if found and v_next_policy.open_before_minutes is not null and v_next_policy.close_after_minutes is not null then
        v_next_start_at := (v_next_date + v_next_template.start_time) at time zone 'Asia/Riyadh';
        v_next_end_at := (v_next_date + case when v_next_template.crosses_midnight then 1 else 0 end + v_next_template.end_time) at time zone 'Asia/Riyadh';
        v_next_opens_at := v_next_start_at - make_interval(mins => v_next_policy.open_before_minutes);

        if v_next_start_at > v_now and not exists (
          select 1
          from public.driver_shifts ds
          where ds.driver_id = v_driver.id
            and ds.organization_id = v_driver.organization_id
            and ds.shift_template_id is null
            and ds.order_period_template_id = v_next_template.id
            and ds.scheduled_business_date = v_next_date
        ) then
          v_next_found := true;
          exit;
        end if;
      end if;
    end if;
  end loop;

  if v_current_occurrence_found then
    return jsonb_build_object(
      'success', true,
      'state', 'closed',
      'server_now', v_now,
      'template_id', v_template.id,
      'template_name', v_template.name,
      'scheduled_business_date', v_occ.scheduled_business_date,
      'scheduled_start_at', v_occ.scheduled_start_at,
      'scheduled_end_at', v_occ.scheduled_end_at,
      'opens_at', v_occ.opens_at,
      'closes_at', v_occ.closes_at,
      'earliest_start_at', v_occ.opens_at,
      'auto_close_at', v_occ.closes_at,
      'is_open_now', false,
      'manual_override_active', false,
      'reason_code', case when v_has_attendance then 'ORDER_PERIOD_ATTENDANCE_ALREADY_EXISTS' else 'ORDER_PERIOD_CLOSED' end,
      'next_scheduled_business_date', case when v_next_found then v_next_date else null end,
      'next_scheduled_start_at', case when v_next_found then v_next_start_at else null end,
      'next_scheduled_end_at', case when v_next_found then v_next_end_at else null end,
      'next_opens_at', case when v_next_found then v_next_opens_at else null end
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'state', 'closed',
    'server_now', v_now,
    'template_id', v_template.id,
    'template_name', v_template.name,
    'is_open_now', false,
    'manual_override_active', false,
    'reason_code', 'ORDER_PERIOD_CLOSED',
    'next_scheduled_business_date', case when v_next_found then v_next_date else null end,
    'next_scheduled_start_at', case when v_next_found then v_next_start_at else null end,
    'next_scheduled_end_at', case when v_next_found then v_next_end_at else null end,
    'next_opens_at', case when v_next_found then v_next_opens_at else null end
  );
end;
$$;

revoke all on function public.get_my_current_order_shift_operational_context() from public, anon;
grant execute on function public.get_my_current_order_shift_operational_context() to authenticated, service_role;

commit;
