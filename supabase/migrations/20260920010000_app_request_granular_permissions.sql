begin;

-- Add the request and odometer capabilities without removing legacy keys.
create or replace function public.organization_permission_keys()
returns text[] language sql stable set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'drivers.create', 'drivers.update',
    'drivers.status', 'drivers.archive', 'drivers.documents.view', 'drivers.documents.download',
    'drivers.activity.view', 'drivers.account.manage', 'driver_reports.view', 'driver_reports.import',
    'driver_reports.replace', 'driver_reports.details.view', 'driver_order_reports.view',
    'driver_order_reports.import', 'driver_order_reports.replace', 'driver_order_reports.details.view',
    'driver_order_reports.edit', 'fleet.cars.view', 'fleet.motorcycles.view', 'fleet.create',
    'fleet.update', 'fleet.technical_status', 'fleet.operational_status', 'fleet.archive',
    'fleet.operating_card.download', 'fleet.activity.view', 'fuel.manage', 'fuel.reports.view',
    'fuel.increase.review', 'app_requests.view', 'app_requests.review',
    'app_requests.leave.view', 'app_requests.leave.review',
    'app_requests.maintenance.view', 'app_requests.maintenance.review',
    'app_requests.meeting.view', 'app_requests.meeting.review',
    'app_requests.oil_change.view', 'app_requests.oil_change.review',
    'app_requests.shift_change.view', 'app_requests.shift_change.review',
    'odometer.manage', 'odometer.view', 'odometer.review', 'odometer.edit',
    'odometer.approve', 'odometer.reject', 'notifications.view', 'driver_warnings.view',
    'driver_warnings.issue', 'driver_warnings.revoke', 'entitlements.view',
    'entitlements.create_transaction', 'entitlements.view_transactions',
    'entitlements.reverse_transaction', 'entitlements.publish', 'shifts.view', 'shifts.create',
    'shifts.update', 'shifts.assign', 'shifts.archive', 'maintenance_providers.view',
    'maintenance_providers.manage', 'maintenance_jobs.view', 'maintenance_jobs.assign',
    'maintenance_jobs.cancel', 'maintenance_materials.view', 'maintenance_materials.manage',
    'order_periods.view', 'order_periods.manage', 'order_periods.create', 'order_periods.update',
    'order_periods.assign', 'order_periods.open_now', 'order_periods.requests.review',
    'order_periods.settings', 'order_periods.archive', 'order_periods.activity.view'
  ]::text[];
$$;

create or replace function public.view_only_organization_permission_keys()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'driver_reports.view', 'driver_order_reports.view',
    'fleet.cars.view', 'fleet.motorcycles.view', 'fuel.reports.view', 'app_requests.view',
    'app_requests.leave.view', 'app_requests.maintenance.view', 'app_requests.meeting.view',
    'app_requests.oil_change.view', 'app_requests.shift_change.view',
    'odometer.manage', 'odometer.view', 'notifications.view', 'driver_warnings.view',
    'entitlements.view', 'entitlements.view_transactions', 'shifts.view',
    'maintenance_providers.view', 'maintenance_jobs.view', 'maintenance_materials.view',
    'order_periods.view', 'order_periods.activity.view'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;
alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check
  check (permission_key = any (public.organization_permission_keys()));

drop policy if exists driver_app_requests_select_dashboard on public.driver_app_requests;
create policy driver_app_requests_select_dashboard
  on public.driver_app_requests for select to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'app_requests.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or (request_type = 'leave' and (
      public.has_current_user_organization_permission(organization_id, 'app_requests.leave.view')
      or public.has_current_user_organization_permission(organization_id, 'app_requests.leave.review')))
    or (request_type = 'maintenance' and (
      public.has_current_user_organization_permission(organization_id, 'app_requests.maintenance.view')
      or public.has_current_user_organization_permission(organization_id, 'app_requests.maintenance.review')))
    or (request_type = 'meeting' and (
      public.has_current_user_organization_permission(organization_id, 'app_requests.meeting.view')
      or public.has_current_user_organization_permission(organization_id, 'app_requests.meeting.review')))
    or (request_type = 'oil_change' and (
      public.has_current_user_organization_permission(organization_id, 'app_requests.oil_change.view')
      or public.has_current_user_organization_permission(organization_id, 'app_requests.oil_change.review')))
  );

drop policy if exists "Org users can view their shift change requests" on public.driver_shift_change_requests;
create policy "Org users can view their shift change requests"
  on public.driver_shift_change_requests for select to public
  using (
    public.has_current_user_organization_permission(organization_id, 'app_requests.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.shift_change.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.shift_change.review')
  );

drop policy if exists "Org users can update shift change requests" on public.driver_shift_change_requests;
create policy "Org users can update shift change requests"
  on public.driver_shift_change_requests for update to public
  using (
    public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.shift_change.review')
  )
  with check (
    public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.shift_change.review')
  );

drop policy if exists driver_shifts_select_org_odometer_manage on public.driver_shifts;
create policy driver_shifts_select_org_odometer_manage
  on public.driver_shifts for select to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'odometer.manage')
    or public.has_current_user_organization_permission(organization_id, 'odometer.view')
    or public.has_current_user_organization_permission(organization_id, 'odometer.review')
    or public.has_current_user_organization_permission(organization_id, 'odometer.edit')
    or public.has_current_user_organization_permission(organization_id, 'odometer.approve')
    or public.has_current_user_organization_permission(organization_id, 'odometer.reject')
  );

-- Keep request notifications available to granular viewers without exposing
-- categories they cannot view.
create or replace function public.notify_driver_app_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := public.request_notification_type_label(new.request_type);
  v_driver_name text;
  v_recipient record;
begin
  select d.full_name
    into v_driver_name
  from public.drivers d
  where d.id = new.driver_id;

  for v_recipient in
    select distinct recipient_id as id
    from (
      select p.id as recipient_id
      from public.profiles p
      where p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.role <> 'driver'::public.app_role
        and (
          p.role = 'system_owner'::public.app_role
          or (
            public.has_organization_permission(p.id, new.organization_id, 'notifications.view')
            and (
              public.has_organization_permission(p.id, new.organization_id, 'app_requests.view')
              or (new.request_type = 'leave' and (
                public.has_organization_permission(p.id, new.organization_id, 'app_requests.leave.view')
                or public.has_organization_permission(p.id, new.organization_id, 'app_requests.leave.review')))
              or (new.request_type = 'maintenance' and (
                public.has_organization_permission(p.id, new.organization_id, 'app_requests.maintenance.view')
                or public.has_organization_permission(p.id, new.organization_id, 'app_requests.maintenance.review')))
              or (new.request_type = 'meeting' and (
                public.has_organization_permission(p.id, new.organization_id, 'app_requests.meeting.view')
                or public.has_organization_permission(p.id, new.organization_id, 'app_requests.meeting.review')))
              or (new.request_type = 'oil_change' and (
                public.has_organization_permission(p.id, new.organization_id, 'app_requests.oil_change.view')
                or public.has_organization_permission(p.id, new.organization_id, 'app_requests.oil_change.review')))
            )
          )
        )

      union

      select md.requested_manager_user_id as recipient_id
      from public.driver_app_meeting_request_details md
      where new.request_type = 'meeting'
        and md.request_id = new.id
        and md.requested_manager_user_id is not null
        and public.is_meeting_manager_eligible(md.requested_manager_user_id, new.organization_id)
    ) recipients
  loop
    perform public.insert_app_notification(
      v_recipient.id,
      new.organization_id,
      'driver_app_request_submitted',
      'New ' || lower(v_label),
      coalesce(v_driver_name, 'A driver') || ' submitted a ' || lower(v_label) || '.',
      'driver_app_request',
      new.id,
      'driver_app_request:' || new.id::text || ':submitted:' || v_recipient.id::text
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_driver_app_request_submitted()
  from public, anon, authenticated;

-- Explicitly replace the canonical SECURITY DEFINER functions with the
-- same business logic and grants, changing only authorization predicates.
create or replace function public.approve_and_assign_maintenance_request(
  p_request_id uuid,
  p_provider_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_request public.driver_app_requests%rowtype;
  v_existing_job public.maintenance_jobs%rowtype;
  v_job public.maintenance_jobs%rowtype;
  v_driver_name text;
  v_vehicle_type text;
  v_maintenance_detail public.driver_app_maintenance_request_details%rowtype;
  v_oil_detail public.driver_app_oil_change_request_details%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = p_request_id
    and request_type in ('maintenance', 'oil_change')
  for update;

  if not found then
    raise exception 'MAINTENANCE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    (public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review') or public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.maintenance.review'))
    and public.has_organization_permission(v_actor_id, v_request.organization_id, 'maintenance_jobs.assign')
  ) then
    raise exception 'MAINTENANCE_ASSIGN_FORBIDDEN' using errcode = '42501';
  end if;

  if v_request.vehicle_id is null then
    raise exception 'MAINTENANCE_REQUEST_VEHICLE_REQUIRED' using errcode = '23502';
  end if;

  if v_request.status not in ('pending', 'approved') then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATUS' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.maintenance_providers mp
    join public.maintenance_provider_organizations mpo
      on mpo.provider_id = mp.id
     and mpo.organization_id = v_request.organization_id
     and mpo.is_active = true
    where mp.id = p_provider_id
      and mp.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  select *
    into v_existing_job
  from public.maintenance_jobs
  where request_id = v_request.id
  for update;

  if found then
    if v_existing_job.provider_id = p_provider_id
      and v_request.status = 'approved'
    then
      return jsonb_build_object(
        'id', v_existing_job.id,
        'request_id', v_existing_job.request_id,
        'job_type', v_existing_job.job_type,
        'status', v_existing_job.status,
        'already_exists', true
      );
    end if;

    raise exception 'MAINTENANCE_JOB_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if v_request.status = 'pending' then
    update public.driver_app_requests
    set
      status = 'approved',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_note = v_notes,
      updated_at = v_now
    where id = v_request.id
      and status = 'pending'
    returning * into v_request;

    if not found then
      raise exception 'MAINTENANCE_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
    end if;

    perform public.insert_driver_app_request_activity(
      v_actor_id,
      v_request.organization_id,
      v_request.driver_id,
      v_request.id,
      'driver_app_request_approved',
      v_request.request_type,
      'approved'
    );
  end if;

  select d.full_name
    into v_driver_name
  from public.drivers d
  where d.id = v_request.driver_id;

  select fv.vehicle_type
    into v_vehicle_type
  from public.fleet_vehicles fv
  where fv.id = v_request.vehicle_id;

  if v_request.request_type = 'maintenance' then
    select *
      into v_maintenance_detail
    from public.driver_app_maintenance_request_details
    where request_id = v_request.id;
  elsif v_request.request_type = 'oil_change' then
    select *
      into v_oil_detail
    from public.driver_app_oil_change_request_details
    where request_id = v_request.id;
  end if;

  insert into public.maintenance_jobs (
    request_id,
    organization_id,
    provider_id,
    driver_id,
    vehicle_id,
    job_type,
    status,
    assigned_at,
    assigned_by,
    notes,
    driver_name_snapshot,
    vehicle_plate_snapshot,
    vehicle_type_snapshot,
    request_description_snapshot,
    maintenance_category_snapshot,
    urgency_snapshot,
    requested_odometer_snapshot
  )
  values (
    v_request.id,
    v_request.organization_id,
    p_provider_id,
    v_request.driver_id,
    v_request.vehicle_id,
    v_request.request_type,
    'ready',
    v_now,
    v_actor_id,
    v_notes,
    v_driver_name,
    v_request.vehicle_plate_snapshot,
    v_vehicle_type,
    coalesce(v_maintenance_detail.problem_description, v_request.submitted_note),
    v_maintenance_detail.maintenance_category,
    v_maintenance_detail.urgency,
    v_oil_detail.current_odometer_reading
  )
  returning * into v_job;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_job.organization_id,
    'maintenance_job_assigned',
    'maintenance_job',
    v_job.id,
    null,
    to_jsonb(v_job),
    jsonb_build_object('request_id', v_job.request_id, 'provider_id', v_job.provider_id)
  );

  return jsonb_build_object(
    'id', v_job.id,
    'request_id', v_job.request_id,
    'job_type', v_job.job_type,
    'status', v_job.status,
    'already_exists', false
  );
end;
$$;

revoke all on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.complete_driver_oil_change_request(
  p_request_id uuid,
  p_interval_km integer,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.driver_app_requests%rowtype;
  v_detail public.driver_app_oil_change_request_details%rowtype;
  v_existing_event public.fleet_vehicle_oil_change_events%rowtype;
  v_completed_at timestamptz := timezone('utc', now());
  v_review_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'APP_REQUEST_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_interval_km is null or p_interval_km <= 0 or p_interval_km > 2147483647 then
    raise exception 'APP_REQUEST_INVALID_OIL_INTERVAL' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = p_request_id
    and request_type = 'oil_change'
  for update;

  if not found then
    raise exception 'APP_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.can_manage_organization(v_request.organization_id)
    or (public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review') or public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.oil_change.review'))
  ) then
    raise exception 'APP_REQUEST_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_detail
  from public.driver_app_oil_change_request_details
  where request_id = v_request.id
  for update;

  if not found then
    raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_request.vehicle_id is null then
    raise exception 'APP_REQUEST_VEHICLE_REQUIRED' using errcode = '23502';
  end if;

  if v_request.status = 'completed' then
    select *
      into v_existing_event
    from public.fleet_vehicle_oil_change_events
    where request_id = v_request.id;

    if found then
      return jsonb_build_object(
        'id', v_request.id,
        'request_type', v_request.request_type,
        'status', v_request.status,
        'oil_event_id', v_existing_event.id
      );
    end if;

    raise exception 'APP_REQUEST_COMPLETED_WITHOUT_OIL_EVENT' using errcode = '23514';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'APP_REQUEST_INVALID_STATUS' using errcode = '22023';
  end if;

  update public.driver_app_requests
  set
    status = 'completed',
    completed_by = v_actor_id,
    completed_at = v_completed_at,
    updated_at = v_completed_at,
    review_note = coalesce(v_review_note, review_note)
  where id = v_request.id
    and status = 'approved'
  returning * into v_request;

  if not found then
    raise exception 'APP_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  insert into public.fleet_vehicle_oil_change_events (
    organization_id,
    vehicle_id,
    driver_id,
    request_id,
    odometer_reading,
    interval_km,
    completed_at,
    note,
    created_by
  )
  values (
    v_request.organization_id,
    v_request.vehicle_id,
    v_request.driver_id,
    v_request.id,
    v_detail.current_odometer_reading,
    p_interval_km,
    v_completed_at,
    coalesce(v_review_note, v_detail.note),
    v_actor_id
  )
  on conflict (request_id) where request_id is not null do nothing
  returning * into v_existing_event;

  if not found then
    select *
      into v_existing_event
    from public.fleet_vehicle_oil_change_events
    where request_id = v_request.id;
  end if;

  perform public.insert_driver_app_request_activity(
    v_actor_id,
    v_request.organization_id,
    v_request.driver_id,
    v_request.id,
    'driver_app_request_completed',
    'oil_change',
    'completed'
  );

  return jsonb_build_object(
    'id', v_request.id,
    'request_type', v_request.request_type,
    'status', v_request.status,
    'oil_event_id', v_existing_event.id
  );
end;
$$;

revoke all on function public.complete_driver_oil_change_request(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.complete_driver_oil_change_request(uuid, integer, text)
  to authenticated;

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

    if not (public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review') or public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.shift_change.review')) then
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

create or replace function public.review_driver_shift_odometer(
  p_shift_id uuid,
  p_phase text,
  p_decision text,
  p_review_note text default null,
  p_odometer_reading bigint default null
)
returns public.driver_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift public.driver_shifts%rowtype;
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  v_prev_reading bigint;
  v_next_reading bigint;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_phase not in ('start', 'end') then
    raise exception 'INVALID_PHASE' using errcode = '22023';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  if p_decision = 'rejected' and v_note is null then
    raise exception 'REJECTION_NOTE_REQUIRED' using errcode = '22023';
  end if;

  if p_decision = 'approved' and p_odometer_reading is null then
    raise exception 'APPROVAL_READING_REQUIRED' using errcode = '22023';
  end if;

  if p_odometer_reading is not null and (p_odometer_reading < 0 or p_odometer_reading > 2147483647) then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  select *
  into v_shift
  from public.driver_shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    if not (
      public.is_system_owner_user(v_actor_id)
      or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
      or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.approve')
    ) then
      raise exception 'ODOMETER_REVIEW_FORBIDDEN' using errcode = '42501';
    end if;
  else
    if not (
      public.is_system_owner_user(v_actor_id)
      or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
      or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.reject')
    ) then
      raise exception 'ODOMETER_REVIEW_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if p_phase = 'start' and p_decision = 'approved' then
    if v_shift.end_odometer_reading is not null and p_odometer_reading > v_shift.end_odometer_reading then
      raise exception 'SHIFT_START_ABOVE_END' using errcode = '22023';
    end if;

    select coalesce(
      case when end_odometer_reading is not null and (end_review_status is null or end_review_status = 'approved') then end_odometer_reading else null end,
      case when start_odometer_reading is not null and (start_review_status is null or start_review_status = 'approved') then start_odometer_reading else null end
    )
    into v_prev_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at < v_shift.started_at
    order by started_at desc
    limit 1;

    if v_prev_reading is not null and p_odometer_reading < v_prev_reading then
      raise exception 'SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING' using errcode = '22023';
    end if;
  end if;

  if p_phase = 'end' and p_decision = 'approved' then
    if v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
      raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
    end if;

    select coalesce(
      case when start_odometer_reading is not null and (start_review_status is null or start_review_status = 'approved') then start_odometer_reading else null end,
      case when end_odometer_reading is not null and (end_review_status is null or end_review_status = 'approved') then end_odometer_reading else null end
    )
    into v_next_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at > coalesce(v_shift.ended_at, v_shift.started_at)
    order by started_at asc
    limit 1;

    if v_next_reading is not null and p_odometer_reading > v_next_reading then
      raise exception 'SHIFT_END_ABOVE_NEXT_VEHICLE_READING' using errcode = '22023';
    end if;
  end if;

  if p_phase = 'start' then
    if p_decision = 'approved' then
      update public.driver_shifts
      set start_odometer_reading = p_odometer_reading,
          start_review_status = p_decision,
          start_reviewed_by = v_actor_id,
          start_reviewed_at = now(),
          start_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    else
      update public.driver_shifts
      set start_review_status = p_decision,
          start_reviewed_by = v_actor_id,
          start_reviewed_at = now(),
          start_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    end if;
  else
    if p_decision = 'approved' then
      update public.driver_shifts
      set end_odometer_reading = p_odometer_reading,
          end_review_status = p_decision,
          end_reviewed_by = v_actor_id,
          end_reviewed_at = now(),
          end_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    else
      update public.driver_shifts
      set end_review_status = p_decision,
          end_reviewed_by = v_actor_id,
          end_reviewed_at = now(),
          end_review_note = v_note,
          updated_at = now()
      where id = p_shift_id
      returning * into v_shift;
    end if;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    target_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_actor_id,
    null,
    v_shift.organization_id,
    'driver_shift_odometer_' || p_phase || '_' || p_decision,
    'driver_shift',
    v_shift.id,
    jsonb_build_object(
      'phase', p_phase,
      'review_status', p_decision,
      'review_note', v_note,
      'odometer_reading', p_odometer_reading,
      'driver_id', v_shift.driver_id,
      'vehicle_id', v_shift.vehicle_id
    ),
    jsonb_build_object('source', 'dashboard')
  );

  return v_shift;
end;
$$;

revoke all on function public.review_driver_shift_odometer(uuid, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.review_driver_shift_odometer(uuid, text, text, text, bigint)
  to authenticated;

create or replace function public.admin_set_vehicle_odometer_baseline(
  p_vehicle_id uuid,
  p_baseline_reading bigint,
  p_reset_at timestamptz,
  p_reason text,
  p_note text default null
)
returns public.fleet_vehicle_odometer_resets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_vehicle public.fleet_vehicles%rowtype;
  v_reset public.fleet_vehicle_odometer_resets%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_baseline_reading is null or p_baseline_reading < 0 then
    raise exception 'INVALID_BASELINE_READING' using errcode = '22023';
  end if;

  select * into v_vehicle from public.fleet_vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_vehicle.organization_id, 'odometer.manage')
    or public.has_organization_permission(v_actor_id, v_vehicle.organization_id, 'odometer.edit')
  ) then
    raise exception 'ODOMETER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.fleet_vehicle_odometer_resets (
    id,
    organization_id,
    vehicle_id,
    baseline_reading,
    reset_at,
    reason,
    note,
    created_by
  ) values (
    v_id,
    v_vehicle.organization_id,
    v_vehicle.id,
    p_baseline_reading,
    coalesce(p_reset_at, now()),
    p_reason,
    p_note,
    v_actor_id
  )
  returning * into v_reset;

  insert into public.fleet_vehicle_activity_logs (
    id,
    organization_id,
    vehicle_id,
    actor_user_id,
    action,
    old_values,
    new_values,
    note
  ) values (
    gen_random_uuid(),
    v_vehicle.organization_id,
    v_vehicle.id,
    v_actor_id,
    'odometer_baseline_reset',
    null,
    jsonb_build_object(
      'reset_id', v_reset.id,
      'vehicle_id', v_vehicle.id,
      'baseline_reading', p_baseline_reading,
      'reason', p_reason,
      'reset_at', v_reset.reset_at
    ),
    p_note
  );

  return v_reset;
end;
$$;

revoke all on function public.admin_set_vehicle_odometer_baseline(uuid, bigint, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_vehicle_odometer_baseline(uuid, bigint, timestamptz, text, text)
  to authenticated;

create or replace function public.admin_update_shift_odometer_reading(
  p_shift_id uuid,
  p_phase text,
  p_odometer_reading bigint,
  p_reason text default null
)
returns public.driver_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift public.driver_shifts%rowtype;
  v_prev_reading bigint;
  v_next_reading bigint;
  v_latest_reset public.fleet_vehicle_odometer_resets%rowtype;
  v_old_reading bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_phase not in ('start', 'end') then
    raise exception 'INVALID_PHASE' using errcode = '22023';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  select * into v_shift from public.driver_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
    or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.edit')
  ) then
    raise exception 'ODOMETER_MANAGE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_phase = 'start' then
    v_old_reading := v_shift.start_odometer_reading;
    if v_shift.end_odometer_reading is not null and p_odometer_reading > v_shift.end_odometer_reading then
      raise exception 'SHIFT_START_ABOVE_END' using errcode = '22023';
    end if;

    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at <= v_shift.started_at
    order by reset_at desc
    limit 1;

    select coalesce(
      case when end_odometer_reading is not null then end_odometer_reading else null end,
      case when start_odometer_reading is not null then start_odometer_reading else null end
    )
    into v_prev_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at < v_shift.started_at
      and (v_latest_reset.reset_at is null or started_at >= v_latest_reset.reset_at)
      and (end_odometer_reading is not null or start_odometer_reading is not null)
    order by started_at desc
    limit 1;

    if v_prev_reading is null and v_latest_reset.baseline_reading is not null then
      v_prev_reading := v_latest_reset.baseline_reading;
    end if;

    if v_prev_reading is not null and p_odometer_reading < v_prev_reading then
      raise exception 'SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING' using errcode = '22023';
    end if;

    update public.driver_shifts
    set start_odometer_reading = p_odometer_reading,
        start_review_status = 'approved',
        start_reviewed_by = v_actor_id,
        start_reviewed_at = now(),
        start_review_note = v_reason,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;

  else
    v_old_reading := v_shift.end_odometer_reading;
    if v_shift.start_odometer_reading is not null and p_odometer_reading < v_shift.start_odometer_reading then
      raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
    end if;

    select * into v_latest_reset
    from public.fleet_vehicle_odometer_resets
    where vehicle_id = v_shift.vehicle_id
      and reset_at > coalesce(v_shift.ended_at, v_shift.started_at)
    order by reset_at asc
    limit 1;

    select coalesce(
      case when start_odometer_reading is not null then start_odometer_reading else null end,
      case when end_odometer_reading is not null then end_odometer_reading else null end
    )
    into v_next_reading
    from public.driver_shifts
    where vehicle_id = v_shift.vehicle_id
      and id != v_shift.id
      and started_at > coalesce(v_shift.ended_at, v_shift.started_at)
      and (v_latest_reset.reset_at is null or coalesce(ended_at, started_at) <= v_latest_reset.reset_at)
      and (start_odometer_reading is not null or end_odometer_reading is not null)
    order by started_at asc
    limit 1;

    if v_next_reading is not null and p_odometer_reading > v_next_reading then
      raise exception 'SHIFT_END_ABOVE_NEXT_VEHICLE_READING' using errcode = '22023';
    end if;

    update public.driver_shifts
    set end_odometer_reading = p_odometer_reading,
        end_review_status = 'approved',
        end_reviewed_by = v_actor_id,
        end_reviewed_at = now(),
        end_review_note = v_reason,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;
  end if;

  if v_shift.vehicle_id is not null then
    insert into public.fleet_vehicle_activity_logs (
      id,
      organization_id,
      vehicle_id,
      actor_user_id,
      action,
      old_values,
      new_values,
      note
    ) values (
      gen_random_uuid(),
      v_shift.organization_id,
      v_shift.vehicle_id,
      v_actor_id,
      'odometer_correction',
      jsonb_build_object(
        'shift_id', p_shift_id,
        'driver_id', v_shift.driver_id,
        'vehicle_id', v_shift.vehicle_id,
        'phase', p_phase,
        'odometer_reading', v_old_reading
      ),
      jsonb_build_object(
        'shift_id', p_shift_id,
        'driver_id', v_shift.driver_id,
        'vehicle_id', v_shift.vehicle_id,
        'phase', p_phase,
        'odometer_reading', p_odometer_reading,
        'reason', v_reason
      ),
      v_reason
    );
  end if;

  return v_shift;
end;
$$;

revoke all on function public.admin_update_shift_odometer_reading(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_shift_odometer_reading(uuid, text, bigint, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
