begin;

create or replace function public.get_order_period_open_now_eligibility(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if v_actor is null or not public.has_order_period_permission(v_actor, p_organization_id, 'order_periods.open_now') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED', 'items', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'template_id', a.order_period_template_id,
          'driver_id', a.driver_id,
          'scheduled_business_date', occurrence.scheduled_business_date,
          'scheduled_start_at', occurrence.scheduled_start_at,
          'scheduled_end_at', occurrence.scheduled_end_at,
          'attendance_exists', case when occurrence.scheduled_business_date is null then false else exists (
            select 1
            from public.driver_shifts ds
            where ds.organization_id = p_organization_id
              and ds.driver_id = a.driver_id
              and ds.shift_template_id is null
              and ds.order_period_template_id = a.order_period_template_id
              and ds.scheduled_business_date = occurrence.scheduled_business_date
          ) end,
          'manual_override_active', manual_override.id is not null,
          'override_id', manual_override.id,
          'override_opened_at', manual_override.opened_at,
          'override_expires_at', manual_override.expires_at,
          'open_now_state', case
            when occurrence.scheduled_business_date is null then 'no_current_occurrence'
            when now() >= occurrence.scheduled_end_at then 'occurrence_expired'
            when exists (
              select 1
              from public.driver_shifts ds
              where ds.organization_id = p_organization_id
                and ds.driver_id = a.driver_id
                and ds.shift_template_id is null
                and ds.order_period_template_id = a.order_period_template_id
                and ds.scheduled_business_date = occurrence.scheduled_business_date
            ) then 'attendance_exists'
            when manual_override.id is not null then 'manually_opened'
            else 'available'
          end,
          'open_now_eligible', (
            t.is_active
            and t.archived_at is null
            and t.is_published
            and occurrence.scheduled_end_at is not null
            and now() < occurrence.scheduled_end_at
            and not exists (
              select 1
              from public.driver_shifts ds
              where ds.organization_id = p_organization_id
                and ds.driver_id = a.driver_id
                and ds.shift_template_id is null
                and ds.order_period_template_id = a.order_period_template_id
                and ds.scheduled_business_date = occurrence.scheduled_business_date
            )
          ),
          'reason_code', case
            when not t.is_active or t.archived_at is not null or not t.is_published then 'template_unavailable'
            when occurrence.scheduled_business_date is null then 'no_current_occurrence'
            when exists (
              select 1
              from public.driver_shifts ds
              where ds.organization_id = p_organization_id
                and ds.driver_id = a.driver_id
                and ds.shift_template_id is null
                and ds.order_period_template_id = a.order_period_template_id
                and ds.scheduled_business_date = occurrence.scheduled_business_date
            ) then 'attendance_exists'
            when now() >= occurrence.scheduled_end_at then 'occurrence_expired'
            else null
          end
        ) order by a.order_period_template_id, a.driver_id
      )
      from public.organization_order_period_assignments a
      join public.organization_order_period_templates t
        on t.id = a.order_period_template_id
       and t.organization_id = a.organization_id
      left join lateral public.resolve_order_period_occurrence(
        p_organization_id,
        a.order_period_template_id,
        a.driver_id
      ) occurrence on true
      left join lateral (
        select o.id, o.opened_at, o.expires_at
        from public.organization_order_period_open_overrides o
        where o.organization_id = p_organization_id
          and o.order_period_template_id = a.order_period_template_id
          and o.driver_id = a.driver_id
          and o.scheduled_business_date = occurrence.scheduled_business_date
          and o.opened_at <= now()
          and o.expires_at > now()
        limit 1
      ) manual_override on true
      where a.organization_id = p_organization_id
        and a.is_active
        and a.assignment_start_date <= v_today
        and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.cancel_driver_order_period_now(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid,
  p_scheduled_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_driver public.drivers%rowtype;
  v_occ record;
  v_override public.organization_order_period_open_overrides%rowtype;
  v_attendance_id uuid;
  v_now timestamptz := now();
begin
  if v_actor is null or not public.has_order_period_permission(v_actor, p_organization_id, 'order_periods.open_now') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_order_period_template_id
    and organization_id = p_organization_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND');
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and organization_id = p_organization_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_INVALID');
  end if;

  perform 1
  from public.organization_order_period_assignments a
  where a.organization_id = p_organization_id
    and a.order_period_template_id = p_order_period_template_id
    and a.driver_id = p_driver_id
    and a.is_active
    and a.assignment_start_date <= p_scheduled_business_date
    and (a.assignment_end_date is null or a.assignment_end_date >= p_scheduled_business_date)
  order by a.id
  limit 1
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED');
  end if;

  select * into v_occ
  from public.resolve_order_period_occurrence(p_organization_id, p_order_period_template_id, p_driver_id);
  if not found or v_occ.scheduled_business_date <> p_scheduled_business_date then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE');
  end if;

  select ds.id into v_attendance_id
  from public.driver_shifts ds
  where ds.organization_id = p_organization_id
    and ds.driver_id = p_driver_id
    and ds.shift_template_id is null
    and ds.order_period_template_id = p_order_period_template_id
    and ds.scheduled_business_date = p_scheduled_business_date
  order by ds.created_at desc
  limit 1
  for update;
  if found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_MANUAL_OPEN_ALREADY_STARTED');
  end if;

  select * into v_override
  from public.organization_order_period_open_overrides o
  where o.id is not null
    and o.organization_id = p_organization_id
    and o.order_period_template_id = p_order_period_template_id
    and o.driver_id = p_driver_id
    and o.scheduled_business_date = p_scheduled_business_date
    and o.opened_at <= v_now
    and o.expires_at > v_now
  for update;
  if not found then
    return jsonb_build_object('success', true, 'status', 'already_cancelled', 'scheduled_business_date', p_scheduled_business_date);
  end if;

  delete from public.organization_order_period_open_overrides
  where id = v_override.id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, metadata
  ) values (
    v_actor, p_organization_id, 'order_shift_driver_open_now_cancelled',
    'organization_order_period_open_override', v_override.id,
    jsonb_build_object(
      'driver_id', p_driver_id,
      'order_period_template_id', p_order_period_template_id,
      'scheduled_business_date', p_scheduled_business_date,
      'opened_at', v_override.opened_at,
      'expires_at', v_override.expires_at
    ),
    jsonb_build_object(
      'driver_id', p_driver_id,
      'order_period_template_id', p_order_period_template_id,
      'scheduled_business_date', p_scheduled_business_date,
      'override_id', v_override.id,
      'opened_at', v_override.opened_at,
      'expires_at', v_override.expires_at,
      'cancelled_at', v_now
    )
  );

  return jsonb_build_object('success', true, 'status', 'cancelled', 'scheduled_business_date', p_scheduled_business_date);
end;
$$;

revoke all on function public.get_order_period_open_now_eligibility(uuid) from public, anon;
grant execute on function public.get_order_period_open_now_eligibility(uuid) to authenticated, service_role;
revoke all on function public.cancel_driver_order_period_now(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.cancel_driver_order_period_now(uuid, uuid, uuid, date) to authenticated, service_role;

drop policy if exists activity_logs_select_order_shift_history on public.activity_logs;
create policy activity_logs_select_order_shift_history
  on public.activity_logs
  for select
  to authenticated
  using (
    organization_id is not null
    and action = any (array[
      'order_period_template_created',
      'order_period_template_updated',
      'order_shift_operational_policy_updated',
      'order_shift_change_settings_updated',
      'order_shift_published',
      'order_shift_unpublished',
      'order_shift_enabled',
      'order_shift_disabled',
      'order_shift_archived',
      'order_period_week_membership_replaced',
      'order_period_driver_moved',
      'order_shift_driver_opened_now',
      'order_shift_driver_open_now_cancelled',
      'order_shift_change_request_approved',
      'order_shift_change_request_rejected'
    ]::text[])
    and (
      public.has_current_user_organization_permission(organization_id, 'order_periods.activity.view')
      or public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
    )
  );

commit;

notify pgrst, 'reload schema';
