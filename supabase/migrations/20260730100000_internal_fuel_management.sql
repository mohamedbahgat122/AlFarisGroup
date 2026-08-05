-- Internal organization-scoped Fuel Management.
-- Replaces runtime external fuel loading with first-party ledger/request data.

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
      'fuel.increase.review'
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
    ('fuel.manage'),
    ('fuel.reports.view'),
    ('fuel.increase.review')
) as fuel_permissions(permission_key)
where oa.access_level = 'manage'::public.organization_access_level
on conflict (user_id, organization_id, permission_key) do nothing;

create table if not exists public.fuel_increase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid null references public.fleet_vehicles(id) on delete set null,
  vehicle_plate_snapshot text null,
  request_date date not null,
  requested_amount_sar numeric(12, 2) not null,
  approved_amount_sar numeric(12, 2) null,
  reason text not null,
  status text not null default 'pending',
  reviewed_by uuid null references public.profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  review_note text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fuel_increase_requests_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled')
  ),
  constraint fuel_increase_requests_requested_amount_positive check (
    requested_amount_sar > 0
  ),
  constraint fuel_increase_requests_approved_amount_positive check (
    approved_amount_sar is null or approved_amount_sar > 0
  ),
  constraint fuel_increase_requests_reason_not_blank check (
    length(btrim(reason)) between 1 and 1000
  ),
  constraint fuel_increase_requests_review_shape_check check (
    (
      status = 'pending'
      and approved_amount_sar is null
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status = 'approved'
      and approved_amount_sar is not null
      and reviewed_by is not null
      and reviewed_at is not null
    )
    or (
      status in ('rejected', 'cancelled')
      and approved_amount_sar is null
    )
  )
);

create table if not exists public.fuel_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid null references public.fleet_vehicles(id) on delete set null,
  driver_name_snapshot text not null,
  driver_identifier_snapshot text null,
  vehicle_plate_snapshot text null,
  fuel_date date not null,
  transaction_type text not null,
  amount_sar numeric(12, 2) not null,
  related_request_id uuid null references public.fuel_increase_requests(id) on delete restrict,
  note text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fuel_transactions_type_check check (
    transaction_type in ('opening', 'increase')
  ),
  constraint fuel_transactions_amount_positive check (amount_sar > 0),
  constraint fuel_transactions_opening_request_shape check (
    transaction_type <> 'opening' or related_request_id is null
  ),
  constraint fuel_transactions_increase_request_shape check (
    transaction_type <> 'increase' or related_request_id is null or note is not null
  )
);

create unique index if not exists fuel_transactions_one_opening_per_driver_date_idx
  on public.fuel_transactions (organization_id, driver_id, fuel_date)
  where transaction_type = 'opening';

create unique index if not exists fuel_transactions_one_increase_per_request_idx
  on public.fuel_transactions (related_request_id)
  where related_request_id is not null;

create index if not exists fuel_transactions_org_date_driver_idx
  on public.fuel_transactions (organization_id, fuel_date desc, driver_id);

create index if not exists fuel_increase_requests_org_date_driver_idx
  on public.fuel_increase_requests (organization_id, request_date desc, driver_id);

create index if not exists fuel_increase_requests_pending_idx
  on public.fuel_increase_requests (organization_id, request_date, status)
  where status = 'pending';

create or replace function public.set_fuel_increase_requests_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_fuel_increase_requests_updated_at on public.fuel_increase_requests;
create trigger set_fuel_increase_requests_updated_at
  before update on public.fuel_increase_requests
  for each row
  execute function public.set_fuel_increase_requests_updated_at();

create or replace function public.current_riyadh_date()
returns date
language sql
stable
set search_path = ''
as $$
  select (timezone('Asia/Riyadh', now()))::date;
$$;

create or replace function public.get_driver_current_vehicle(p_driver_id uuid)
returns table (
  vehicle_id uuid,
  plate_number text
)
language sql
stable
set search_path = ''
as $$
  select fv.id, fv.plate_number
  from public.fleet_vehicles fv
  where fv.archived_at is null
    and (
      fv.assigned_driver_id = p_driver_id
      or fv.authorized_driver_id = p_driver_id
    )
  order by
    case when fv.assigned_driver_id = p_driver_id then 0 else 1 end,
    fv.created_at desc
  limit 1;
$$;

create or replace function public.fuel_daily_summary(
  p_organization_id uuid,
  p_driver_id uuid,
  p_fuel_date date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'driver_id', p_driver_id,
    'fuel_date', p_fuel_date,
    'opening_amount_sar', coalesce(sum(amount_sar) filter (where transaction_type = 'opening'), 0),
    'approved_increase_amount_sar', coalesce(sum(amount_sar) filter (where transaction_type = 'increase'), 0),
    'increase_count', count(*) filter (where transaction_type = 'increase'),
    'daily_total_sar', coalesce(sum(amount_sar), 0)
  )
  from public.fuel_transactions ft
  where ft.organization_id = p_organization_id
    and ft.driver_id = p_driver_id
    and ft.fuel_date = p_fuel_date;
$$;

create or replace function public.insert_fuel_activity(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_driver_id uuid,
  p_action text,
  p_amount_sar numeric,
  p_request_id uuid,
  p_transaction_id uuid
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
    'fuel',
    coalesce(p_transaction_id, p_request_id, p_driver_id),
    jsonb_build_object(
      'driver_id', p_driver_id,
      'amount_sar', p_amount_sar,
      'request_id', p_request_id,
      'transaction_id', p_transaction_id
    ),
    jsonb_build_object('source', 'internal_fuel')
  );
end;
$$;

create or replace function public.open_driver_fuel(
  p_driver_id uuid,
  p_amount_sar numeric,
  p_note text default null,
  p_fuel_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle record;
  v_fuel_date date := coalesce(p_fuel_date, public.current_riyadh_date());
  v_transaction public.fuel_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'FUEL_SESSION_EXPIRED';
  end if;

  if p_amount_sar is null or p_amount_sar <= 0 then
    raise exception 'FUEL_INVALID_AMOUNT';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and deleted_at is null;

  if not found then
    raise exception 'FUEL_DRIVER_UNAVAILABLE';
  end if;

  if v_driver.status <> 'active'::public.driver_status then
    raise exception 'FUEL_DRIVER_INACTIVE';
  end if;

  if not public.has_organization_permission(v_user_id, v_driver.organization_id, 'fuel.manage') then
    raise exception 'FUEL_PERMISSION_DENIED';
  end if;

  select * into v_vehicle
  from public.get_driver_current_vehicle(v_driver.id);

  insert into public.fuel_transactions (
    organization_id,
    driver_id,
    vehicle_id,
    driver_name_snapshot,
    driver_identifier_snapshot,
    vehicle_plate_snapshot,
    fuel_date,
    transaction_type,
    amount_sar,
    related_request_id,
    note,
    created_by
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_driver.full_name,
    v_driver.keeta_driver_id,
    v_vehicle.plate_number,
    v_fuel_date,
    'opening',
    round(p_amount_sar, 2),
    null,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_user_id
  )
  returning * into v_transaction;

  perform public.insert_fuel_activity(
    v_user_id,
    v_driver.organization_id,
    v_driver.id,
    'fuel_opened',
    v_transaction.amount_sar,
    null,
    v_transaction.id
  );

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'summary', public.fuel_daily_summary(v_driver.organization_id, v_driver.id, v_fuel_date)
  );
exception
  when unique_violation then
    raise exception 'FUEL_OPENING_EXISTS';
end;
$$;

create or replace function public.add_manual_fuel_increase(
  p_driver_id uuid,
  p_amount_sar numeric,
  p_note text,
  p_fuel_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle record;
  v_fuel_date date := coalesce(p_fuel_date, public.current_riyadh_date());
  v_transaction public.fuel_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'FUEL_SESSION_EXPIRED';
  end if;

  if p_amount_sar is null or p_amount_sar <= 0 then
    raise exception 'FUEL_INVALID_AMOUNT';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'FUEL_NOTE_REQUIRED';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and deleted_at is null;

  if not found then
    raise exception 'FUEL_DRIVER_UNAVAILABLE';
  end if;

  if not public.has_organization_permission(v_user_id, v_driver.organization_id, 'fuel.manage') then
    raise exception 'FUEL_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1
    from public.fuel_transactions ft
    where ft.organization_id = v_driver.organization_id
      and ft.driver_id = v_driver.id
      and ft.fuel_date = v_fuel_date
      and ft.transaction_type = 'opening'
  ) then
    raise exception 'FUEL_OPENING_REQUIRED';
  end if;

  select * into v_vehicle
  from public.get_driver_current_vehicle(v_driver.id);

  insert into public.fuel_transactions (
    organization_id,
    driver_id,
    vehicle_id,
    driver_name_snapshot,
    driver_identifier_snapshot,
    vehicle_plate_snapshot,
    fuel_date,
    transaction_type,
    amount_sar,
    related_request_id,
    note,
    created_by
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_driver.full_name,
    v_driver.keeta_driver_id,
    v_vehicle.plate_number,
    v_fuel_date,
    'increase',
    round(p_amount_sar, 2),
    null,
    btrim(p_note),
    v_user_id
  )
  returning * into v_transaction;

  perform public.insert_fuel_activity(
    v_user_id,
    v_driver.organization_id,
    v_driver.id,
    'fuel_manual_increase_added',
    v_transaction.amount_sar,
    null,
    v_transaction.id
  );

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'summary', public.fuel_daily_summary(v_driver.organization_id, v_driver.id, v_fuel_date)
  );
end;
$$;

create or replace function public.submit_driver_fuel_increase_request(
  p_requested_amount_sar numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle record;
  v_request public.fuel_increase_requests%rowtype;
  v_request_date date := public.current_riyadh_date();
begin
  if v_user_id is null then
    raise exception 'FUEL_SESSION_EXPIRED';
  end if;

  if p_requested_amount_sar is null or p_requested_amount_sar <= 0 then
    raise exception 'FUEL_INVALID_AMOUNT';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'FUEL_REASON_REQUIRED';
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
    raise exception 'FUEL_PROFILE_UNAVAILABLE';
  end if;

  select * into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'FUEL_DRIVER_UNAVAILABLE';
  end if;

  select * into v_vehicle
  from public.get_driver_current_vehicle(v_driver.id);

  insert into public.fuel_increase_requests (
    organization_id,
    driver_id,
    vehicle_id,
    vehicle_plate_snapshot,
    request_date,
    requested_amount_sar,
    reason,
    status
  )
  values (
    v_driver.organization_id,
    v_driver.id,
    v_vehicle.vehicle_id,
    v_vehicle.plate_number,
    v_request_date,
    round(p_requested_amount_sar, 2),
    btrim(p_reason),
    'pending'
  )
  returning * into v_request;

  perform public.insert_fuel_activity(
    v_user_id,
    v_driver.organization_id,
    v_driver.id,
    'fuel_increase_request_submitted',
    v_request.requested_amount_sar,
    v_request.id,
    null
  );

  return jsonb_build_object(
    'id', v_request.id,
    'request_date', v_request.request_date,
    'requested_amount_sar', v_request.requested_amount_sar,
    'status', v_request.status
  );
end;
$$;

create or replace function public.review_fuel_increase_request(
  p_request_id uuid,
  p_decision text,
  p_approved_amount_sar numeric default null,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.fuel_increase_requests%rowtype;
  v_driver public.drivers%rowtype;
  v_transaction public.fuel_transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'FUEL_SESSION_EXPIRED';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'FUEL_INVALID_DECISION';
  end if;

  select * into v_request
  from public.fuel_increase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'FUEL_REQUEST_UNAVAILABLE';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'FUEL_REQUEST_ALREADY_REVIEWED';
  end if;

  if not public.has_organization_permission(v_user_id, v_request.organization_id, 'fuel.increase.review') then
    raise exception 'FUEL_PERMISSION_DENIED';
  end if;

  select * into v_driver
  from public.drivers
  where id = v_request.driver_id
    and organization_id = v_request.organization_id
    and deleted_at is null;

  if not found then
    raise exception 'FUEL_DRIVER_UNAVAILABLE';
  end if;

  if p_decision = 'approved' then
    if p_approved_amount_sar is null or p_approved_amount_sar <= 0 then
      raise exception 'FUEL_INVALID_AMOUNT';
    end if;

    if not exists (
      select 1
      from public.fuel_transactions ft
      where ft.organization_id = v_request.organization_id
        and ft.driver_id = v_request.driver_id
        and ft.fuel_date = v_request.request_date
        and ft.transaction_type = 'opening'
    ) then
      raise exception 'FUEL_OPENING_REQUIRED';
    end if;

    update public.fuel_increase_requests
    set
      status = 'approved',
      approved_amount_sar = round(p_approved_amount_sar, 2),
      reviewed_by = v_user_id,
      reviewed_at = timezone('utc', now()),
      review_note = nullif(btrim(coalesce(p_review_note, '')), '')
    where id = v_request.id
      and status = 'pending'
    returning * into v_request;

    if not found then
      raise exception 'FUEL_REQUEST_ALREADY_REVIEWED';
    end if;

    insert into public.fuel_transactions (
      organization_id,
      driver_id,
      vehicle_id,
      driver_name_snapshot,
      driver_identifier_snapshot,
      vehicle_plate_snapshot,
      fuel_date,
      transaction_type,
      amount_sar,
      related_request_id,
      note,
      created_by
    )
    values (
      v_request.organization_id,
      v_request.driver_id,
      v_request.vehicle_id,
      v_driver.full_name,
      v_driver.keeta_driver_id,
      v_request.vehicle_plate_snapshot,
      v_request.request_date,
      'increase',
      v_request.approved_amount_sar,
      v_request.id,
      nullif(btrim(coalesce(p_review_note, '')), ''),
      v_user_id
    )
    returning * into v_transaction;

    perform public.insert_fuel_activity(
      v_user_id,
      v_request.organization_id,
      v_request.driver_id,
      'fuel_increase_request_approved',
      v_request.approved_amount_sar,
      v_request.id,
      v_transaction.id
    );
  else
    update public.fuel_increase_requests
    set
      status = 'rejected',
      approved_amount_sar = null,
      reviewed_by = v_user_id,
      reviewed_at = timezone('utc', now()),
      review_note = nullif(btrim(coalesce(p_review_note, '')), '')
    where id = v_request.id
      and status = 'pending'
    returning * into v_request;

    if not found then
      raise exception 'FUEL_REQUEST_ALREADY_REVIEWED';
    end if;

    perform public.insert_fuel_activity(
      v_user_id,
      v_request.organization_id,
      v_request.driver_id,
      'fuel_increase_request_rejected',
      v_request.requested_amount_sar,
      v_request.id,
      null
    );
  end if;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'summary', public.fuel_daily_summary(v_request.organization_id, v_request.driver_id, v_request.request_date)
  );
exception
  when unique_violation then
    raise exception 'FUEL_REQUEST_ALREADY_REVIEWED';
end;
$$;

alter table public.fuel_transactions enable row level security;
alter table public.fuel_increase_requests enable row level security;

revoke all on public.fuel_transactions from anon;
revoke all on public.fuel_increase_requests from anon;
grant select on public.fuel_transactions to authenticated;
grant select on public.fuel_increase_requests to authenticated;
grant select, insert, update, delete on public.fuel_transactions to service_role;
grant select, insert, update, delete on public.fuel_increase_requests to service_role;
grant insert on public.activity_logs to service_role;

drop policy if exists fuel_transactions_select_dashboard_or_own_driver on public.fuel_transactions;
create policy fuel_transactions_select_dashboard_or_own_driver
  on public.fuel_transactions
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'fuel.manage')
    or public.has_organization_permission(auth.uid(), organization_id, 'fuel.reports.view')
    or exists (
      select 1
      from public.drivers d
      where d.id = fuel_transactions.driver_id
        and d.auth_user_id = auth.uid()
    )
  );

drop policy if exists fuel_requests_select_dashboard_or_own_driver on public.fuel_increase_requests;
create policy fuel_requests_select_dashboard_or_own_driver
  on public.fuel_increase_requests
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'fuel.manage')
    or public.has_organization_permission(auth.uid(), organization_id, 'fuel.increase.review')
    or public.has_organization_permission(auth.uid(), organization_id, 'fuel.reports.view')
    or exists (
      select 1
      from public.drivers d
      where d.id = fuel_increase_requests.driver_id
        and d.auth_user_id = auth.uid()
    )
  );

revoke all on function public.current_riyadh_date() from public, anon;
revoke all on function public.get_driver_current_vehicle(uuid) from public, anon;
revoke all on function public.fuel_daily_summary(uuid, uuid, date) from public, anon;
revoke all on function public.insert_fuel_activity(uuid, uuid, uuid, text, numeric, uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_driver_fuel(uuid, numeric, text, date) from public, anon, authenticated;
revoke all on function public.add_manual_fuel_increase(uuid, numeric, text, date) from public, anon, authenticated;
revoke all on function public.submit_driver_fuel_increase_request(numeric, text) from public, anon, authenticated;
revoke all on function public.review_fuel_increase_request(uuid, text, numeric, text) from public, anon, authenticated;

grant execute on function public.current_riyadh_date() to authenticated;
grant execute on function public.get_driver_current_vehicle(uuid) to authenticated;
grant execute on function public.fuel_daily_summary(uuid, uuid, date) to authenticated;
grant execute on function public.open_driver_fuel(uuid, numeric, text, date) to authenticated;
grant execute on function public.add_manual_fuel_increase(uuid, numeric, text, date) to authenticated;
grant execute on function public.submit_driver_fuel_increase_request(numeric, text) to authenticated;
grant execute on function public.review_fuel_increase_request(uuid, text, numeric, text) to authenticated;

create or replace function public.replace_managed_user_organization_permissions(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_access jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role public.app_role;
  v_target_home_organization_id uuid;
  v_access_item jsonb;
  v_organization_id uuid;
  v_permission_keys text[];
  v_permission_key text;
  v_old_permissions text[];
  v_new_permissions text[];
  v_access_level public.organization_access_level;
  v_seen_organizations uuid[] := array[]::uuid[];
  v_view_permissions constant text[] := array[
    'organization.dashboard.view',
    'drivers.view',
    'driver_reports.view',
    'fleet.cars.view',
    'fleet.motorcycles.view',
    'fuel.reports.view'
  ];
  v_all_permissions constant text[] := array[
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
    'fuel.increase.review'
  ];
begin
  if not public.is_system_owner_user(p_actor_user_id) then
    raise exception 'Managed user permissions update failed: unauthorized.';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user permissions update failed: self operation is not allowed.';
  end if;

  select p.role, p.home_organization_id
    into v_target_role, v_target_home_organization_id
  from public.profiles p
  where p.id = p_target_user_id
    and p.deleted_at is null;

  if not found then
    raise exception 'Managed user permissions update failed: target user not found.';
  end if;

  if v_target_role = 'system_owner'::public.app_role then
    raise exception 'Managed user permissions update failed: system owner access is implicit.';
  end if;

  if v_target_role = 'driver'::public.app_role and jsonb_array_length(p_access) > 0 then
    raise exception 'Managed user permissions update failed: drivers cannot receive additional access.';
  end if;

  if jsonb_typeof(p_access) is distinct from 'array' then
    raise exception 'Managed user permissions update failed: invalid access payload.';
  end if;

  for v_access_item in select * from jsonb_array_elements(p_access)
  loop
    v_organization_id := (v_access_item ->> 'organizationId')::uuid;

    if v_organization_id = any(v_seen_organizations) then
      raise exception 'Managed user permissions update failed: duplicate organization.';
    end if;

    v_seen_organizations := array_append(v_seen_organizations, v_organization_id);

    if not exists (
      select 1
      from public.organizations o
      where o.id = v_organization_id
        and o.is_active = true
    ) then
      raise exception 'Managed user permissions update failed: organization unavailable.';
    end if;

    if v_organization_id = v_target_home_organization_id then
      raise exception 'Managed user permissions update failed: home organization access is implicit.';
    end if;

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_permission_keys
    from jsonb_array_elements_text(v_access_item -> 'permissionKeys') as permission(value)
    where value = any(v_all_permissions);

    if cardinality(v_permission_keys) = 0 then
      raise exception 'Managed user permissions update failed: missing permissions.';
    end if;

    if exists (
      select 1
      from unnest(v_permission_keys) as permission(value)
      where value <> all(v_all_permissions)
    ) then
      raise exception 'Managed user permissions update failed: invalid permission.';
    end if;

    v_access_level := case
      when v_permission_keys <@ v_view_permissions then 'view'::public.organization_access_level
      else 'manage'::public.organization_access_level
    end;

    insert into public.organization_access (
      user_id,
      organization_id,
      access_level,
      granted_by,
      updated_by
    )
    values (
      p_target_user_id,
      v_organization_id,
      v_access_level,
      p_actor_user_id,
      p_actor_user_id
    )
    on conflict (user_id, organization_id)
    do update set
      access_level = excluded.access_level,
      updated_by = excluded.updated_by,
      updated_at = timezone('utc', now());

    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_old_permissions
    from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    delete from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id
      and permission_key <> all(v_permission_keys);

    foreach v_permission_key in array v_permission_keys
    loop
      insert into public.organization_user_permissions (
        user_id,
        organization_id,
        permission_key,
        granted_by,
        updated_by
      )
      values (
        p_target_user_id,
        v_organization_id,
        v_permission_key,
        p_actor_user_id,
        p_actor_user_id
      )
      on conflict (user_id, organization_id, permission_key)
      do update set
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now());
    end loop;

    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_new_permissions
    from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    insert into public.activity_logs (
      actor_user_id,
      target_user_id,
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
      p_target_user_id,
      v_organization_id,
      'organization_permissions_updated',
      'organization_user_permissions',
      p_target_user_id,
      jsonb_build_object('permission_keys', v_old_permissions),
      jsonb_build_object('permission_keys', v_new_permissions),
      jsonb_build_object('access_level', v_access_level)
    );
  end loop;

  delete from public.organization_access oa
  where oa.user_id = p_target_user_id
    and oa.organization_id <> coalesce(v_target_home_organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not (oa.organization_id = any(v_seen_organizations));

  delete from public.organization_user_permissions oup
  where oup.user_id = p_target_user_id
    and oup.organization_id <> coalesce(v_target_home_organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not (oup.organization_id = any(v_seen_organizations));
end;
$$;
