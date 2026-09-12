alter type public.app_role add value if not exists 'maintenance_partner';

create or replace function public.organization_permission_keys()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
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
    'entitlements.view',
    'entitlements.create_transaction',
    'entitlements.view_transactions',
    'entitlements.reverse_transaction',
    'entitlements.publish',
    'shifts.view',
    'shifts.create',
    'shifts.update',
    'shifts.assign',
    'shifts.archive',
    'maintenance_providers.view',
    'maintenance_providers.manage',
    'maintenance_jobs.view',
    'maintenance_jobs.assign',
    'maintenance_jobs.cancel'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key = any(public.organization_permission_keys())
  );

create table if not exists public.maintenance_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  contact_name text null,
  contact_phone text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_providers_name_not_blank check (
    length(btrim(name)) between 1 and 160
  ),
  constraint maintenance_providers_code_not_blank check (
    length(btrim(code)) between 1 and 80
  ),
  constraint maintenance_providers_code_key unique (code)
);

create table if not exists public.maintenance_provider_organizations (
  provider_id uuid not null references public.maintenance_providers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_provider_organizations_pkey primary key (provider_id, organization_id)
);

create table if not exists public.maintenance_provider_users (
  provider_id uuid not null references public.maintenance_providers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_provider_users_pkey primary key (provider_id, user_id),
  constraint maintenance_provider_users_role_check check (
    role in ('owner', 'manager', 'technician')
  )
);

create table if not exists public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.driver_app_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  job_type text not null,
  status text not null default 'ready',
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz null,
  started_by uuid null references public.profiles(id) on delete set null,
  completed_at timestamptz null,
  completed_by uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  notes text null,
  completion_notes text null,
  oil_interval_km integer null,
  driver_name_snapshot text null,
  vehicle_plate_snapshot text null,
  vehicle_type_snapshot text null,
  request_description_snapshot text null,
  maintenance_category_snapshot text null,
  urgency_snapshot text null,
  requested_odometer_snapshot bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_jobs_request_key unique (request_id),
  constraint maintenance_jobs_job_type_check check (
    job_type in ('maintenance', 'oil_change')
  ),
  constraint maintenance_jobs_status_check check (
    status in ('ready', 'in_progress', 'completed', 'cancelled')
  ),
  constraint maintenance_jobs_oil_interval_check check (
    oil_interval_km is null or (oil_interval_km > 0 and oil_interval_km <= 2147483647)
  ),
  constraint maintenance_jobs_requested_odometer_check check (
    requested_odometer_snapshot is null
    or (requested_odometer_snapshot >= 0 and requested_odometer_snapshot <= 2147483647)
  ),
  constraint maintenance_jobs_status_shape_check check (
    (
      status = 'ready'
      and started_at is null
      and started_by is null
      and completed_at is null
      and completed_by is null
      and cancelled_at is null
      and cancelled_by is null
    )
    or (
      status = 'in_progress'
      and started_at is not null
      and started_by is not null
      and completed_at is null
      and completed_by is null
      and cancelled_at is null
      and cancelled_by is null
    )
    or (
      status = 'completed'
      and started_at is not null
      and started_by is not null
      and completed_at is not null
      and completed_by is not null
      and cancelled_at is null
      and cancelled_by is null
    )
    or (
      status = 'cancelled'
      and completed_at is null
      and completed_by is null
      and cancelled_at is not null
      and cancelled_by is not null
    )
  )
);

create index if not exists maintenance_provider_organizations_org_idx
  on public.maintenance_provider_organizations (organization_id, is_active);

create index if not exists maintenance_provider_users_user_idx
  on public.maintenance_provider_users (user_id, is_active);

create index if not exists maintenance_jobs_provider_status_idx
  on public.maintenance_jobs (provider_id, status, assigned_at desc);

create index if not exists maintenance_jobs_organization_status_idx
  on public.maintenance_jobs (organization_id, status, assigned_at desc);

create index if not exists maintenance_jobs_vehicle_idx
  on public.maintenance_jobs (vehicle_id, assigned_at desc);

create index if not exists maintenance_jobs_driver_idx
  on public.maintenance_jobs (driver_id, assigned_at desc);

create or replace function public.set_maintenance_partner_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maintenance_providers_updated_at
  on public.maintenance_providers;
create trigger set_maintenance_providers_updated_at
  before update on public.maintenance_providers
  for each row
  execute function public.set_maintenance_partner_updated_at();

drop trigger if exists set_maintenance_provider_users_updated_at
  on public.maintenance_provider_users;
create trigger set_maintenance_provider_users_updated_at
  before update on public.maintenance_provider_users
  for each row
  execute function public.set_maintenance_partner_updated_at();

drop trigger if exists set_maintenance_jobs_updated_at
  on public.maintenance_jobs;
create trigger set_maintenance_jobs_updated_at
  before update on public.maintenance_jobs
  for each row
  execute function public.set_maintenance_partner_updated_at();

create or replace function public.is_maintenance_partner_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.id = auth.uid()
      and p.role::text = 'maintenance_partner'
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
  );
$$;

create or replace function public.maintenance_partner_has_provider_access(
  p_provider_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maintenance_provider_users mpu
    join public.maintenance_providers mp
      on mp.id = mpu.provider_id
     and mp.is_active = true
    where mpu.provider_id = p_provider_id
      and mpu.user_id = auth.uid()
      and mpu.is_active = true
      and public.is_maintenance_partner_user(mpu.user_id)
  );
$$;

create or replace function public.has_organization_permission_for_provider(
  p_user_id uuid,
  p_provider_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.maintenance_provider_organizations mpo
    where mpo.provider_id = p_provider_id
      and p_user_id = auth.uid()
      and public.has_organization_permission(
        p_user_id,
        mpo.organization_id,
        p_permission_key
      )
  );
$$;

alter table public.maintenance_providers enable row level security;
alter table public.maintenance_provider_organizations enable row level security;
alter table public.maintenance_provider_users enable row level security;
alter table public.maintenance_jobs enable row level security;

revoke all on public.maintenance_providers from public, anon, authenticated;
revoke all on public.maintenance_provider_organizations from public, anon, authenticated;
revoke all on public.maintenance_provider_users from public, anon, authenticated;
revoke all on public.maintenance_jobs from public, anon, authenticated;

grant select on public.maintenance_providers to authenticated;
grant select on public.maintenance_provider_organizations to authenticated;
grant select on public.maintenance_provider_users to authenticated;
grant select on public.maintenance_jobs to authenticated;

grant select, insert, update, delete on public.maintenance_providers to service_role;
grant select, insert, update, delete on public.maintenance_provider_organizations to service_role;
grant select, insert, update, delete on public.maintenance_provider_users to service_role;
grant select, insert, update, delete on public.maintenance_jobs to service_role;

drop policy if exists maintenance_providers_select_authorized
  on public.maintenance_providers;
create policy maintenance_providers_select_authorized
  on public.maintenance_providers
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(id)
    or exists (
      select 1
      from public.maintenance_provider_organizations mpo
      where mpo.provider_id = maintenance_providers.id
        and (
          public.has_organization_permission(auth.uid(), mpo.organization_id, 'maintenance_providers.view')
          or public.has_organization_permission(auth.uid(), mpo.organization_id, 'maintenance_providers.manage')
          or public.has_organization_permission(auth.uid(), mpo.organization_id, 'maintenance_jobs.view')
          or public.has_organization_permission(auth.uid(), mpo.organization_id, 'maintenance_jobs.assign')
        )
    )
  );

drop policy if exists maintenance_provider_organizations_select_authorized
  on public.maintenance_provider_organizations;
create policy maintenance_provider_organizations_select_authorized
  on public.maintenance_provider_organizations
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(provider_id)
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_providers.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_providers.manage')
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_jobs.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_jobs.assign')
  );

drop policy if exists maintenance_provider_users_select_authorized
  on public.maintenance_provider_users;
create policy maintenance_provider_users_select_authorized
  on public.maintenance_provider_users
  for select
  to authenticated
  using (
    public.is_system_owner()
    or user_id = auth.uid()
    or public.has_organization_permission_for_provider(
      auth.uid(),
      provider_id,
      'maintenance_providers.manage'
    )
  );

drop policy if exists maintenance_jobs_select_authorized
  on public.maintenance_jobs;
create policy maintenance_jobs_select_authorized
  on public.maintenance_jobs
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(provider_id)
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_jobs.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_jobs.assign')
    or public.has_organization_permission(auth.uid(), organization_id, 'maintenance_jobs.cancel')
  );

create or replace function public.insert_maintenance_activity_log(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    p_actor_user_id,
    p_organization_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.audit_maintenance_provider_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_actor_id := coalesce(new.created_by, auth.uid());
    v_action := 'maintenance_provider_created';
  else
    v_actor_id := coalesce(new.updated_by, new.created_by, auth.uid());
    if old.is_active = true and new.is_active = false then
      v_action := 'maintenance_provider_deactivated';
    elsif old.is_active = false and new.is_active = true then
      v_action := 'maintenance_provider_reactivated';
    else
      v_action := 'maintenance_provider_updated';
    end if;
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    null,
    v_action,
    'maintenance_provider',
    new.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    jsonb_build_object('provider_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists audit_maintenance_provider_change
  on public.maintenance_providers;
create trigger audit_maintenance_provider_change
  after insert or update on public.maintenance_providers
  for each row
  execute function public.audit_maintenance_provider_change();

create or replace function public.audit_maintenance_provider_organization_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_actor_id := coalesce(new.created_by, auth.uid());
    v_action := 'maintenance_provider_organization_added';
  else
    v_actor_id := coalesce(new.created_by, auth.uid());
    if old.is_active = true and new.is_active = false then
      v_action := 'maintenance_provider_organization_disabled';
    elsif old.is_active = false and new.is_active = true then
      v_action := 'maintenance_provider_organization_enabled';
    else
      v_action := 'maintenance_provider_organization_updated';
    end if;
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    new.organization_id,
    v_action,
    'maintenance_provider_organization',
    new.provider_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    jsonb_build_object(
      'provider_id', new.provider_id,
      'organization_id', new.organization_id
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_maintenance_provider_organization_change
  on public.maintenance_provider_organizations;
create trigger audit_maintenance_provider_organization_change
  after insert or update on public.maintenance_provider_organizations
  for each row
  execute function public.audit_maintenance_provider_organization_change();

create or replace function public.audit_maintenance_provider_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_actor_id := coalesce(new.created_by, auth.uid());
    v_action := 'maintenance_provider_member_added';
  else
    v_actor_id := coalesce(new.updated_by, new.created_by, auth.uid());
    if old.is_active = true and new.is_active = false then
      v_action := 'maintenance_provider_member_disabled';
    elsif old.is_active = false and new.is_active = true then
      v_action := 'maintenance_provider_member_enabled';
    else
      v_action := 'maintenance_provider_member_updated';
    end if;
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    null,
    v_action,
    'maintenance_provider_user',
    new.user_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    jsonb_build_object(
      'provider_id', new.provider_id,
      'user_id', new.user_id
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_maintenance_provider_user_change
  on public.maintenance_provider_users;
create trigger audit_maintenance_provider_user_change
  after insert or update on public.maintenance_provider_users
  for each row
  execute function public.audit_maintenance_provider_user_change();

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
    public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review')
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

create or replace function public.start_maintenance_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_request public.driver_app_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = v_job.request_id
  for update;

  if not found
    or v_request.status <> 'approved'
    or v_request.organization_id <> v_job.organization_id
    or v_request.driver_id <> v_job.driver_id
    or v_request.vehicle_id is distinct from v_job.vehicle_id
    or v_request.request_type <> v_job.job_type
  then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  if v_job.status = 'in_progress' then
    return jsonb_build_object(
      'id', v_job.id,
      'request_id', v_job.request_id,
      'job_type', v_job.job_type,
      'status', v_job.status,
      'already_started', true
    );
  end if;

  if v_job.status <> 'ready' then
    raise exception 'MAINTENANCE_JOB_INVALID_STATUS' using errcode = '22023';
  end if;

  update public.maintenance_jobs
  set
    status = 'in_progress',
    started_at = v_now,
    started_by = v_actor_id,
    updated_at = v_now
  where id = v_job.id
    and status = 'ready'
  returning * into v_job;

  if not found then
    raise exception 'MAINTENANCE_JOB_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_job.organization_id,
    'maintenance_job_started',
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
    'already_started', false
  );
end;
$$;

create or replace function public.complete_maintenance_job(
  p_job_id uuid,
  p_completion_notes text,
  p_oil_interval_km integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_request public.driver_app_requests%rowtype;
  v_oil_detail public.driver_app_oil_change_request_details%rowtype;
  v_existing_event public.fleet_vehicle_oil_change_events%rowtype;
  v_completion_notes text := nullif(btrim(coalesce(p_completion_notes, '')), '');
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = v_job.request_id
  for update;

  if not found
    or v_request.organization_id <> v_job.organization_id
    or v_request.driver_id <> v_job.driver_id
    or v_request.vehicle_id is distinct from v_job.vehicle_id
    or v_request.request_type <> v_job.job_type
  then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  if v_job.status = 'completed' then
    if v_request.status <> 'completed' then
      raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
    end if;

    if v_completion_notes is distinct from v_job.completion_notes then
      raise exception 'MAINTENANCE_JOB_COMPLETION_PAYLOAD_CONFLICT' using errcode = '23505';
    end if;

    if v_job.job_type = 'oil_change' then
      select *
        into v_oil_detail
      from public.driver_app_oil_change_request_details
      where request_id = v_request.id
      for update;

      if not found then
        raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
      end if;

      select *
        into v_existing_event
      from public.fleet_vehicle_oil_change_events
      where request_id = v_request.id;

      if not found then
        raise exception 'MAINTENANCE_JOB_COMPLETED_WITHOUT_OIL_EVENT' using errcode = '23514';
      end if;

      if p_oil_interval_km is null or p_oil_interval_km <> v_job.oil_interval_km then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;

      if v_existing_event.organization_id <> v_request.organization_id
        or v_existing_event.vehicle_id <> v_request.vehicle_id
        or v_existing_event.driver_id is distinct from v_request.driver_id
        or v_existing_event.odometer_reading <> v_oil_detail.current_odometer_reading
        or v_existing_event.interval_km is distinct from v_job.oil_interval_km
        or v_existing_event.completed_at is distinct from v_job.completed_at
        or v_existing_event.created_by is distinct from v_job.completed_by
        or v_existing_event.note is distinct from coalesce(v_job.completion_notes, v_oil_detail.note)
      then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;
    elsif p_oil_interval_km is not null then
      raise exception 'MAINTENANCE_OIL_INTERVAL_NOT_ALLOWED' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'id', v_job.id,
      'request_id', v_job.request_id,
      'job_type', v_job.job_type,
      'status', v_job.status,
      'oil_event_id', v_existing_event.id,
      'already_completed', true
    );
  end if;

  if v_job.status <> 'in_progress' then
    raise exception 'MAINTENANCE_JOB_INVALID_STATUS' using errcode = '22023';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'MAINTENANCE_REQUEST_INVALID_STATE' using errcode = '22023';
  end if;

  if v_job.job_type = 'oil_change' then
    if p_oil_interval_km is null
      or p_oil_interval_km <= 0
      or p_oil_interval_km > 2147483647
    then
      raise exception 'APP_REQUEST_INVALID_OIL_INTERVAL' using errcode = '22023';
    end if;

    select *
      into v_oil_detail
    from public.driver_app_oil_change_request_details
    where request_id = v_request.id
    for update;

    if not found then
      raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
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
      v_oil_detail.current_odometer_reading,
      p_oil_interval_km,
      v_now,
      coalesce(v_completion_notes, v_oil_detail.note),
      v_actor_id
    )
    on conflict (request_id) where request_id is not null do nothing
    returning * into v_existing_event;

    if not found then
      select *
        into v_existing_event
      from public.fleet_vehicle_oil_change_events
      where request_id = v_request.id;

      if not found then
        raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
      end if;
    end if;

    if v_existing_event.organization_id <> v_request.organization_id
      or v_existing_event.vehicle_id <> v_request.vehicle_id
      or v_existing_event.driver_id is distinct from v_request.driver_id
      or v_existing_event.odometer_reading <> v_oil_detail.current_odometer_reading
      or v_existing_event.interval_km <> p_oil_interval_km
      or v_existing_event.completed_at <> v_now
      or v_existing_event.created_by is distinct from v_actor_id
      or v_existing_event.note is distinct from coalesce(v_completion_notes, v_oil_detail.note)
    then
      raise exception 'MAINTENANCE_OIL_EVENT_CONFLICT' using errcode = '23505';
    end if;
  elsif p_oil_interval_km is not null then
    raise exception 'MAINTENANCE_OIL_INTERVAL_NOT_ALLOWED' using errcode = '22023';
  end if;

  update public.driver_app_requests
  set
    status = 'completed',
    completed_by = v_actor_id,
    completed_at = v_now,
    updated_at = v_now,
    review_note = coalesce(v_completion_notes, review_note)
  where id = v_request.id
    and status = 'approved'
  returning * into v_request;

  if not found then
    raise exception 'MAINTENANCE_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  update public.maintenance_jobs
  set
    status = 'completed',
    completed_at = v_now,
    completed_by = v_actor_id,
    completion_notes = v_completion_notes,
    oil_interval_km = case when job_type = 'oil_change' then p_oil_interval_km else oil_interval_km end,
    updated_at = v_now
  where id = v_job.id
    and status = 'in_progress'
  returning * into v_job;

  if not found then
    raise exception 'MAINTENANCE_JOB_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  perform public.insert_driver_app_request_activity(
    v_actor_id,
    v_request.organization_id,
    v_request.driver_id,
    v_request.id,
    'driver_app_request_completed',
    v_request.request_type,
    'completed'
  );

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_job.organization_id,
    'maintenance_job_completed',
    'maintenance_job',
    v_job.id,
    null,
    to_jsonb(v_job),
    jsonb_build_object(
      'request_id', v_job.request_id,
      'provider_id', v_job.provider_id,
      'oil_event_id', v_existing_event.id
    )
  );

  return jsonb_build_object(
    'id', v_job.id,
    'request_id', v_job.request_id,
    'job_type', v_job.job_type,
    'status', v_job.status,
    'oil_event_id', v_existing_event.id,
    'already_completed', false
  );
end;
$$;

create or replace function public.notify_maintenance_job_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select mpu.user_id
    from public.maintenance_provider_users mpu
    join public.maintenance_providers mp
      on mp.id = mpu.provider_id
     and mp.is_active = true
    join public.profiles p
      on p.id = mpu.user_id
     and p.role::text = 'maintenance_partner'
     and p.status = 'active'::public.account_status
     and p.deleted_at is null
    where mpu.provider_id = new.provider_id
      and mpu.is_active = true
  loop
    perform public.insert_app_notification(
      v_recipient.user_id,
      new.organization_id,
      'maintenance_job_assigned',
      'Maintenance job assigned',
      'A new maintenance job has been assigned to your workshop.',
      'maintenance_job',
      new.id,
      'maintenance_job:' || new.id::text || ':assigned:' || v_recipient.user_id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_maintenance_job_assigned
  on public.maintenance_jobs;
create trigger notify_maintenance_job_assigned
  after insert on public.maintenance_jobs
  for each row
  execute function public.notify_maintenance_job_assigned();

create or replace function public.notify_maintenance_job_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
  v_type text;
  v_title text;
  v_message text;
begin
  if old.status = new.status then
    return new;
  end if;

  if new.status = 'in_progress' then
    v_type := 'maintenance_job_started';
    v_title := 'Maintenance job started';
    v_message := 'A maintenance partner started an assigned job.';
  elsif new.status = 'completed' then
    v_type := 'maintenance_job_completed';
    v_title := 'Maintenance job completed';
    v_message := 'A maintenance partner completed an assigned job.';
  elsif new.status = 'cancelled' then
    v_type := 'maintenance_job_cancelled';
    v_title := 'Maintenance job cancelled';
    v_message := 'A maintenance job was cancelled.';
  else
    return new;
  end if;

  for v_recipient in
    select p.id
    from public.profiles p
    where p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role <> 'driver'::public.app_role
      and p.role::text <> 'maintenance_partner'
      and (
        p.role = 'system_owner'::public.app_role
        or (
          public.has_organization_permission(p.id, new.organization_id, 'notifications.view')
          and public.has_organization_permission(p.id, new.organization_id, 'maintenance_jobs.view')
        )
      )
  loop
    perform public.insert_app_notification(
      v_recipient.id,
      new.organization_id,
      v_type,
      v_title,
      v_message,
      'maintenance_job',
      new.id,
      'maintenance_job:' || new.id::text || ':' || new.status || ':' || v_recipient.id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_maintenance_job_status_changed
  on public.maintenance_jobs;
create trigger notify_maintenance_job_status_changed
  after update of status on public.maintenance_jobs
  for each row
  execute function public.notify_maintenance_job_status_changed();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'maintenance_jobs'
    ) then
      alter publication supabase_realtime add table public.maintenance_jobs;
    end if;
  end if;
end;
$$;

revoke all on function public.set_maintenance_partner_updated_at()
  from public, anon, authenticated;
revoke all on function public.is_maintenance_partner_user(uuid)
  from public, anon;
revoke all on function public.maintenance_partner_has_provider_access(uuid)
  from public, anon;
revoke all on function public.has_organization_permission_for_provider(uuid, uuid, text)
  from public, anon;
revoke all on function public.insert_maintenance_activity_log(uuid, uuid, text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.audit_maintenance_provider_change()
  from public, anon, authenticated;
revoke all on function public.audit_maintenance_provider_organization_change()
  from public, anon, authenticated;
revoke all on function public.audit_maintenance_provider_user_change()
  from public, anon, authenticated;
revoke all on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.start_maintenance_job(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_maintenance_job(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.notify_maintenance_job_assigned()
  from public, anon, authenticated;
revoke all on function public.notify_maintenance_job_status_changed()
  from public, anon, authenticated;

grant execute on function public.is_maintenance_partner_user(uuid)
  to service_role;
grant execute on function public.maintenance_partner_has_provider_access(uuid)
  to authenticated, service_role;
grant execute on function public.has_organization_permission_for_provider(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.approve_and_assign_maintenance_request(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.start_maintenance_job(uuid)
  to authenticated, service_role;
grant execute on function public.complete_maintenance_job(uuid, text, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
