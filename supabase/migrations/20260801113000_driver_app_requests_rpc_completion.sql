-- Complete Driver App Requests RPC activation without changing permissions or unrelated schema.

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text
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
begin
  select * into v_vehicle from public.get_driver_current_vehicle(v_driver.id) limit 1;

  if v_vehicle.vehicle_id is null then
    raise exception 'APP_REQUEST_VEHICLE_REQUIRED';
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

  insert into public.driver_app_requests (
    organization_id,
    driver_id,
    vehicle_id,
    vehicle_plate_snapshot,
    request_type,
    submitted_note
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_vehicle.plate_number,
    'maintenance',
    v_problem
  )
  returning * into v_request;

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

  return jsonb_build_object('id', v_request.id, 'request_type', 'maintenance', 'status', 'pending', 'submitted_at', v_request.submitted_at);
end;
$$;

create or replace function public.submit_driver_meeting_request(
  p_subject text,
  p_reason text,
  p_preferred_date date default null,
  p_preferred_time time default null
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
begin
  if length(v_subject) = 0 or length(v_subject) > 160 then
    raise exception 'APP_REQUEST_SUBJECT_REQUIRED';
  end if;

  if length(v_reason) = 0 or length(v_reason) > 1500 then
    raise exception 'APP_REQUEST_REASON_REQUIRED';
  end if;

  select * into v_vehicle from public.get_driver_current_vehicle(v_driver.id) limit 1;

  insert into public.driver_app_requests (
    organization_id,
    driver_id,
    vehicle_id,
    vehicle_plate_snapshot,
    request_type,
    submitted_note
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    coalesce(v_vehicle.plate_number, nullif(v_driver.keeta_vehicle_plate_number, ''), nullif(v_driver.vehicle_number, '')),
    'meeting',
    v_reason
  )
  returning * into v_request;

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

  return jsonb_build_object('id', v_request.id, 'request_type', 'meeting', 'status', 'pending', 'submitted_at', v_request.submitted_at);
end;
$$;

create or replace function public.submit_driver_oil_change_request(
  p_current_odometer_reading bigint,
  p_note text default null
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
begin
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

  insert into public.driver_app_requests (
    organization_id,
    driver_id,
    vehicle_id,
    vehicle_plate_snapshot,
    request_type,
    submitted_note
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_vehicle.plate_number,
    'oil_change',
    v_note
  )
  returning * into v_request;

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

  return jsonb_build_object('id', v_request.id, 'request_type', 'oil_change', 'status', 'pending', 'submitted_at', v_request.submitted_at);
end;
$$;

revoke all on function public.submit_driver_maintenance_request(text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_driver_meeting_request(text, text, date, time)
  from public, anon, authenticated;
revoke all on function public.submit_driver_oil_change_request(bigint, text)
  from public, anon, authenticated;

grant execute on function public.submit_driver_maintenance_request(text, text, text)
  to authenticated;
grant execute on function public.submit_driver_meeting_request(text, text, date, time)
  to authenticated;
grant execute on function public.submit_driver_oil_change_request(bigint, text)
  to authenticated;

notify pgrst, 'reload schema';
