begin;

-- Keep Open Now eligibility and the mutation on one occurrence-selection
-- contract. The existing resolver remains authoritative for the current
-- occurrence; this helper only falls forward after that occurrence ends.
create or replace function public.resolve_order_period_open_now_occurrence(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid
)
returns table (
  scheduled_business_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  assignment_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_current record;
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_assignment uuid;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_search_start date;
  v_search_end date;
begin
  select * into v_current
  from public.resolve_order_period_occurrence(
    p_organization_id,
    p_order_period_template_id,
    p_driver_id
  );

  if not found then
    return;
  end if;

  if v_now < v_current.scheduled_end_at then
    return query select
      v_current.scheduled_business_date,
      v_current.scheduled_start_at,
      v_current.scheduled_end_at,
      v_current.opens_at,
      v_current.closes_at,
      v_current.assignment_id;
    return;
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_order_period_template_id
    and organization_id = p_organization_id
    and is_active
    and archived_at is null
    and is_published;
  if not found then
    return query select
      v_current.scheduled_business_date,
      v_current.scheduled_start_at,
      v_current.scheduled_end_at,
      v_current.opens_at,
      v_current.closes_at,
      v_current.assignment_id;
    return;
  end if;

  select * into v_policy
  from public.organization_order_period_operational_policies
  where organization_id = p_organization_id
    and order_period_template_id = p_order_period_template_id;
  if not found then
    return query select
      v_current.scheduled_business_date,
      v_current.scheduled_start_at,
      v_current.scheduled_end_at,
      v_current.opens_at,
      v_current.closes_at,
      v_current.assignment_id;
    return;
  end if;

  -- Match the bounded future-date search already used by the operational
  -- context. If the resolver returned a previous expired overnight date,
  -- today's occurrence is still eligible for consideration.
  v_search_start := greatest(v_today, v_current.scheduled_business_date + 1);

  -- An unbounded assignment still gets a finite horizon: one additional
  -- Riyadh business day beyond the first candidate date. This is sufficient
  -- for the next applicable occurrence in the daily assignment model and
  -- prevents NULL end dates from creating an unbounded scan. When all
  -- matching assignments are bounded, use their maximum relevant end date.
  if exists (
    select 1
    from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id
      and a.order_period_template_id = p_order_period_template_id
      and a.driver_id = p_driver_id
      and a.is_active
      and a.assignment_end_date is null
      and a.assignment_start_date <= v_search_start
  ) then
    v_search_end := v_search_start + 1;
  else
    select greatest(
      v_search_start,
      max(a.assignment_end_date)
    ) into v_search_end
    from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id
      and a.order_period_template_id = p_order_period_template_id
      and a.driver_id = p_driver_id
      and a.is_active
      and a.assignment_end_date is not null
      and a.assignment_start_date <= v_search_start
      and a.assignment_end_date >= v_search_start;
  end if;

  for v_date in
    select (v_search_start + day_offset)::date
    from generate_series(
      0,
      greatest(0, v_search_end - v_search_start)
    ) as series(day_offset)
  loop
    select a.id into v_assignment
    from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id
      and a.order_period_template_id = p_order_period_template_id
      and a.driver_id = p_driver_id
      and a.is_active
      and a.assignment_start_date <= v_date
      and (a.assignment_end_date is null or a.assignment_end_date >= v_date)
    order by a.assignment_start_date desc, a.created_at asc
    limit 1;
    if not found then
      continue;
    end if;

    v_start := (v_date + v_template.start_time) at time zone 'Asia/Riyadh';
    v_end := (
      v_date
      + case when v_template.crosses_midnight then 1 else 0 end
      + v_template.end_time
    ) at time zone 'Asia/Riyadh';

    if v_start > v_now and v_end > v_now then
      return query select
        v_date,
        v_start,
        v_end,
        v_start - make_interval(mins => coalesce(v_policy.open_before_minutes, 0)),
        case when v_policy.close_after_minutes is null then null
          else v_start + make_interval(mins => v_policy.close_after_minutes) end,
        v_assignment;
      return;
    end if;
  end loop;

  -- Preserve the existing expired/no-target response contract.
  return query select
    v_current.scheduled_business_date,
    v_current.scheduled_start_at,
    v_current.scheduled_end_at,
    v_current.opens_at,
    v_current.closes_at,
    v_current.assignment_id;
end;
$$;

revoke all on function public.resolve_order_period_open_now_occurrence(uuid, uuid, uuid) from public, anon, authenticated, service_role;

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
            select 1 from public.driver_shifts ds
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
              select 1 from public.driver_shifts ds
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
              select 1 from public.driver_shifts ds
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
              select 1 from public.driver_shifts ds
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
      left join lateral public.resolve_order_period_open_now_occurrence(
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

revoke all on function public.get_order_period_open_now_eligibility(uuid) from public, anon;
grant execute on function public.get_order_period_open_now_eligibility(uuid) to authenticated, service_role;

create or replace function public.open_driver_order_period_now(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
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
  if not found or not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_TEMPLATE_INVALID');
  end if;
  if not v_template.is_published then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNPUBLISHED');
  end if;

  select * into v_policy
  from public.organization_order_period_operational_policies
  where organization_id = p_organization_id
    and order_period_template_id = p_order_period_template_id
  for update;
  if not found or v_policy.open_before_minutes is null or v_policy.end_before_minutes is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
      and d.settlement_type = 'per_order'::public.driver_settlement_type
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_INVALID');
  end if;

  if not exists (
    select 1 from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id
      and a.order_period_template_id = p_order_period_template_id
      and a.driver_id = p_driver_id
      and a.is_active
      and a.assignment_start_date <= (v_now at time zone 'Asia/Riyadh')::date
      and (a.assignment_end_date is null or a.assignment_end_date >= (v_now at time zone 'Asia/Riyadh')::date)
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED');
  end if;

  select * into v_occ
  from public.resolve_order_period_open_now_occurrence(
    p_organization_id,
    p_order_period_template_id,
    p_driver_id
  );
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE');
  end if;

  if exists (
    select 1 from public.driver_shifts ds
    where ds.driver_id = p_driver_id
      and ds.organization_id = p_organization_id
      and ds.shift_template_id is null
      and ds.order_period_template_id = p_order_period_template_id
      and ds.scheduled_business_date = v_occ.scheduled_business_date
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ATTENDANCE_ALREADY_EXISTS');
  end if;

  if v_now >= v_occ.scheduled_end_at then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OCCURRENCE_EXPIRED');
  end if;
  if v_now >= v_occ.opens_at then
    return jsonb_build_object('success', true, 'status', 'already_open', 'scheduled_business_date', v_occ.scheduled_business_date);
  end if;

  insert into public.organization_order_period_open_overrides (
    organization_id,
    order_period_template_id,
    driver_id,
    scheduled_business_date,
    opened_at,
    expires_at,
    opened_by
  ) values (
    p_organization_id,
    p_order_period_template_id,
    p_driver_id,
    v_occ.scheduled_business_date,
    v_now,
    v_occ.scheduled_end_at,
    v_actor
  )
  on conflict (organization_id, order_period_template_id, driver_id, scheduled_business_date)
  do update set
    opened_at = excluded.opened_at,
    expires_at = excluded.expires_at,
    opened_by = excluded.opened_by,
    updated_at = timezone('utc', now());

  insert into public.activity_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_actor,
    p_organization_id,
    'order_shift_driver_opened_now',
    'organization_order_period_open_override',
    (
      select id
      from public.organization_order_period_open_overrides
      where organization_id = p_organization_id
        and order_period_template_id = p_order_period_template_id
        and driver_id = p_driver_id
        and scheduled_business_date = v_occ.scheduled_business_date
    ),
    jsonb_build_object(
      'driver_id', p_driver_id,
      'scheduled_business_date', v_occ.scheduled_business_date,
      'opened_at', v_now,
      'expires_at', v_occ.scheduled_end_at
    ),
    jsonb_build_object(
      'order_period_template_id', p_order_period_template_id,
      'override_lifetime', 'scheduled_occurrence_end'
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'opened',
    'scheduled_business_date', v_occ.scheduled_business_date,
    'expires_at', v_occ.scheduled_end_at
  );
end;
$$;

revoke all on function public.open_driver_order_period_now(uuid, uuid, uuid) from public, anon;
grant execute on function public.open_driver_order_period_now(uuid, uuid, uuid) to authenticated, service_role;

commit;
