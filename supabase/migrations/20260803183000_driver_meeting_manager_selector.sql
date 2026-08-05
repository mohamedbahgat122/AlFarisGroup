alter table public.driver_app_meeting_request_details
  add column if not exists requested_manager_user_id uuid
    references public.profiles(id) on delete set null;

create index if not exists driver_app_meeting_requested_manager_idx
  on public.driver_app_meeting_request_details (requested_manager_user_id);

create or replace function public.is_meeting_manager_eligible(
  target_user_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role in (
        'system_owner'::public.app_role,
        'manager'::public.app_role,
        'supervisor'::public.app_role
      )
      and (
        p.role = 'system_owner'::public.app_role
        or public.has_organization_permission(p.id, target_organization_id, 'app_requests.view')
      )
  );
$$;

revoke all on function public.is_meeting_manager_eligible(uuid, uuid)
  from public, anon;
grant execute on function public.is_meeting_manager_eligible(uuid, uuid)
  to authenticated;

create or replace function public.list_driver_meeting_manager_options()
returns table (
  profile_id uuid,
  display_name text,
  job_title text,
  role public.app_role
)
language sql
stable
security definer
set search_path = ''
as $$
  with current_driver as (
    select *
    from public.get_authenticated_driver_for_request()
  )
  select
    p.id as profile_id,
    p.full_name as display_name,
    p.job_title,
    p.role
  from public.profiles p
  cross join current_driver d
  where public.is_meeting_manager_eligible(p.id, d.organization_id)
  order by p.full_name asc;
$$;

revoke all on function public.list_driver_meeting_manager_options()
  from public, anon;
grant execute on function public.list_driver_meeting_manager_options()
  to authenticated;

drop function if exists public.submit_driver_meeting_request(
  text,
  text,
  date,
  time without time zone
);

drop function if exists public.submit_driver_meeting_request(
  text,
  text,
  date,
  time without time zone,
  uuid
);

create or replace function public.submit_driver_meeting_request(
  p_subject text,
  p_reason text,
  p_requested_manager_user_id uuid,
  p_preferred_date date default null::date,
  p_preferred_time time without time zone default null::time without time zone,
  p_submission_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers%rowtype := public.get_authenticated_driver_for_request();
  v_vehicle record;
  v_request public.driver_app_requests%rowtype;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_manager public.profiles%rowtype;
  v_has_any_org_access boolean := false;
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

  if p_requested_manager_user_id is null then
    raise exception 'meeting_manager_required';
  end if;

  select *
    into v_manager
  from public.profiles p
  where p.id = p_requested_manager_user_id;

  if not found then
    raise exception 'meeting_manager_not_found';
  end if;

  if v_manager.status <> 'active'::public.account_status or v_manager.deleted_at is not null then
    raise exception 'meeting_manager_inactive';
  end if;

  if v_manager.role not in (
    'system_owner'::public.app_role,
    'manager'::public.app_role,
    'supervisor'::public.app_role
  ) then
    raise exception 'meeting_manager_not_authorized';
  end if;

  if v_manager.role <> 'system_owner'::public.app_role then
    select exists (
      select 1
      from public.organization_user_permissions oup
      where oup.user_id = v_manager.id
        and oup.organization_id = v_driver.organization_id
    )
    into v_has_any_org_access;

    if not v_has_any_org_access then
      raise exception 'meeting_manager_organization_mismatch';
    end if;

    if not public.has_organization_permission(v_manager.id, v_driver.organization_id, 'app_requests.view') then
      raise exception 'meeting_manager_not_authorized';
    end if;
  end if;

  if length(v_subject) = 0 or length(v_subject) > 160 then
    raise exception 'APP_REQUEST_SUBJECT_REQUIRED';
  end if;

  if length(v_reason) = 0 or length(v_reason) > 1500 then
    raise exception 'APP_REQUEST_REASON_REQUIRED';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where driver_id = v_driver.id
    and client_submission_id = p_submission_id;

  if found then
    return jsonb_build_object('id', v_request.id, 'request_type', 'meeting', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
  end if;

  select * into v_vehicle from public.get_driver_current_vehicle(v_driver.id) limit 1;

  begin
    insert into public.driver_app_requests (
      organization_id,
      driver_id,
      vehicle_id,
      vehicle_plate_snapshot,
      request_type,
      submitted_note,
      client_submission_id
    )
    values (
      v_driver.organization_id,
      v_driver.id,
      v_vehicle.vehicle_id,
      coalesce(v_vehicle.plate_number, nullif(v_driver.keeta_vehicle_plate_number, ''), nullif(v_driver.vehicle_number, '')),
      'meeting',
      v_reason,
      p_submission_id
    )
    returning * into v_request;

    v_created := true;
  exception when unique_violation then
    select *
      into v_request
    from public.driver_app_requests
    where driver_id = v_driver.id
      and client_submission_id = p_submission_id;
  end;

  if not found and v_request.id is null then
    raise exception 'APP_REQUEST_INSERT_FAILED';
  end if;

  if v_created then
    insert into public.driver_app_meeting_request_details (
      request_id,
      subject,
      reason,
      preferred_date,
      preferred_time,
      requested_manager_user_id
    )
    values (
      v_request.id,
      v_subject,
      v_reason,
      p_preferred_date,
      p_preferred_time,
      p_requested_manager_user_id
    );

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'meeting', 'pending'
    );
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'meeting', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

revoke all on function public.submit_driver_meeting_request(
  text,
  text,
  uuid,
  date,
  time without time zone,
  uuid
) from public, anon;
grant execute on function public.submit_driver_meeting_request(
  text,
  text,
  uuid,
  date,
  time without time zone,
  uuid
) to authenticated;

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
            and public.has_organization_permission(p.id, new.organization_id, 'app_requests.view')
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

notify pgrst, 'reload schema';
