-- Add per-submission idempotency for Driver PWA request forms.
-- The column is nullable so existing rows and legacy callers keep working.

alter table public.driver_app_requests
  add column if not exists client_submission_id uuid;

create unique index if not exists driver_app_requests_driver_submission_key
  on public.driver_app_requests (driver_id, client_submission_id)
  where client_submission_id is not null;

create or replace function public.submit_driver_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_submission_id uuid
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
  v_reason text := btrim(coalesce(p_reason, ''));
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

  if p_leave_type not in ('annual', 'sick', 'weekly') then
    raise exception 'APP_REQUEST_INVALID_LEAVE_TYPE';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'APP_REQUEST_INVALID_DATE_RANGE';
  end if;

  if length(v_reason) = 0 or length(v_reason) > 1000 then
    raise exception 'APP_REQUEST_REASON_REQUIRED';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where driver_id = v_driver.id
    and client_submission_id = p_submission_id;

  if found then
    return jsonb_build_object('id', v_request.id, 'request_type', 'leave', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
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
      'leave',
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
    insert into public.driver_app_leave_request_details (
      request_id,
      leave_type,
      start_date,
      end_date,
      reason
    )
    values (v_request.id, p_leave_type, p_start_date, p_end_date, v_reason);

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'leave', 'pending'
    );
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'leave', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text,
  p_submission_id uuid
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
  v_category text := btrim(coalesce(p_maintenance_category, ''));
  v_problem text := btrim(coalesce(p_problem_description, ''));
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

  if length(v_category) = 0 or length(v_category) > 120 then
    raise exception 'APP_REQUEST_CATEGORY_REQUIRED';
  end if;

  if p_urgency not in ('normal', 'urgent') then
    raise exception 'APP_REQUEST_INVALID_URGENCY';
  end if;

  if length(v_problem) = 0 or length(v_problem) > 1500 then
    raise exception 'APP_REQUEST_DESCRIPTION_REQUIRED';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where driver_id = v_driver.id
    and client_submission_id = p_submission_id;

  if found then
    return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
  end if;

  select *
    into v_vehicle
  from public.resolve_driver_current_vehicle(v_driver.id)
  limit 1;

  if v_vehicle.vehicle_id is null or v_vehicle.resolution_code <> 'ok' then
    raise exception '%', coalesce(v_vehicle.resolution_code, 'vehicle_not_linked');
  end if;

  if v_vehicle.organization_id <> v_driver.organization_id then
    raise exception 'vehicle_organization_mismatch';
  end if;

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
      v_vehicle.plate_number,
      'maintenance',
      v_problem,
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
    insert into public.driver_app_maintenance_request_details (
      request_id,
      maintenance_category,
      problem_description,
      urgency
    )
    values (v_request.id, v_category, v_problem, p_urgency);

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'maintenance', 'pending'
    );
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

create or replace function public.submit_driver_meeting_request(
  p_subject text,
  p_reason text,
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
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
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
      preferred_time
    )
    values (v_request.id, v_subject, v_reason, p_preferred_date, p_preferred_time);

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'meeting', 'pending'
    );
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'meeting', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

create or replace function public.submit_driver_oil_change_request(
  p_current_odometer_reading bigint,
  p_note text default null::text,
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
  v_latest_odometer bigint;
  v_request public.driver_app_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_created boolean := false;
begin
  if p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where driver_id = v_driver.id
    and client_submission_id = p_submission_id;

  if found then
    return jsonb_build_object('id', v_request.id, 'request_type', 'oil_change', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
  end if;

  select * into v_vehicle from public.get_driver_current_vehicle(v_driver.id) limit 1;

  if v_vehicle.vehicle_id is null then
    raise exception 'APP_REQUEST_VEHICLE_REQUIRED';
  end if;

  if p_current_odometer_reading is null or p_current_odometer_reading < 0 or p_current_odometer_reading > 2147483647 then
    raise exception 'APP_REQUEST_INVALID_ODOMETER';
  end if;

  select ds.end_odometer_reading
    into v_latest_odometer
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'completed'
    and ds.end_odometer_reading is not null
  order by ds.ended_at desc nulls last, ds.created_at desc
  limit 1;

  if v_latest_odometer is not null and p_current_odometer_reading < v_latest_odometer then
    raise exception 'APP_REQUEST_ODOMETER_BELOW_LATEST';
  end if;

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
      v_vehicle.plate_number,
      'oil_change',
      v_note,
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
    insert into public.driver_app_oil_change_request_details (
      request_id,
      current_odometer_reading,
      note
    )
    values (v_request.id, p_current_odometer_reading, v_note);

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'oil_change', 'pending'
    );
  end if;

  return jsonb_build_object('id', v_request.id, 'request_type', 'oil_change', 'status', v_request.status, 'submitted_at', v_request.submitted_at);
end;
$$;

revoke all on function public.submit_driver_leave_request(text, date, date, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_driver_meeting_request(text, text, date, time, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_driver_oil_change_request(bigint, text, uuid)
  from public, anon, authenticated;

grant execute on function public.submit_driver_leave_request(text, date, date, text, uuid)
  to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text, uuid)
  to authenticated;
grant execute on function public.submit_driver_meeting_request(text, text, date, time, uuid)
  to authenticated;
grant execute on function public.submit_driver_oil_change_request(bigint, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
