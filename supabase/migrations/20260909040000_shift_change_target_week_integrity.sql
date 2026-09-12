begin;

create or replace function public.get_shift_change_request_target_week_start(
  p_reference_at timestamptz
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    timezone('Asia/Riyadh', coalesce(p_reference_at, now()))::date
    + (
      7 - extract(
        dow from timezone('Asia/Riyadh', coalesce(p_reference_at, now()))
      )::integer
    )
  )::date;
$$;

revoke all on function public.get_shift_change_request_target_week_start(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_shift_change_request_target_week_start(timestamptz)
  to authenticated, service_role;

create or replace function public.get_my_shift_change_request_window()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver_id uuid;
  v_organization_id uuid;
  v_today_riyadh date;
  v_weekday_riyadh smallint;
  v_allowed_weekdays smallint[];
  v_target_week_start date;
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'DRIVER_SHIFT_CHANGE_WINDOW_AUTH_REQUIRED'
    );
  end if;

  select d.id, d.organization_id
    into v_driver_id, v_organization_id
  from public.drivers d
  where d.auth_user_id = v_actor_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
  limit 1;

  if v_driver_id is null or v_organization_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'DRIVER_SHIFT_CHANGE_WINDOW_DRIVER_NOT_FOUND'
    );
  end if;

  v_today_riyadh := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday_riyadh := extract(
    dow from (now() at time zone 'Asia/Riyadh')
  )::smallint;
  v_allowed_weekdays := public.get_shift_change_request_days_internal(
    v_organization_id
  );
  v_target_week_start := public.get_shift_change_request_target_week_start(now());

  return jsonb_build_object(
    'success', true,
    'today_riyadh', v_today_riyadh,
    'weekday_riyadh', v_weekday_riyadh,
    'allowed_weekdays', v_allowed_weekdays,
    'can_submit_today', v_weekday_riyadh = any(v_allowed_weekdays),
    'target_week_start', v_target_week_start
  );
end;
$$;

revoke all on function public.get_my_shift_change_request_window()
  from public, anon;
grant execute on function public.get_my_shift_change_request_window()
  to authenticated, service_role;

drop policy if exists "Drivers can create shift change requests"
  on public.driver_shift_change_requests;
create policy "Drivers can create shift change requests"
  on public.driver_shift_change_requests
  for insert
  with check (
    driver_id in (
      select d.id
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.organization_id = driver_shift_change_requests.organization_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
    and public.is_shift_change_request_submission_day(
      driver_shift_change_requests.organization_id
    )
    and driver_shift_change_requests.requested_week_start_date =
      public.get_shift_change_request_target_week_start(now())
    and exists (
      select 1
      from public.organization_shift_templates current_shift
      where current_shift.id = driver_shift_change_requests.current_shift_id
        and current_shift.organization_id = driver_shift_change_requests.organization_id
        and current_shift.published_at is not null
        and current_shift.is_active = true
        and current_shift.archived_at is null
    )
    and exists (
      select 1
      from public.organization_shift_templates requested_shift
      where requested_shift.id = driver_shift_change_requests.requested_shift_id
        and requested_shift.organization_id = driver_shift_change_requests.organization_id
        and requested_shift.published_at is not null
        and requested_shift.is_active = true
        and requested_shift.archived_at is null
    )
  );

do $$
declare
  v_legacy_pending_count bigint;
begin
  select count(*)
    into v_legacy_pending_count
  from public.driver_shift_change_requests
  where status = 'pending'
    and requested_week_start_date <>
      public.get_shift_change_request_target_week_start(created_at);

  if v_legacy_pending_count > 0 then
    raise exception
      'SHIFT_CHANGE_TARGET_WEEK_LEGACY_PENDING_REQUESTS:%',
      v_legacy_pending_count;
  end if;
end;
$$;

create or replace function public.approve_shift_change_request(
    p_request_id uuid,
    p_user_id uuid,
    p_review_note text default null
) returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_id uuid;
    v_request public.driver_shift_change_requests%rowtype;
    v_target_assignment public.organization_shift_assignments%rowtype;
    v_anchor_assignment public.organization_shift_assignments%rowtype;
    v_conflicting_assignment public.organization_shift_assignments%rowtype;
    v_previous_end_date date;
    v_expected_execution_date date;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_APPROVAL_AUTH_REQUIRED'
        );
    end if;

    if p_user_id is distinct from v_actor_id then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_APPROVAL_ACTOR_MISMATCH'
        );
    end if;

    select *
      into v_request
    from public.driver_shift_change_requests
    where id = p_request_id
      and status = 'pending'
    for update;

    if not found then
        return json_build_object('success', false, 'error', 'Request not found or already processed');
    end if;

    if not public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review') then
        return json_build_object('success', false, 'error', 'Permission denied. Must have app_requests.review permission.');
    end if;

    v_expected_execution_date := public.get_shift_change_request_target_week_start(v_request.created_at);

    if v_request.requested_week_start_date <> v_expected_execution_date then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_INVALID_EXECUTION_WEEK'
        );
    end if;

    if exists (
      select 1
      from public.driver_shift_change_requests other_request
      where other_request.driver_id = v_request.driver_id
        and other_request.organization_id = v_request.organization_id
        and other_request.requested_week_start_date = v_request.requested_week_start_date
        and other_request.status in ('pending', 'approved')
        and other_request.id <> v_request.id
    ) then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_DUPLICATE_TARGET_WEEK'
        );
    end if;

    if not exists (
      select 1
      from public.organization_shift_templates current_shift
      where current_shift.id = v_request.current_shift_id
        and current_shift.organization_id = v_request.organization_id
        and current_shift.published_at is not null
        and current_shift.is_active = true
        and current_shift.archived_at is null
    ) then
        return json_build_object('success', false, 'error', 'Current shift is not published.');
    end if;

    if not exists (
      select 1
      from public.organization_shift_templates requested_shift
      where requested_shift.id = v_request.requested_shift_id
        and requested_shift.organization_id = v_request.organization_id
        and requested_shift.published_at is not null
        and requested_shift.is_active = true
        and requested_shift.archived_at is null
    ) then
        return json_build_object('success', false, 'error', 'Requested shift is not published.');
    end if;

    select *
      into v_target_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and assignment_start_date = v_request.requested_week_start_date
      and (
        assignment_end_date is null
        or assignment_end_date >= v_request.requested_week_start_date
      )
    order by created_at desc
    limit 1
    for update;

    if found then
        update public.organization_shift_assignments
        set shift_template_id = v_request.requested_shift_id,
            updated_at = timezone('utc', now()),
            updated_by = v_actor_id
        where id = v_target_assignment.id;

        update public.driver_shift_change_requests
        set status = 'approved',
            reviewed_by = v_actor_id,
            reviewed_at = timezone('utc', now()),
            review_note = p_review_note,
            updated_at = timezone('utc', now())
        where id = p_request_id;

        return json_build_object('success', true);
    end if;

    v_previous_end_date := (v_request.requested_week_start_date - interval '1 day')::date;

    select *
      into v_anchor_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and (
        assignment_start_date is null
        or assignment_start_date <= v_previous_end_date
      )
      and (
        assignment_end_date is null
        or assignment_end_date >= v_previous_end_date
      )
    order by assignment_start_date desc nulls last, created_at desc
    limit 1
    for update;

    if not found then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_NO_ACTIVE_ASSIGNMENT'
        );
    end if;

    if v_anchor_assignment.shift_template_id <> v_request.current_shift_id then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED'
        );
    end if;

    select *
      into v_conflicting_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and id <> v_anchor_assignment.id
      and (
        assignment_end_date is null
        or assignment_end_date >= v_request.requested_week_start_date
      )
      and (
        assignment_start_date is null
        or assignment_start_date >= v_request.requested_week_start_date
      )
    order by assignment_start_date asc nulls last, created_at asc
    limit 1
    for update;

    if found then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_FUTURE_ASSIGNMENT_CONFLICT'
        );
    end if;

    update public.organization_shift_assignments
    set assignment_end_date = v_previous_end_date,
        updated_at = timezone('utc', now()),
        updated_by = v_actor_id
    where id = v_anchor_assignment.id;

    insert into public.organization_shift_assignments (
        driver_id,
        organization_id,
        shift_template_id,
        assignment_start_date,
        is_active,
        created_at,
        created_by,
        updated_at
    ) values (
        v_request.driver_id,
        v_request.organization_id,
        v_request.requested_shift_id,
        v_request.requested_week_start_date,
        true,
        timezone('utc', now()),
        v_actor_id,
        timezone('utc', now())
    );

    update public.driver_shift_change_requests
    set status = 'approved',
        reviewed_by = v_actor_id,
        reviewed_at = timezone('utc', now()),
        review_note = p_review_note,
        updated_at = timezone('utc', now())
    where id = p_request_id;

    return json_build_object('success', true);
end;
$$;

revoke all on function public.approve_shift_change_request(uuid, uuid, text)
  from public, anon;
grant execute on function public.approve_shift_change_request(uuid, uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
