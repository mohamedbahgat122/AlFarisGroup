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
    v_request record;
    v_current_assignment public.organization_shift_assignments%rowtype;
    v_previous_end_date date;
begin
    select * into v_request
    from public.driver_shift_change_requests
    where id = p_request_id and status = 'pending'
    for update;

    if not found then
        return json_build_object('success', false, 'error', 'Request not found or already processed');
    end if;

    if not public.has_organization_permission(p_user_id, v_request.organization_id, 'app_requests.review') then
        return json_build_object('success', false, 'error', 'Permission denied. Must have app_requests.review permission.');
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
      into v_current_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and assignment_end_date is null
    order by assignment_start_date desc nulls last, created_at desc
    limit 1
    for update;

    if found and v_current_assignment.assignment_start_date is not null then
        if v_request.requested_week_start_date < v_current_assignment.assignment_start_date then
            return json_build_object(
                'success', false,
                'error', 'SHIFT_CHANGE_DATE_BEFORE_ACTIVE_ASSIGNMENT'
            );
        end if;

        if v_request.requested_week_start_date = v_current_assignment.assignment_start_date then
            update public.organization_shift_assignments
            set shift_template_id = v_request.requested_shift_id,
                updated_at = timezone('utc', now()),
                updated_by = p_user_id
            where id = v_current_assignment.id;

            update public.driver_shift_change_requests
            set status = 'approved',
                reviewed_by = p_user_id,
                reviewed_at = timezone('utc', now()),
                review_note = p_review_note,
                updated_at = timezone('utc', now())
            where id = p_request_id;

            return json_build_object('success', true);
        end if;
    end if;

    v_previous_end_date := (v_request.requested_week_start_date - interval '1 day')::date;

    if found then
        update public.organization_shift_assignments
        set assignment_end_date = v_previous_end_date,
            updated_at = timezone('utc', now()),
            updated_by = p_user_id
        where id = v_current_assignment.id;
    end if;

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
        p_user_id,
        timezone('utc', now())
    );

    update public.driver_shift_change_requests
    set status = 'approved',
        reviewed_by = p_user_id,
        reviewed_at = timezone('utc', now()),
        review_note = p_review_note,
        updated_at = timezone('utc', now())
    where id = p_request_id;

    return json_build_object('success', true);
end;
$$;

notify pgrst, 'reload schema';
