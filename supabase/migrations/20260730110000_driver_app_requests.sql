-- Driver App Requests module.

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key in (
      'organization.dashboard.view',
      'drivers.view',
      'drivers.create',
      'drivers.update',
      'drivers.status',
      'drivers.archive',
      'drivers.documents.view',
      'drivers.documents.download',
      'drivers.activity.view',
      'drivers.account.manage',
      'driver_reports.view',
      'driver_reports.import',
      'driver_reports.replace',
      'driver_reports.details.view',
      'fleet.cars.view',
      'fleet.motorcycles.view',
      'fleet.create',
      'fleet.update',
      'fleet.technical_status',
      'fleet.operational_status',
      'fleet.archive',
      'fleet.operating_card.download',
      'fleet.activity.view',
      'fuel.manage',
      'fuel.reports.view',
      'fuel.increase.review',
      'app_requests.view',
      'app_requests.review',
      'odometer.manage',
      'notifications.view',
      'driver_warnings.view',
      'driver_warnings.issue',
      'driver_warnings.revoke',
      'shifts.view',
      'shifts.create',
      'shifts.update',
      'shifts.assign',
      'shifts.archive'
    )
  );

insert into public.organization_user_permissions (
  user_id,
  organization_id,
  permission_key,
  granted_by,
  updated_by
)
select
  oa.user_id,
  oa.organization_id,
  permission_key,
  oa.user_id,
  oa.user_id
from public.organization_access oa
cross join lateral (
  values
    ('app_requests.view'),
    ('app_requests.review'),
    ('odometer.manage')
) as app_request_permissions(permission_key)
where oa.access_level = 'manage'::public.organization_access_level
on conflict (user_id, organization_id, permission_key) do nothing;

create table if not exists public.driver_app_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid null references public.fleet_vehicles(id) on delete set null,
  vehicle_plate_snapshot text null,
  request_type text not null,
  status text not null default 'pending',
  submitted_note text null,
  submitted_at timestamptz not null default timezone('utc', now()),
  reviewed_by uuid null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  review_note text null,
  completed_by uuid null references public.profiles(id) on delete restrict,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_app_requests_type_check check (
    request_type in ('leave', 'maintenance', 'meeting', 'oil_change')
  ),
  constraint driver_app_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'completed', 'cancelled')
  ),
  constraint driver_app_requests_review_shape_check check (
    (
      status in ('pending', 'cancelled')
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected', 'completed')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  ),
  constraint driver_app_requests_completion_shape_check check (
    (
      status <> 'completed'
      and completed_by is null
      and completed_at is null
    )
    or (
      status = 'completed'
      and completed_by is not null
      and completed_at is not null
    )
  )
);

create table if not exists public.driver_app_leave_request_details (
  request_id uuid primary key references public.driver_app_requests(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  constraint driver_app_leave_type_check check (
    leave_type in ('annual', 'sick', 'emergency', 'unpaid', 'other')
  ),
  constraint driver_app_leave_date_order_check check (end_date >= start_date),
  constraint driver_app_leave_reason_not_blank check (length(btrim(reason)) between 1 and 1000)
);

create table if not exists public.driver_app_maintenance_request_details (
  request_id uuid primary key references public.driver_app_requests(id) on delete cascade,
  maintenance_category text not null,
  problem_description text not null,
  urgency text not null,
  constraint driver_app_maintenance_category_not_blank check (
    length(btrim(maintenance_category)) between 1 and 120
  ),
  constraint driver_app_maintenance_problem_not_blank check (
    length(btrim(problem_description)) between 1 and 1500
  ),
  constraint driver_app_maintenance_urgency_check check (urgency in ('normal', 'urgent'))
);

create table if not exists public.driver_app_meeting_request_details (
  request_id uuid primary key references public.driver_app_requests(id) on delete cascade,
  subject text not null,
  reason text not null,
  preferred_date date null,
  preferred_time time null,
  scheduled_at timestamptz null,
  constraint driver_app_meeting_subject_not_blank check (length(btrim(subject)) between 1 and 160),
  constraint driver_app_meeting_reason_not_blank check (length(btrim(reason)) between 1 and 1500)
);

create table if not exists public.driver_app_oil_change_request_details (
  request_id uuid primary key references public.driver_app_requests(id) on delete cascade,
  current_odometer_reading bigint not null,
  note text null,
  scheduled_at timestamptz null,
  constraint driver_app_oil_change_reading_non_negative check (current_odometer_reading >= 0)
);

create index if not exists driver_app_requests_org_type_status_submitted_idx
  on public.driver_app_requests (organization_id, request_type, status, submitted_at desc);

create index if not exists driver_app_requests_driver_submitted_idx
  on public.driver_app_requests (driver_id, submitted_at desc);

create or replace function public.set_driver_app_requests_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_driver_app_requests_updated_at on public.driver_app_requests;
create trigger set_driver_app_requests_updated_at
  before update on public.driver_app_requests
  for each row
  execute function public.set_driver_app_requests_updated_at();

create or replace function public.insert_driver_app_request_activity(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_driver_id uuid,
  p_request_id uuid,
  p_action text,
  p_request_type text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_logs (
    actor_user_id,
    target_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  )
  values (
    p_actor_user_id,
    null,
    p_organization_id,
    p_action,
    'driver_app_request',
    p_request_id,
    jsonb_build_object(
      'driver_id', p_driver_id,
      'request_type', p_request_type,
      'status', p_status
    ),
    jsonb_build_object('source', 'driver_app_requests')
  );
end;
$$;

create or replace function public.get_authenticated_driver_for_request()
returns public.drivers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
begin
  if v_user_id is null then
    raise exception 'APP_REQUEST_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'APP_REQUEST_PROFILE_UNAVAILABLE';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'APP_REQUEST_DRIVER_UNAVAILABLE';
  end if;

  return v_driver;
end;
$$;

create or replace function public.submit_driver_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text
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
begin
  if p_leave_type not in ('annual', 'sick', 'emergency', 'unpaid', 'other') then
    raise exception 'APP_REQUEST_INVALID_LEAVE_TYPE';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'APP_REQUEST_INVALID_DATE_RANGE';
  end if;

  if length(v_reason) = 0 or length(v_reason) > 1000 then
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
    'leave',
    v_reason
  )
  returning * into v_request;

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

  return jsonb_build_object('id', v_request.id, 'request_type', 'leave', 'status', 'pending', 'submitted_at', v_request.submitted_at);
end;
$$;

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

alter table public.driver_app_requests enable row level security;
alter table public.driver_app_leave_request_details enable row level security;
alter table public.driver_app_maintenance_request_details enable row level security;
alter table public.driver_app_meeting_request_details enable row level security;
alter table public.driver_app_oil_change_request_details enable row level security;

revoke all on public.driver_app_requests from anon;
revoke all on public.driver_app_leave_request_details from anon;
revoke all on public.driver_app_maintenance_request_details from anon;
revoke all on public.driver_app_meeting_request_details from anon;
revoke all on public.driver_app_oil_change_request_details from anon;

grant select on public.driver_app_requests to authenticated;
grant select on public.driver_app_leave_request_details to authenticated;
grant select on public.driver_app_maintenance_request_details to authenticated;
grant select on public.driver_app_meeting_request_details to authenticated;
grant select on public.driver_app_oil_change_request_details to authenticated;

grant select, insert, update, delete on public.driver_app_requests to service_role;
grant select, insert, update, delete on public.driver_app_leave_request_details to service_role;
grant select, insert, update, delete on public.driver_app_maintenance_request_details to service_role;
grant select, insert, update, delete on public.driver_app_meeting_request_details to service_role;
grant select, insert, update, delete on public.driver_app_oil_change_request_details to service_role;

drop policy if exists driver_app_requests_select_own_driver on public.driver_app_requests;
create policy driver_app_requests_select_own_driver
  on public.driver_app_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      where d.id = driver_app_requests.driver_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
    )
  );

drop policy if exists driver_app_requests_select_dashboard on public.driver_app_requests;
create policy driver_app_requests_select_dashboard
  on public.driver_app_requests
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'app_requests.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'app_requests.review')
    or public.has_organization_permission(auth.uid(), organization_id, 'odometer.manage')
  );

drop policy if exists driver_app_leave_details_select_with_request on public.driver_app_leave_request_details;
create policy driver_app_leave_details_select_with_request
  on public.driver_app_leave_request_details
  for select
  to authenticated
  using (exists (select 1 from public.driver_app_requests r where r.id = request_id));

drop policy if exists driver_app_maintenance_details_select_with_request on public.driver_app_maintenance_request_details;
create policy driver_app_maintenance_details_select_with_request
  on public.driver_app_maintenance_request_details
  for select
  to authenticated
  using (exists (select 1 from public.driver_app_requests r where r.id = request_id));

drop policy if exists driver_app_meeting_details_select_with_request on public.driver_app_meeting_request_details;
create policy driver_app_meeting_details_select_with_request
  on public.driver_app_meeting_request_details
  for select
  to authenticated
  using (exists (select 1 from public.driver_app_requests r where r.id = request_id));

drop policy if exists driver_app_oil_change_details_select_with_request on public.driver_app_oil_change_request_details;
create policy driver_app_oil_change_details_select_with_request
  on public.driver_app_oil_change_request_details
  for select
  to authenticated
  using (exists (select 1 from public.driver_app_requests r where r.id = request_id));

revoke all on function public.insert_driver_app_request_activity(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_authenticated_driver_for_request()
  from public, anon, authenticated;
revoke all on function public.submit_driver_leave_request(text, date, date, text)
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_driver_meeting_request(text, text, date, time)
  from public, anon, authenticated;
revoke all on function public.submit_driver_oil_change_request(bigint, text)
  from public, anon, authenticated;

grant execute on function public.submit_driver_leave_request(text, date, date, text)
  to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text)
  to authenticated;
grant execute on function public.submit_driver_meeting_request(text, text, date, time)
  to authenticated;
grant execute on function public.submit_driver_oil_change_request(bigint, text)
  to authenticated;
