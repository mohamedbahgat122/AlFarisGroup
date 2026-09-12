-- Phase 1: isolated order-work shift change requests for per-order drivers.
-- This migration creates no rows and does not alter the normal shift workflow.

begin;

create or replace function public.normalize_order_shift_change_weekdays(p_days smallint[])
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct day order by day), '{}'::smallint[])
  from unnest(coalesce(p_days, '{}'::smallint[])) as values(day);
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drivers_id_organization_id_key'
      and conrelid = 'public.drivers'::regclass
  ) then
    alter table public.drivers
      add constraint drivers_id_organization_id_key unique (id, organization_id);
  end if;
end;
$$;

create table if not exists public.organization_order_shift_change_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  allowed_weekdays smallint[] not null default '{}'::smallint[],
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_order_shift_change_settings_weekdays_range
    check (allowed_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint organization_order_shift_change_settings_weekdays_normalized
    check (allowed_weekdays = public.normalize_order_shift_change_weekdays(allowed_weekdays))
);

create table if not exists public.driver_order_shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null,
  current_order_period_template_id uuid not null,
  requested_order_period_template_id uuid not null,
  requested_week_start_date date not null,
  status text not null default 'pending',
  reason text null,
  review_note text null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_order_shift_change_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint driver_order_shift_change_requests_template_difference
    check (current_order_period_template_id <> requested_order_period_template_id),
  constraint driver_order_shift_change_requests_reason_length
    check (reason is null or length(reason) <= 2000),
  constraint driver_order_shift_change_requests_review_note_length
    check (review_note is null or length(review_note) <= 2000),
  constraint driver_order_shift_change_requests_driver_org_fkey
    foreign key (driver_id, organization_id)
    references public.drivers(id, organization_id) on delete cascade,
  constraint driver_order_shift_change_requests_current_template_org_fkey
    foreign key (current_order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id) on delete restrict,
  constraint driver_order_shift_change_requests_requested_template_org_fkey
    foreign key (requested_order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id) on delete restrict
);

create unique index if not exists driver_order_shift_change_requests_pending_key
  on public.driver_order_shift_change_requests (driver_id, requested_week_start_date)
  where status = 'pending';

create unique index if not exists driver_order_shift_change_requests_processed_key
  on public.driver_order_shift_change_requests (driver_id, requested_week_start_date)
  where status = 'approved';

create index if not exists driver_order_shift_change_requests_org_review_idx
  on public.driver_order_shift_change_requests
    (organization_id, status, requested_week_start_date, driver_id);

create index if not exists driver_order_shift_change_requests_driver_idx
  on public.driver_order_shift_change_requests (driver_id, requested_week_start_date desc);

drop trigger if exists set_order_shift_change_requests_updated_at
  on public.driver_order_shift_change_requests;
create trigger set_order_shift_change_requests_updated_at
  before update on public.driver_order_shift_change_requests
  for each row execute function public.set_order_period_updated_at();

alter table public.organization_order_shift_change_settings enable row level security;
alter table public.driver_order_shift_change_requests enable row level security;

revoke all on public.organization_order_shift_change_settings from public, anon, authenticated;
revoke all on public.driver_order_shift_change_requests from public, anon, authenticated;
grant select on public.organization_order_shift_change_settings to authenticated;
grant select on public.driver_order_shift_change_requests to authenticated;
grant select, insert, update on public.organization_order_shift_change_settings to service_role;
grant select, insert, update on public.driver_order_shift_change_requests to service_role;

drop policy if exists organization_order_shift_change_settings_select_scoped
  on public.organization_order_shift_change_settings;
create policy organization_order_shift_change_settings_select_scoped
  on public.organization_order_shift_change_settings
  for select to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'order_periods.manage')
  );

drop policy if exists driver_order_shift_change_requests_select_scoped
  on public.driver_order_shift_change_requests;
create policy driver_order_shift_change_requests_select_scoped
  on public.driver_order_shift_change_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      where d.id = driver_order_shift_change_requests.driver_id
        and d.organization_id = driver_order_shift_change_requests.organization_id
        and d.auth_user_id = auth.uid()
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
    or public.has_organization_permission(auth.uid(), organization_id, 'order_periods.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'order_periods.manage')
    or public.has_organization_permission(auth.uid(), organization_id, 'order_periods.assign')
  );

create or replace function public.get_order_shift_change_target_week_start(
  p_reference_at timestamptz default null
)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    timezone('Asia/Riyadh', coalesce(p_reference_at, now()))::date
    + (7 - extract(dow from timezone('Asia/Riyadh', coalesce(p_reference_at, now())))::integer)
  )::date;
$$;

create or replace function public.get_my_order_shift_change_request_window()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver_id uuid;
  v_organization_id uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday smallint := extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint;
  v_target_week date := public.get_order_shift_change_target_week_start(now());
  v_allowed smallint[] := '{}'::smallint[];
  v_current_template_id uuid;
  v_driver_count integer;
  v_current_count integer;
  v_pending boolean := false;
  v_can_submit boolean := false;
  v_reason text := 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND';
  v_templates jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'reason_code', 'ORDER_SHIFT_CHANGE_AUTH_REQUIRED');
  end if;

  select count(*) into v_driver_count
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id
    and p.id = v_actor_id
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null
    and p.must_change_password = false
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;

  if v_driver_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_DRIVERS';
  end if;

  select d.id, d.organization_id
    into v_driver_id, v_organization_id
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id
    and p.id = v_actor_id
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null
    and p.must_change_password = false
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;

  if v_driver_id is null then
    return jsonb_build_object(
      'success', true, 'today_riyadh', v_today, 'weekday_riyadh', v_weekday,
      'allowed_weekdays', v_allowed, 'can_submit_today', false,
      'target_week_start', v_target_week, 'has_pending_request', false,
      'reason_code', v_reason, 'templates', v_templates
    );
  end if;

  select coalesce(s.allowed_weekdays, '{}'::smallint[])
    into v_allowed
  from public.organization_order_shift_change_settings s
  where s.organization_id = v_organization_id;

  select count(*), max(a.order_period_template_id)
    into v_current_count, v_current_template_id
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_organization_id and a.driver_id = v_driver_id
    and a.is_active and v_today >= a.assignment_start_date
    and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
    and t.is_active and t.archived_at is null;

  if v_current_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_CURRENT_ASSIGNMENTS';
  end if;

  select exists (
    select 1 from public.driver_order_shift_change_requests r
    where r.driver_id = v_driver_id and r.requested_week_start_date = v_target_week
      and r.status = 'pending'
  ) into v_pending;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'start_time', t.start_time,
      'end_time', t.end_time, 'crosses_midnight', t.crosses_midnight
    ) order by t.start_time, t.id), '[]'::jsonb)
    into v_templates
  from public.organization_order_period_templates t
  where t.organization_id = v_organization_id and t.is_active and t.archived_at is null
    and t.id <> v_current_template_id;

  v_can_submit := v_allowed @> array[v_weekday]::smallint[]
    and not v_pending and v_current_template_id is not null;
  v_reason := case
    when v_current_template_id is null then 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT'
    when not (v_allowed @> array[v_weekday]::smallint[]) then 'ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED'
    when v_pending then 'ORDER_SHIFT_CHANGE_PENDING_REQUEST_EXISTS'
    else null
  end;

  return jsonb_build_object(
    'success', true, 'today_riyadh', v_today, 'weekday_riyadh', v_weekday,
    'allowed_weekdays', v_allowed, 'can_submit_today', v_can_submit,
    'target_week_start', v_target_week, 'has_pending_request', v_pending,
    'reason_code', v_reason, 'templates', v_templates
  );
end;
$$;

create or replace function public.create_my_order_shift_change_request(
  p_requested_order_period_template_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_current_template_id uuid;
  v_requested_template public.organization_order_period_templates%rowtype;
  v_current_count integer;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday smallint := extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint;
  v_target_week date := public.get_order_shift_change_target_week_start(now());
  v_allowed smallint[] := '{}'::smallint[];
  v_request_id uuid;
  v_driver_count integer;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_AUTH_REQUIRED');
  end if;
  if p_reason is not null and length(p_reason) > 2000 then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REASON_TOO_LONG');
  end if;

  select count(*) into v_driver_count
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id and p.id = v_actor_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if v_driver_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_DRIVERS';
  end if;
  select d.* into v_driver
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor_id and p.id = v_actor_id
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND');
  end if;

  -- Create lock order: authenticated driver, then all active assignments by id.
  -- This does not wait on a template lock, so it cannot cycle with the
  -- deployed template -> driver -> assignment order-period mutations.
  select * into v_driver
  from public.drivers d
  where d.id = v_driver.id and d.organization_id = v_driver.organization_id
  for update;
  if not found or v_driver.status <> 'active'::public.driver_status
     or v_driver.deleted_at is not null
     or v_driver.settlement_type <> 'per_order'::public.driver_settlement_type then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND');
  end if;

  perform 1 from public.organization_order_period_assignments
  where organization_id = v_driver.organization_id and driver_id = v_driver.id and is_active
  order by id for update;

  select coalesce(s.allowed_weekdays, '{}'::smallint[]) into v_allowed
  from public.organization_order_shift_change_settings s
  where s.organization_id = v_driver.organization_id;
  if not (v_allowed @> array[v_weekday]::smallint[]) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED');
  end if;

  -- The current assignment snapshot is intentionally taken only after the locks.
  select count(*), max(a.order_period_template_id)
    into v_current_count, v_current_template_id
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id
    and a.is_active and v_today >= a.assignment_start_date
    and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
    and t.is_active and t.archived_at is null;
  if v_current_count > 1 then
    raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_CURRENT_ASSIGNMENTS';
  end if;
  if v_current_template_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT');
  end if;
  if p_requested_order_period_template_id = v_current_template_id then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TEMPLATE_UNCHANGED');
  end if;

  select * into v_requested_template
  from public.organization_order_period_templates
  where id = p_requested_order_period_template_id and organization_id = v_driver.organization_id;
  if not found or not v_requested_template.is_active or v_requested_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TEMPLATE_INVALID');
  end if;

  if exists (
    select 1 from public.driver_order_shift_change_requests r
    where r.driver_id = v_driver.id and r.requested_week_start_date = v_target_week
      and r.status in ('pending', 'approved')
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TARGET_ALREADY_REQUESTED');
  end if;

  insert into public.driver_order_shift_change_requests (
    organization_id, driver_id, current_order_period_template_id,
    requested_order_period_template_id, requested_week_start_date, reason
  ) values (
    v_driver.organization_id, v_driver.id, v_current_template_id,
    p_requested_order_period_template_id, v_target_week, nullif(btrim(p_reason), '')
  ) returning id into v_request_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, v_driver.organization_id, 'order_shift_change_request_created',
    'driver_order_shift_change_request', v_request_id,
    jsonb_build_object('driver_id', v_driver.id,
      'current_order_period_template_id', v_current_template_id,
      'requested_order_period_template_id', p_requested_order_period_template_id,
      'requested_week_start_date', v_target_week, 'reason', nullif(btrim(p_reason), '')),
    jsonb_build_object('organization_id', v_driver.organization_id)
  );
  return jsonb_build_object('success', true, 'request_id', v_request_id,
    'target_week_start', v_target_week);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TARGET_ALREADY_REQUESTED');
end;
$$;

create or replace function public.set_organization_order_shift_change_settings(
  p_organization_id uuid,
  p_allowed_weekdays smallint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_allowed smallint[];
  v_previous_allowed smallint[];
  v_previous_exists boolean := false;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_SETTINGS_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_ORGANIZATION_INVALID');
  end if;
  if exists (
    select 1 from unnest(coalesce(p_allowed_weekdays, '{}'::smallint[])) x
    where x < 0 or x > 6
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_INVALID_WEEKDAY');
  end if;
  select public.normalize_order_shift_change_weekdays(p_allowed_weekdays) into v_allowed;

  select allowed_weekdays into v_previous_allowed
  from public.organization_order_shift_change_settings
  where organization_id = p_organization_id
  for update;
  v_previous_exists := found;

  insert into public.organization_order_shift_change_settings
    (organization_id, allowed_weekdays, updated_at, updated_by)
  values (p_organization_id, v_allowed, timezone('utc', now()), v_actor_id)
  on conflict (organization_id) do update set
    allowed_weekdays = excluded.allowed_weekdays,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_shift_change_settings_updated',
    'organization_order_shift_change_settings', p_organization_id,
    case when v_previous_exists then
      jsonb_build_object('organization_id', p_organization_id, 'allowed_weekdays', v_previous_allowed)
    else null end,
    jsonb_build_object('organization_id', p_organization_id, 'allowed_weekdays', v_allowed),
    jsonb_build_object('organization_id', p_organization_id)
  );
  return jsonb_build_object('success', true, 'allowed_weekdays', v_allowed);
end;
$$;

create or replace function public.approve_order_shift_change_request(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.driver_order_shift_change_requests%rowtype;
  v_driver public.drivers%rowtype;
  v_requested_template public.organization_order_period_templates%rowtype;
  v_current_template public.organization_order_period_templates%rowtype;
  v_assignment public.organization_order_period_assignments%rowtype;
  v_anchor public.organization_order_period_assignments%rowtype;
  v_target_count integer;
  v_anchor_count integer;
  v_week_end date;
  v_previous_end date;
  v_before boolean;
  v_after boolean;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_APPROVAL_AUTH_REQUIRED');
  end if;
  if p_review_note is not null and length(p_review_note) > 2000 then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REVIEW_NOTE_TOO_LONG');
  end if;

  select * into v_request
  from public.driver_order_shift_change_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REQUEST_NOT_PENDING');
  end if;
  if not public.has_organization_permission(v_actor_id, v_request.organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_APPROVAL_UNAUTHORIZED');
  end if;
  if v_request.requested_week_start_date <> public.get_order_shift_change_target_week_start(v_request.created_at) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_INVALID_TARGET_WEEK');
  end if;

  perform 1 from public.organization_order_period_templates
  where id = any(array[v_request.current_order_period_template_id, v_request.requested_order_period_template_id])
    and organization_id = v_request.organization_id
  order by id for update;
  select * into v_current_template from public.organization_order_period_templates
  where id = v_request.current_order_period_template_id and organization_id = v_request.organization_id;
  select * into v_requested_template from public.organization_order_period_templates
  where id = v_request.requested_order_period_template_id and organization_id = v_request.organization_id;
  if not found or not v_requested_template.is_active or v_requested_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_TEMPLATE_INVALID');
  end if;

  select * into v_driver from public.drivers
  where id = v_request.driver_id and organization_id = v_request.organization_id
  for update;
  if not found or v_driver.status <> 'active'::public.driver_status
     or v_driver.deleted_at is not null
     or v_driver.settlement_type <> 'per_order'::public.driver_settlement_type then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_ELIGIBLE');
  end if;

  -- Lock order: templates by id, driver, then all active driver assignments by id.
  perform 1 from public.organization_order_period_assignments
  where organization_id = v_request.organization_id and driver_id = v_request.driver_id and is_active
  order by id for update;

  v_week_end := v_request.requested_week_start_date + 6;
  v_previous_end := v_request.requested_week_start_date - 1;
  select count(*) into v_target_count
  from public.organization_order_period_assignments
  where organization_id = v_request.organization_id and driver_id = v_request.driver_id
    and is_active and assignment_start_date <= v_week_end
    and (assignment_end_date is null or assignment_end_date >= v_request.requested_week_start_date);
  if v_target_count > 1 then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_ASSIGNMENT_OVERLAP');
  end if;

  if v_target_count = 1 then
    select * into v_assignment
    from public.organization_order_period_assignments
    where organization_id = v_request.organization_id and driver_id = v_request.driver_id
      and is_active and assignment_start_date <= v_week_end
      and (assignment_end_date is null or assignment_end_date >= v_request.requested_week_start_date)
    limit 1;
    if v_assignment.order_period_template_id <> v_request.current_order_period_template_id then
      return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED');
    end if;
    v_before := v_assignment.assignment_start_date < v_request.requested_week_start_date;
    v_after := v_assignment.assignment_end_date is null or v_assignment.assignment_end_date > v_week_end;
    if v_before then
      update public.organization_order_period_assignments
      set assignment_end_date = v_request.requested_week_start_date - 1, updated_by = v_actor_id
      where id = v_assignment.id;
      insert into public.organization_order_period_assignments
        (organization_id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date, created_by, updated_by)
      values (v_request.organization_id, v_request.requested_order_period_template_id, v_request.driver_id,
        v_request.requested_week_start_date, v_week_end, v_actor_id, v_actor_id);
      if v_after then
        insert into public.organization_order_period_assignments
          (organization_id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date, created_by, updated_by)
        values (v_request.organization_id, v_request.current_order_period_template_id, v_request.driver_id,
          v_week_end + 1, v_assignment.assignment_end_date, v_actor_id, v_actor_id);
      end if;
    elsif v_after then
      update public.organization_order_period_assignments
      set order_period_template_id = v_request.requested_order_period_template_id,
          assignment_start_date = v_request.requested_week_start_date,
          assignment_end_date = v_week_end, updated_by = v_actor_id
      where id = v_assignment.id;
      insert into public.organization_order_period_assignments
        (organization_id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date, created_by, updated_by)
      values (v_request.organization_id, v_request.current_order_period_template_id, v_request.driver_id,
        v_week_end + 1, v_assignment.assignment_end_date, v_actor_id, v_actor_id);
    else
      update public.organization_order_period_assignments
      set order_period_template_id = v_request.requested_order_period_template_id,
          assignment_start_date = v_request.requested_week_start_date,
          assignment_end_date = v_week_end, updated_by = v_actor_id
      where id = v_assignment.id;
    end if;
  else
    select count(*) into v_anchor_count
    from public.organization_order_period_assignments
    where organization_id = v_request.organization_id and driver_id = v_request.driver_id
      and is_active and assignment_start_date <= v_previous_end
      and (assignment_end_date is null or assignment_end_date >= v_previous_end);
    if v_anchor_count <> 1 then
      return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT');
    end if;
    select * into v_anchor
    from public.organization_order_period_assignments
    where organization_id = v_request.organization_id and driver_id = v_request.driver_id
      and is_active and assignment_start_date <= v_previous_end
      and (assignment_end_date is null or assignment_end_date >= v_previous_end)
    limit 1;
    if v_anchor.order_period_template_id <> v_request.current_order_period_template_id then
      return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED');
    end if;
    v_after := v_anchor.assignment_end_date is null or v_anchor.assignment_end_date > v_week_end;
    update public.organization_order_period_assignments
    set assignment_end_date = v_previous_end, updated_by = v_actor_id
    where id = v_anchor.id;
    insert into public.organization_order_period_assignments
      (organization_id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date, created_by, updated_by)
    values (v_request.organization_id, v_request.requested_order_period_template_id, v_request.driver_id,
      v_request.requested_week_start_date, v_week_end, v_actor_id, v_actor_id);
    if v_after then
      insert into public.organization_order_period_assignments
        (organization_id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date, created_by, updated_by)
      values (v_request.organization_id, v_request.current_order_period_template_id, v_request.driver_id,
        v_week_end + 1, v_anchor.assignment_end_date, v_actor_id, v_actor_id);
    end if;
  end if;

  update public.driver_order_shift_change_requests
  set status = 'approved', reviewed_by = v_actor_id, reviewed_at = timezone('utc', now()),
      review_note = nullif(btrim(p_review_note), ''), updated_at = timezone('utc', now())
  where id = p_request_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, v_request.organization_id, 'order_shift_change_request_approved',
    'driver_order_shift_change_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved', 'requested_week_start_date', v_request.requested_week_start_date,
      'requested_order_period_template_id', v_request.requested_order_period_template_id),
    jsonb_build_object('driver_id', v_request.driver_id, 'review_note', nullif(btrim(p_review_note), ''))
  );
  return jsonb_build_object('success', true, 'request_id', p_request_id);
end;
$$;

create or replace function public.reject_order_shift_change_request(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.driver_order_shift_change_requests%rowtype;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REJECTION_AUTH_REQUIRED');
  end if;
  if p_review_note is not null and length(p_review_note) > 2000 then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REVIEW_NOTE_TOO_LONG');
  end if;
  select * into v_request from public.driver_order_shift_change_requests
  where id = p_request_id and status = 'pending' for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REQUEST_NOT_PENDING');
  end if;
  if not public.has_organization_permission(v_actor_id, v_request.organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_REJECTION_UNAUTHORIZED');
  end if;
  update public.driver_order_shift_change_requests
  set status = 'rejected', reviewed_by = v_actor_id, reviewed_at = timezone('utc', now()),
      review_note = nullif(btrim(p_review_note), ''), updated_at = timezone('utc', now())
  where id = p_request_id;
  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, v_request.organization_id, 'order_shift_change_request_rejected',
    'driver_order_shift_change_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'review_note', nullif(btrim(p_review_note), '')),
    jsonb_build_object('driver_id', v_request.driver_id)
  );
  return jsonb_build_object('success', true, 'request_id', p_request_id);
end;
$$;

revoke all on function public.get_order_shift_change_target_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public.get_my_order_shift_change_request_window() from public, anon;
revoke all on function public.create_my_order_shift_change_request(uuid, text) from public, anon;
revoke all on function public.set_organization_order_shift_change_settings(uuid, smallint[]) from public, anon;
revoke all on function public.approve_order_shift_change_request(uuid, text) from public, anon;
revoke all on function public.reject_order_shift_change_request(uuid, text) from public, anon;
grant execute on function public.get_my_order_shift_change_request_window() to authenticated, service_role;
grant execute on function public.create_my_order_shift_change_request(uuid, text) to authenticated, service_role;
grant execute on function public.set_organization_order_shift_change_settings(uuid, smallint[]) to authenticated, service_role;
grant execute on function public.approve_order_shift_change_request(uuid, text) to authenticated, service_role;
grant execute on function public.reject_order_shift_change_request(uuid, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
