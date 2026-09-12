-- Display expired assigned occurrences without weakening Start authorization.
-- 20260909050000 and 20260909060000 are deployed and intentionally unchanged.

create or replace function public.resolve_shift_attendance_display_occurrence(
  p_organization_id uuid,
  p_shift_template_id uuid,
  p_driver_id uuid default null
)
returns table (
  shift_template_id uuid,
  scheduled_business_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  assignment_id uuid,
  shift_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  return query
  with candidates as (
    select
      t.id as template_id,
      t.name as template_name,
      a.id as assignment_id,
      a.assignment_start_date,
      a.created_at,
      dates.candidate_date,
      (dates.candidate_date + t.start_time) at time zone 'Asia/Riyadh' as start_at,
      (
        dates.candidate_date
        + case when t.crosses_midnight then 1 else 0 end
        + t.end_time
      ) at time zone 'Asia/Riyadh' as end_at,
      t.start_time as template_start_time
    from public.organization_shift_templates t
    join public.organization_shift_assignments a
      on a.organization_id = t.organization_id
     and a.shift_template_id = t.id
     and (p_driver_id is null or a.driver_id = p_driver_id)
     and a.is_active = true
    cross join lateral (
      select v_today as candidate_date
      union all
      select v_today - 1
      where t.crosses_midnight
    ) dates
    where t.organization_id = p_organization_id
      and (p_shift_template_id is null or t.id = p_shift_template_id)
      and t.is_active = true
      and t.archived_at is null
      and (a.assignment_start_date is null or a.assignment_start_date <= dates.candidate_date)
      and (a.assignment_end_date is null or a.assignment_end_date >= dates.candidate_date)
  ), ranked as (
    select
      candidates.*,
      case
        when v_now >= start_at and v_now < end_at then 1
        when candidate_date = v_today and v_now >= end_at then 2
        when candidate_date = v_today - 1
          and v_now >= end_at
          and v_now < ((v_today + template_start_time) at time zone 'Asia/Riyadh') then 3
        when candidate_date = v_today and v_now < start_at then 4
        else 99
      end as priority
    from candidates
  )
  select
    ranked.template_id,
    ranked.candidate_date,
    ranked.start_at,
    ranked.end_at,
    ranked.assignment_id,
    ranked.template_name
  from ranked
  where ranked.priority < 99
  order by ranked.priority, ranked.candidate_date desc,
    ranked.assignment_start_date desc nulls last, ranked.created_at asc
  limit 1;
end;
$$;

revoke all on function public.resolve_shift_attendance_display_occurrence(uuid, uuid, uuid)
  from public, anon, authenticated;

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
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_occurrence record;
  v_open_shift public.driver_shifts%rowtype;
  v_policy_configured boolean := false;
  v_now timestamptz := now();
  v_start_available_at timestamptz;
  v_end_available_at timestamptz;
  v_override_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;

  select d.* into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;
  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;

  -- An open session is authoritative and must be resolved before display data.
  select ds.* into v_open_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open'
  order by ds.started_at desc
  limit 1;

  if found then
    if v_open_shift.attendance_control_version is null
       and v_open_shift.shift_template_id is null
       and v_open_shift.scheduled_business_date is null
       and v_open_shift.applied_start_open_before_minutes is null
       and v_open_shift.applied_minimum_work_minutes is null then
      return jsonb_build_object(
        'success', true, 'server_now', v_now, 'policy_configured', false,
        'state', 'legacy_open', 'reason_code', 'SHIFT_LEGACY_OPEN_SESSION',
        'actual_started_at', v_open_shift.started_at,
        'can_start_now', false, 'can_end_now', true
      );
    end if;

    select t.* into v_template
    from public.organization_shift_templates t
    where t.id = v_open_shift.shift_template_id
      and t.organization_id = v_open_shift.organization_id;

    if found and v_open_shift.scheduled_business_date is not null then
      select
        v_open_shift.shift_template_id as template_id,
        v_open_shift.scheduled_business_date as occurrence_date,
        (
          v_open_shift.scheduled_business_date + v_template.start_time
        ) at time zone 'Asia/Riyadh' as start_at,
        (
          v_open_shift.scheduled_business_date
          + case when v_template.crosses_midnight then 1 else 0 end
          + v_template.end_time
        ) at time zone 'Asia/Riyadh' as end_at,
        v_template.name as template_name
      into v_occurrence;
    end if;

    v_policy_configured := v_open_shift.applied_start_open_before_minutes is not null
      and v_open_shift.applied_minimum_work_minutes is not null;
    if v_occurrence.template_id is not null then
      v_start_available_at := v_occurrence.start_at
        - make_interval(mins => v_open_shift.applied_start_open_before_minutes);
    end if;
    v_end_available_at := v_open_shift.started_at
      + make_interval(mins => v_open_shift.applied_minimum_work_minutes);

    return jsonb_build_object(
      'success', true, 'server_now', v_now,
      'shift_template_id', v_occurrence.template_id,
      'shift_name', v_occurrence.template_name,
      'scheduled_business_date', v_occurrence.occurrence_date,
      'scheduled_start_at', v_occurrence.start_at,
      'scheduled_end_at', v_occurrence.end_at,
      'policy_configured', v_policy_configured,
      'start_open_before_minutes', v_open_shift.applied_start_open_before_minutes,
      'start_available_at', v_start_available_at,
      'start_override_active', false,
      'can_start_now', false,
      'actual_started_at', v_open_shift.started_at,
      'minimum_work_minutes', v_open_shift.applied_minimum_work_minutes,
      'end_available_at', v_end_available_at,
      'can_end_now', v_now >= v_end_available_at,
      'state', case when v_now >= v_end_available_at then 'end_available' else 'started_waiting_for_end' end,
      'reason_code', null
    );
  end if;

  select * into v_occurrence
  from public.resolve_shift_attendance_display_occurrence(
    v_driver.organization_id, null, v_driver.id
  );

  if not found then
    return jsonb_build_object(
      'success', true, 'server_now', v_now, 'policy_configured', false,
      'state', 'no_assignment', 'reason_code', 'SHIFT_NO_CURRENT_ASSIGNMENT'
    );
  end if;

  select p.* into v_policy
  from public.organization_shift_attendance_policies p
  where p.organization_id = v_driver.organization_id
    and p.shift_template_id = v_occurrence.shift_template_id;
  v_policy_configured := found
    and v_policy.start_open_before_minutes is not null
    and v_policy.minimum_work_minutes is not null;

  if v_policy_configured then
    v_start_available_at := v_occurrence.scheduled_start_at
      - make_interval(mins => v_policy.start_open_before_minutes);
  end if;

  select o.* into v_override
  from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id
    and o.shift_template_id = v_occurrence.shift_template_id
    and o.driver_id = v_driver.id
    and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now
    and o.override_expires_at > v_now;
  v_override_active := found;

  return jsonb_build_object(
    'success', true, 'server_now', v_now,
    'shift_template_id', v_occurrence.shift_template_id,
    'shift_name', v_occurrence.shift_name,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'scheduled_end_at', v_occurrence.scheduled_end_at,
    'policy_configured', v_policy_configured,
    'start_open_before_minutes', case when v_policy_configured then v_policy.start_open_before_minutes else null end,
    'start_available_at', v_start_available_at,
    'start_override_active', v_override_active,
    'can_start_now', v_policy_configured and v_now < v_occurrence.scheduled_end_at
      and (v_override_active or v_now >= v_start_available_at),
    'actual_started_at', null,
    'minimum_work_minutes', case when v_policy_configured then v_policy.minimum_work_minutes else null end,
    'end_available_at', null, 'can_end_now', false,
    'state', case
      when v_now >= v_occurrence.scheduled_end_at then 'shift_ended_without_start'
      when not v_policy_configured then 'unconfigured'
      when v_override_active or v_now >= v_start_available_at then
        case when v_now >= v_occurrence.scheduled_start_at then 'late_but_active' else 'start_available' end
      else 'before_start_window'
    end,
    'reason_code', case
      when v_now >= v_occurrence.scheduled_end_at then 'SHIFT_ATTENDANCE_OCCURRENCE_ENDED'
      when not v_policy_configured then 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED'
      when not (v_override_active or v_now >= v_start_available_at)
        then 'SHIFT_START_WINDOW_NOT_OPEN'
      else null
    end
  );
end;
$$;

revoke all on function public.get_driver_shift_attendance_context() from public, anon;
grant execute on function public.get_driver_shift_attendance_context() to authenticated;

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
  v_display_occurrence record;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    raise exception 'SHIFT_OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;

  select d.* into v_driver from public.drivers d
  where d.id = p_driver_id and d.organization_id = p_organization_id
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'tiers'::public.driver_settlement_type
  for update;
  if not found then raise exception 'SHIFT_DRIVER_NOT_ELIGIBLE' using errcode = '22023'; end if;

  select t.* into v_template from public.organization_shift_templates t
  where t.id = p_shift_template_id and t.organization_id = p_organization_id
    and t.is_active = true and t.archived_at is null
  for update;
  if not found then raise exception 'SHIFT_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_occurrence from public.resolve_shift_attendance_occurrence(
    p_organization_id, p_shift_template_id, p_driver_id
  );
  if not found then
    select * into v_display_occurrence from public.resolve_shift_attendance_display_occurrence(
      p_organization_id, p_shift_template_id, p_driver_id
    );
    if found and v_now >= v_display_occurrence.scheduled_end_at then
      raise exception 'SHIFT_ATTENDANCE_OCCURRENCE_ENDED' using errcode = '22023';
    end if;
    raise exception 'SHIFT_DRIVER_NOT_ASSIGNED' using errcode = '22023';
  end if;

  select p.* into v_policy from public.organization_shift_attendance_policies p
  where p.organization_id = p_organization_id and p.shift_template_id = p_shift_template_id
  for update;
  if not found or v_policy.start_open_before_minutes is null or v_policy.minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  if v_now >= v_occurrence.scheduled_start_at then
    return jsonb_build_object('status', 'already_in_window', 'server_now', v_now,
      'scheduled_business_date', v_occurrence.scheduled_business_date,
      'scheduled_start_at', v_occurrence.scheduled_start_at, 'driver_id', p_driver_id,
      'override_created', false);
  end if;

  insert into public.organization_shift_attendance_overrides (
    organization_id, shift_template_id, driver_id, scheduled_business_date,
    override_opened_at, override_expires_at, opened_by
  ) values (
    p_organization_id, p_shift_template_id, p_driver_id, v_occurrence.scheduled_business_date,
    v_now, v_occurrence.scheduled_start_at, v_actor_id
  )
  on conflict (organization_id, shift_template_id, driver_id, scheduled_business_date)
    where driver_id is not null
  do update set override_opened_at = excluded.override_opened_at,
    override_expires_at = excluded.override_expires_at, opened_by = excluded.opened_by
  returning * into v_override;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'driver_shift_attendance_start_opened_manually',
    'organization_shift_attendance_override', v_override.id,
    jsonb_build_object('shift_template_id', v_override.shift_template_id,
      'driver_id', v_override.driver_id, 'scheduled_business_date', v_override.scheduled_business_date,
      'override_opened_at', v_override.override_opened_at, 'override_expires_at', v_override.override_expires_at),
    jsonb_build_object('source', 'shift_attendance_control')
  );

  return jsonb_build_object('status', 'opened', 'server_now', v_now, 'driver_id', p_driver_id,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'override_opened_at', v_override.override_opened_at,
    'override_expires_at', v_override.override_expires_at, 'override_created', true);
end;
$$;

revoke all on function public.open_driver_shift_attendance_start_now(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.open_driver_shift_attendance_start_now(uuid, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
