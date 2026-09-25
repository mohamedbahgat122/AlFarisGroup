-- Add normalized maintenance request/job categories while retaining the legacy
-- text projections for existing readers and old RPC callers.

create table if not exists public.driver_app_maintenance_request_categories (
  request_id uuid not null
    references public.driver_app_requests(id)
    on delete cascade,
  category text not null,
  constraint driver_app_maintenance_request_categories_pkey
    primary key (request_id, category),
  constraint driver_app_maintenance_request_categories_category_check
    check (category in (
      'تغيير كفرات',
      'صيانة كهرباء',
      'صيانة مكيف',
      'صيانة عفشة',
      'صيانة مكينة'
    ))
);

create index if not exists driver_app_maintenance_request_categories_category_idx
  on public.driver_app_maintenance_request_categories(category);

create table if not exists public.maintenance_job_categories (
  maintenance_job_id uuid not null
    references public.maintenance_jobs(id)
    on delete cascade,
  category text not null,
  constraint maintenance_job_categories_pkey
    primary key (maintenance_job_id, category),
  constraint maintenance_job_categories_category_check
    check (category in (
      'تغيير كفرات',
      'صيانة كهرباء',
      'صيانة مكيف',
      'صيانة عفشة',
      'صيانة مكينة'
    ))
);

create index if not exists maintenance_job_categories_category_idx
  on public.maintenance_job_categories(category);

alter table public.driver_app_maintenance_request_categories enable row level security;
alter table public.maintenance_job_categories enable row level security;

revoke all on public.driver_app_maintenance_request_categories from public, anon, authenticated;
revoke all on public.maintenance_job_categories from public, anon, authenticated;

grant select on public.driver_app_maintenance_request_categories to authenticated;
grant select on public.maintenance_job_categories to authenticated;
grant select, insert, update, delete on public.driver_app_maintenance_request_categories to service_role;
grant select, insert, update, delete on public.maintenance_job_categories to service_role;

drop policy if exists driver_app_maintenance_request_categories_select_with_request
  on public.driver_app_maintenance_request_categories;
create policy driver_app_maintenance_request_categories_select_with_request
  on public.driver_app_maintenance_request_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.driver_app_requests r
      where r.id = request_id
    )
  );

drop policy if exists maintenance_job_categories_select_with_job
  on public.maintenance_job_categories;
create policy maintenance_job_categories_select_with_job
  on public.maintenance_job_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.maintenance_jobs j
      where j.id = maintenance_job_id
    )
  );

create or replace function public.submit_driver_maintenance_request_normalized(
  p_maintenance_categories text[],
  p_urgency text,
  p_problem_description text,
  p_submission_id uuid default null,
  p_require_submission_id boolean default false
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
  v_categories text[];
  v_category_count integer;
  v_distinct_category_count integer;
  v_category_display text;
  v_problem text := btrim(coalesce(p_problem_description, ''));
  v_created boolean := false;
begin
  if p_require_submission_id and p_submission_id is null then
    raise exception 'APP_REQUEST_SUBMISSION_REQUIRED';
  end if;

  if p_maintenance_categories is null
    or cardinality(p_maintenance_categories) = 0
  then
    raise exception 'APP_REQUEST_CATEGORY_REQUIRED';
  end if;

  if exists (
    select 1
    from unnest(p_maintenance_categories) as input(category)
    where input.category is null
      or length(btrim(input.category)) = 0
  ) then
    raise exception 'APP_REQUEST_CATEGORY_REQUIRED';
  end if;

  select
    array_agg(allowed.category order by allowed.sort_order),
    count(*)::integer
    into v_categories, v_category_count
  from (
    select distinct btrim(input.category) as category
    from unnest(p_maintenance_categories) as input(category)
  ) input
  join (
    values
            (U&'\062A\063A\064A\064A\0631 \0643\0641\0631\0627\062A'::text, 1),
      (U&'\0635\064A\0627\0646\0629 \0643\0647\0631\0628\0627\0621'::text, 2),
      (U&'\0635\064A\0627\0646\0629 \0645\0643\064A\0641'::text, 3),
      (U&'\0635\064A\0627\0646\0629 \0639\0641\0634\0629'::text, 4),
      (U&'\0635\064A\0627\0646\0629 \0645\0643\064A\0646\0629'::text, 5)
  ) as allowed(category, sort_order)
    on allowed.category = input.category;

  select count(distinct btrim(input.category))::integer
    into v_distinct_category_count
  from unnest(p_maintenance_categories) as input(category);

  if v_category_count is distinct from v_distinct_category_count
    or v_category_count = 0
  then
    raise exception 'APP_REQUEST_INVALID_CATEGORY';
  end if;

  if p_urgency is null or p_urgency not in ('normal', 'urgent') then
    raise exception 'APP_REQUEST_INVALID_URGENCY';
  end if;

  if length(v_problem) = 0 or length(v_problem) > 1500 then
    raise exception 'APP_REQUEST_DESCRIPTION_REQUIRED';
  end if;

  if p_submission_id is not null then
    select *
      into v_request
    from public.driver_app_requests
    where driver_id = v_driver.id
      and client_submission_id = p_submission_id;

    if found then
      return jsonb_build_object(
        'id', v_request.id,
        'request_type', 'maintenance',
        'status', v_request.status,
        'submitted_at', v_request.submitted_at
      );
    end if;
  end if;

  select *
    into v_vehicle
  from public.resolve_driver_current_vehicle(v_driver.id)
  limit 1;

  if v_vehicle.vehicle_id is null or v_vehicle.resolution_code <> 'ok' then
    raise exception '%', coalesce(v_vehicle.resolution_code, 'vehicle_not_linked');
  end if;

  v_category_display := array_to_string(v_categories, U&'\060C ');

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
    if p_submission_id is null then
      raise;
    end if;

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
    values (v_request.id, v_category_display, v_problem, p_urgency);

    insert into public.driver_app_maintenance_request_categories (request_id, category)
    select v_request.id, category
    from unnest(v_categories) as normalized(category);

    perform public.insert_driver_app_request_activity(
      auth.uid(), v_driver.organization_id, v_driver.id, v_request.id,
      'driver_app_request_submitted', 'maintenance', 'pending'
    );
  end if;

  return jsonb_build_object(
    'id', v_request.id,
    'request_type', 'maintenance',
    'status', v_request.status,
    'submitted_at', v_request.submitted_at
  );
end;
$$;

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_categories text[],
  p_urgency text,
  p_problem_description text,
  p_submission_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.submit_driver_maintenance_request_normalized(
    p_maintenance_categories,
    p_urgency,
    p_problem_description,
    p_submission_id,
    true
  );
$$;

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text,
  p_submission_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.submit_driver_maintenance_request_normalized(
    array[p_maintenance_category],
    p_urgency,
    p_problem_description,
    p_submission_id,
    true
  );
$$;

create or replace function public.submit_driver_maintenance_request(
  p_maintenance_category text,
  p_urgency text,
  p_problem_description text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.submit_driver_maintenance_request_normalized(
    array[p_maintenance_category],
    p_urgency,
    p_problem_description,
    null,
    false
  );
$$;

revoke all on function public.submit_driver_maintenance_request_normalized(text[], text, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text[], text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_driver_maintenance_request(text, text, text)
  from public, anon, authenticated;

grant execute on function public.submit_driver_maintenance_request(text[], text, text, uuid)
  to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text, uuid)
  to authenticated;
grant execute on function public.submit_driver_maintenance_request(text, text, text)
  to authenticated;

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
  v_categories text[];
  v_category_snapshot text;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_request
  from public.driver_app_requests
  where id = p_request_id and request_type in ('maintenance', 'oil_change')
  for update;
  if not found then
    raise exception 'MAINTENANCE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    (public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review')
      or public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.maintenance.review'))
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
    select 1 from public.maintenance_providers mp
    join public.maintenance_provider_organizations mpo
      on mpo.provider_id = mp.id
     and mpo.organization_id = v_request.organization_id
     and mpo.is_active = true
    where mp.id = p_provider_id and mp.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  select * into v_existing_job
  from public.maintenance_jobs
  where request_id = v_request.id
  for update;
  if found then
    if v_existing_job.provider_id = p_provider_id and v_request.status = 'approved' then
      return jsonb_build_object('id', v_existing_job.id, 'request_id', v_existing_job.request_id,
        'job_type', v_existing_job.job_type, 'status', v_existing_job.status, 'already_exists', true);
    end if;
    raise exception 'MAINTENANCE_JOB_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if v_request.status = 'pending' then
    update public.driver_app_requests
    set status = 'approved', reviewed_by = v_actor_id, reviewed_at = v_now,
        review_note = v_notes, updated_at = v_now
    where id = v_request.id and status = 'pending'
    returning * into v_request;
    if not found then
      raise exception 'MAINTENANCE_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
    end if;
    perform public.insert_driver_app_request_activity(v_actor_id, v_request.organization_id,
      v_request.driver_id, v_request.id, 'driver_app_request_approved', v_request.request_type, 'approved');
  end if;

  select d.full_name into v_driver_name from public.drivers d where d.id = v_request.driver_id;
  select fv.vehicle_type into v_vehicle_type from public.fleet_vehicles fv where fv.id = v_request.vehicle_id;

  if v_request.request_type = 'maintenance' then
    select * into v_maintenance_detail
    from public.driver_app_maintenance_request_details
    where request_id = v_request.id;
    select array_agg(c.category order by case c.category
      when U&'\062A\063A\064A\064A\0631 \0643\0641\0631\0627\062A' then 1
      when U&'\0635\064A\0627\0646\0629 \0643\0647\0631\0628\0627\0621' then 2
      when U&'\0635\064A\0627\0646\0629 \0645\0643\064A\0641' then 3
      when U&'\0635\064A\0627\0646\0629 \0639\0641\0634\0629' then 4
      when U&'\0635\064A\0627\0646\0629 \0645\0643\064A\0646\0629' then 5 end)
      into v_categories
    from public.driver_app_maintenance_request_categories c
    where c.request_id = v_request.id;
    v_category_snapshot := coalesce(array_to_string(v_categories, U&'\060C '), v_maintenance_detail.maintenance_category);
  elsif v_request.request_type = 'oil_change' then
    select * into v_oil_detail
    from public.driver_app_oil_change_request_details
    where request_id = v_request.id;
  end if;

  insert into public.maintenance_jobs (
    request_id, organization_id, provider_id, driver_id, vehicle_id, job_type, status,
    assigned_at, assigned_by, notes, driver_name_snapshot, vehicle_plate_snapshot,
    vehicle_type_snapshot, request_description_snapshot, maintenance_category_snapshot,
    urgency_snapshot, requested_odometer_snapshot
  ) values (
    v_request.id, v_request.organization_id, p_provider_id, v_request.driver_id, v_request.vehicle_id,
    v_request.request_type, 'ready', v_now, v_actor_id, v_notes, v_driver_name,
    v_request.vehicle_plate_snapshot, v_vehicle_type,
    coalesce(v_maintenance_detail.problem_description, v_request.submitted_note),
    v_category_snapshot, v_maintenance_detail.urgency, v_oil_detail.current_odometer_reading
  ) returning * into v_job;

  if v_request.request_type = 'maintenance' then
    insert into public.maintenance_job_categories (maintenance_job_id, category)
    select v_job.id, c.category
    from public.driver_app_maintenance_request_categories c
    where c.request_id = v_request.id;
  end if;

  perform public.insert_maintenance_activity_log(v_actor_id, v_job.organization_id,
    'maintenance_job_assigned', 'maintenance_job', v_job.id, null, to_jsonb(v_job),
    jsonb_build_object('request_id', v_job.request_id, 'provider_id', v_job.provider_id));

  return jsonb_build_object('id', v_job.id, 'request_id', v_job.request_id,
    'job_type', v_job.job_type, 'status', v_job.status, 'already_exists', false);
end;
$$;

revoke all on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
