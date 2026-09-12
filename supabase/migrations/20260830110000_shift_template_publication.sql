alter table public.organization_shift_templates
  add column if not exists published_at timestamptz null,
  add column if not exists published_by uuid null references public.profiles(id) on delete set null;

update public.organization_shift_templates
set published_at = created_at
where archived_at is null
  and published_at is null;

drop policy if exists organization_shift_templates_select_scoped
  on public.organization_shift_templates;
create policy organization_shift_templates_select_scoped
  on public.organization_shift_templates
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'shifts.view')
    or (
      published_at is not null
      and is_active = true
      and archived_at is null
      and exists (
        select 1
        from public.drivers d
        join public.profiles p
          on p.id = d.auth_user_id
        where p.id = auth.uid()
          and d.organization_id = organization_shift_templates.organization_id
          and p.role = 'driver'::public.app_role
          and p.status = 'active'::public.account_status
          and p.deleted_at is null
          and p.must_change_password = false
          and d.status = 'active'::public.driver_status
          and d.deleted_at is null
      )
    )
  );

drop policy if exists organization_shift_assignments_select_scoped
  on public.organization_shift_assignments;
create policy organization_shift_assignments_select_scoped
  on public.organization_shift_assignments
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'shifts.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p
        on p.id = d.auth_user_id
      join public.organization_shift_templates ost
        on ost.id = organization_shift_assignments.shift_template_id
       and ost.organization_id = organization_shift_assignments.organization_id
       and ost.published_at is not null
       and ost.is_active = true
       and ost.archived_at is null
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.id = organization_shift_assignments.driver_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );

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

    update public.driver_shift_change_requests
    set status = 'approved',
        reviewed_by = p_user_id,
        reviewed_at = timezone('utc', now()),
        review_note = p_review_note,
        updated_at = timezone('utc', now())
    where id = p_request_id;

    update public.organization_shift_assignments
    set assignment_end_date = (v_request.requested_week_start_date - interval '1 day')::date,
        updated_at = timezone('utc', now()),
        updated_by = p_user_id
    where driver_id = v_request.driver_id
      and is_active = true
      and (assignment_end_date is null or assignment_end_date > (v_request.requested_week_start_date - interval '1 day')::date);

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

    return json_build_object('success', true);
end;
$$;

notify pgrst, 'reload schema';
