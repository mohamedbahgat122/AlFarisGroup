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
    v_created_riyadh_date date;
    v_created_dow integer;
    v_expected_execution_date date;
    v_previous_end_date date;
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

    v_created_riyadh_date := (timezone('Asia/Riyadh', v_request.created_at))::date;
    v_created_dow := extract(dow from v_created_riyadh_date)::integer;
    v_expected_execution_date :=
      case v_created_dow
        when 6 then v_created_riyadh_date + 8
        when 0 then v_created_riyadh_date + 7
        when 1 then v_created_riyadh_date + 6
        else null
      end;

    if v_expected_execution_date is null then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_REQUEST_OUTSIDE_SUBMISSION_WINDOW'
        );
    end if;

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
  from public;
revoke all on function public.approve_shift_change_request(uuid, uuid, text)
  from anon;
grant execute on function public.approve_shift_change_request(uuid, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
