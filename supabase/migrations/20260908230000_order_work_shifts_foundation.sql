-- Phase 1: dedicated work-shift storage for per-order drivers.
-- This migration does not create delivery-order records or alter business data.

create or replace function public.organization_permission_keys()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'drivers.create',
    'drivers.update', 'drivers.status', 'drivers.archive',
    'drivers.documents.view', 'drivers.documents.download', 'drivers.activity.view',
    'drivers.account.manage', 'driver_reports.view', 'driver_reports.import',
    'driver_reports.replace', 'driver_reports.details.view', 'fleet.cars.view',
    'fleet.motorcycles.view', 'fleet.create', 'fleet.update',
    'fleet.technical_status', 'fleet.operational_status', 'fleet.archive',
    'fleet.operating_card.download', 'fleet.activity.view', 'fuel.manage',
    'fuel.reports.view', 'fuel.increase.review', 'app_requests.view',
    'app_requests.review', 'odometer.manage', 'notifications.view',
    'driver_warnings.view', 'driver_warnings.issue', 'driver_warnings.revoke',
    -- Retain legacy permission rows for historical compatibility. These keys
    -- are intentionally absent from the active Admin permission registry.
    'entitlements.view', 'entitlements.create_transaction',
    'entitlements.view_transactions', 'entitlements.reverse_transaction',
    'entitlements.publish',
    'shifts.view', 'shifts.create', 'shifts.update', 'shifts.assign',
    'shifts.archive', 'maintenance_providers.view', 'maintenance_providers.manage',
    'maintenance_jobs.view', 'maintenance_jobs.assign', 'maintenance_jobs.cancel',
    'maintenance_materials.view', 'maintenance_materials.manage',
    'order_periods.view', 'order_periods.manage', 'order_periods.assign'
  ]::text[];
$$;

create or replace function public.view_only_organization_permission_keys()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'driver_reports.view',
    'fleet.cars.view', 'fleet.motorcycles.view', 'fuel.reports.view',
    'app_requests.view', 'odometer.manage', 'notifications.view',
    'driver_warnings.view', 'entitlements.view', 'entitlements.view_transactions',
    'shifts.view', 'maintenance_providers.view',
    'maintenance_jobs.view', 'maintenance_materials.view', 'order_periods.view'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key = any(public.organization_permission_keys())
  );

create table if not exists public.organization_order_period_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_order_period_templates_name_not_blank
    check (length(btrim(name)) between 1 and 160),
  constraint organization_order_period_templates_time_shape
    check (
      start_time <> end_time
      and (
        (crosses_midnight = true and end_time <= start_time)
        or (crosses_midnight = false and end_time > start_time)
      )
    ),
  constraint organization_order_period_templates_id_organization_key
    unique (id, organization_id)
);

create table if not exists public.organization_order_period_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_period_template_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  assignment_start_date date not null,
  assignment_end_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_order_period_assignments_template_fkey
    foreign key (order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id)
    on delete restrict,
  constraint organization_order_period_assignments_dates_check
    check (assignment_end_date is null or assignment_end_date >= assignment_start_date)
);

create index if not exists organization_order_period_templates_org_active_idx
  on public.organization_order_period_templates (organization_id, is_active, archived_at, start_time);

create unique index if not exists organization_order_period_templates_active_name_key
  on public.organization_order_period_templates (organization_id, lower(btrim(name)))
  where is_active = true and archived_at is null;

create index if not exists organization_order_period_assignments_org_week_idx
  on public.organization_order_period_assignments
    (organization_id, is_active, assignment_start_date, assignment_end_date);

create index if not exists organization_order_period_assignments_template_week_idx
  on public.organization_order_period_assignments
    (order_period_template_id, is_active, assignment_start_date, assignment_end_date);

create index if not exists organization_order_period_assignments_driver_week_idx
  on public.organization_order_period_assignments
    (organization_id, driver_id, is_active, assignment_start_date, assignment_end_date);

create or replace function public.set_order_period_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_order_period_templates_updated_at
  on public.organization_order_period_templates;
create trigger set_order_period_templates_updated_at
  before update on public.organization_order_period_templates
  for each row execute function public.set_order_period_updated_at();

drop trigger if exists set_order_period_assignments_updated_at
  on public.organization_order_period_assignments;
create trigger set_order_period_assignments_updated_at
  before update on public.organization_order_period_assignments
  for each row execute function public.set_order_period_updated_at();

alter table public.organization_order_period_templates enable row level security;
alter table public.organization_order_period_assignments enable row level security;

revoke all on public.organization_order_period_templates from anon, authenticated;
revoke all on public.organization_order_period_assignments from anon, authenticated;
grant select on public.organization_order_period_templates to authenticated;
grant select on public.organization_order_period_assignments to authenticated;
grant select, insert, update on public.organization_order_period_templates to service_role;
grant select, insert, update on public.organization_order_period_assignments to service_role;

drop policy if exists organization_order_period_templates_select_scoped
  on public.organization_order_period_templates;
create policy organization_order_period_templates_select_scoped
  on public.organization_order_period_templates
  for select to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'order_periods.view')
    or exists (
      select 1
      from public.organization_order_period_assignments a
      join public.drivers d on d.id = a.driver_id
      join public.profiles p on p.id = d.auth_user_id
      where a.order_period_template_id = organization_order_period_templates.id
        and a.is_active = true
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
  );

drop policy if exists organization_order_period_assignments_select_scoped
  on public.organization_order_period_assignments;
create policy organization_order_period_assignments_select_scoped
  on public.organization_order_period_assignments
  for select to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'order_periods.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      where d.id = organization_order_period_assignments.driver_id
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.organization_id = organization_order_period_assignments.organization_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_order_period_templates'
    ) then
      alter publication supabase_realtime add table public.organization_order_period_templates;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_order_period_assignments'
    ) then
      alter publication supabase_realtime add table public.organization_order_period_assignments;
    end if;
  end if;
end;
$$;

create or replace function public.create_order_period_template(
  p_organization_id uuid,
  p_name text,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template_id uuid;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160
     or p_start_time is null or p_end_time is null
     or p_crosses_midnight is null
     or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;

  insert into public.organization_order_period_templates (
    organization_id, name, start_time, end_time, crosses_midnight, created_by, updated_by
  ) values (
    p_organization_id, btrim(p_name), p_start_time, p_end_time,
    p_crosses_midnight, v_actor_id, v_actor_id
  ) returning id into v_template_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_template_created',
    'organization_order_period_template', v_template_id,
    jsonb_build_object('name', btrim(p_name), 'start_time', p_start_time,
      'end_time', p_end_time, 'crosses_midnight', p_crosses_midnight),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'template_id', v_template_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

create or replace function public.update_order_period_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_name text,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160
     or p_start_time is null or p_end_time is null
     or p_crosses_midnight is null
     or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_template_id and organization_id = p_organization_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND');
  end if;
  if not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ARCHIVED');
  end if;

  update public.organization_order_period_templates
  set name = btrim(p_name), start_time = p_start_time, end_time = p_end_time,
      crosses_midnight = p_crosses_midnight, updated_by = v_actor_id
  where id = p_template_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_template_updated',
    'organization_order_period_template', p_template_id,
    jsonb_build_object('name', v_template.name, 'start_time', v_template.start_time,
      'end_time', v_template.end_time, 'crosses_midnight', v_template.crosses_midnight),
    jsonb_build_object('name', btrim(p_name), 'start_time', p_start_time,
      'end_time', p_end_time, 'crosses_midnight', p_crosses_midnight),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'template_id', p_template_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

create or replace function public.archive_order_period_template(
  p_template_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_template_id and organization_id = p_organization_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND');
  end if;
  if exists (
    select 1 from public.organization_order_period_assignments
    where order_period_template_id = p_template_id and is_active
      and (assignment_end_date is null or assignment_end_date >= v_today)
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_HAS_CURRENT_OR_FUTURE_ASSIGNMENTS');
  end if;

  update public.organization_order_period_templates
  set is_active = false, archived_at = timezone('utc', now()), archived_by = v_actor_id,
      updated_by = v_actor_id
  where id = p_template_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_template_archived',
    'organization_order_period_template', p_template_id,
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'template_id', p_template_id);
end;
$$;

create or replace function public.replace_order_period_week_members(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_week_start date,
  p_week_end date,
  p_driver_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_current_start date := v_today - extract(dow from v_today)::integer;
  v_current_end date := v_current_start + 6;
  v_selected uuid[] := coalesce((select array_agg(distinct driver_id order by driver_id)
    from unnest(coalesce(p_driver_ids, '{}'::uuid[])) x(driver_id)
    where driver_id is not null), '{}'::uuid[]);
  v_relevant uuid[];
  v_count integer;
  v_removed integer := 0;
  v_added integer := 0;
  v_assignment public.organization_order_period_assignments%rowtype;
  v_driver_id uuid;
  v_before boolean;
  v_after boolean;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_MEMBERSHIP_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_week_start is null or p_week_end is null or not (
    (p_week_start = v_current_start and p_week_end = v_current_start + 6)
    or (p_week_start = v_current_start + 7 and p_week_end = v_current_start + 13)
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_WEEK_RANGE');
  end if;

  perform 1 from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id
    and is_active and archived_at is null
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND');
  end if;

  select coalesce(array_agg(distinct driver_id order by driver_id), '{}'::uuid[]) into v_relevant
  from public.organization_order_period_assignments
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id
    and is_active and assignment_start_date <= p_week_end
    and (assignment_end_date is null or assignment_end_date >= p_week_start);
  v_relevant := v_relevant || v_selected;
  select coalesce(array_agg(distinct driver_id order by driver_id), '{}'::uuid[]) into v_relevant
  from unnest(v_relevant) x(driver_id);

  -- Lock order: template, relevant drivers by id, then all their active assignments by id.
  perform 1 from public.drivers
  where organization_id = p_organization_id and id = any(v_relevant)
  order by id for update;

  select count(*) into v_count from public.drivers
  where organization_id = p_organization_id and id = any(v_selected)
    and status = 'active'::public.driver_status and deleted_at is null
    and settlement_type = 'per_order'::public.driver_settlement_type;
  if v_count <> cardinality(v_selected) then
    return jsonb_build_object('success', false, 'error', 'DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD');
  end if;

  perform 1 from public.organization_order_period_assignments
  where organization_id = p_organization_id and driver_id = any(v_relevant) and is_active
  order by driver_id, id for update;

  if exists (
    select 1 from public.organization_order_period_assignments
    where organization_id = p_organization_id and driver_id = any(v_selected)
      and order_period_template_id <> p_order_period_template_id and is_active
      and assignment_start_date <= p_week_end
      and (assignment_end_date is null or assignment_end_date >= p_week_start)
  ) then
    return jsonb_build_object('success', false, 'error', 'DRIVER_ALREADY_ASSIGNED_THIS_WEEK');
  end if;

  if exists (
    select driver_id
    from public.organization_order_period_assignments
    where organization_id = p_organization_id and driver_id = any(v_selected)
      and is_active and assignment_start_date <= p_week_end
      and (assignment_end_date is null or assignment_end_date >= p_week_start)
    group by driver_id
    having count(*) > 1
  ) then
    return jsonb_build_object('success', false, 'error', 'DRIVER_HAS_MULTIPLE_ASSIGNMENTS_THIS_WEEK');
  end if;

  for v_assignment in
    select * from public.organization_order_period_assignments
    where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id
      and is_active and assignment_start_date <= p_week_end
      and (assignment_end_date is null or assignment_end_date >= p_week_start)
    order by driver_id, id for update
  loop
    if not (v_assignment.driver_id = any(v_selected)) then
      v_before := v_assignment.assignment_start_date < p_week_start;
      v_after := v_assignment.assignment_end_date is null or v_assignment.assignment_end_date > p_week_end;
      if v_before then
        update public.organization_order_period_assignments
        set assignment_end_date = p_week_start - 1, updated_by = v_actor_id
        where id = v_assignment.id;
        if v_after then
          insert into public.organization_order_period_assignments (
            organization_id, order_period_template_id, driver_id,
            assignment_start_date, assignment_end_date, created_by, updated_by
          ) values (
            p_organization_id, p_order_period_template_id, v_assignment.driver_id,
            p_week_end + 1, v_assignment.assignment_end_date, v_actor_id, v_actor_id
          );
        end if;
      elsif v_after then
        update public.organization_order_period_assignments
        set assignment_start_date = p_week_end + 1, updated_by = v_actor_id
        where id = v_assignment.id;
      else
        update public.organization_order_period_assignments
        set is_active = false, updated_by = v_actor_id
        where id = v_assignment.id;
      end if;
      v_removed := v_removed + 1;
    end if;
  end loop;

  for v_driver_id in
    select d.id from public.drivers d
    where d.organization_id = p_organization_id and d.id = any(v_selected)
      and not exists (
        select 1 from public.organization_order_period_assignments a
        where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
          and a.driver_id = d.id and a.is_active
          and a.assignment_start_date <= p_week_end
          and (a.assignment_end_date is null or a.assignment_end_date >= p_week_start)
      )
  loop
    insert into public.organization_order_period_assignments (
      organization_id, order_period_template_id, driver_id,
      assignment_start_date, assignment_end_date, created_by, updated_by
    ) values (
      p_organization_id, p_order_period_template_id, v_driver_id,
      p_week_start, p_week_end, v_actor_id, v_actor_id
    );
    v_added := v_added + 1;
  end loop;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_week_membership_replaced',
    'organization_order_period_template', p_order_period_template_id,
    jsonb_build_object('week_start', p_week_start, 'week_end', p_week_end,
      'added_count', v_added, 'removed_count', v_removed),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'added_count', v_added, 'removed_count', v_removed);
end;
$$;

create or replace function public.move_order_period_driver(
  p_organization_id uuid,
  p_source_order_period_id uuid,
  p_target_order_period_id uuid,
  p_driver_id uuid,
  p_week_start date,
  p_week_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_current_start date := v_today - extract(dow from v_today)::integer;
  v_source public.organization_order_period_templates%rowtype;
  v_target public.organization_order_period_templates%rowtype;
  v_driver public.drivers%rowtype;
  v_assignment public.organization_order_period_assignments%rowtype;
  v_conflict uuid;
  v_before boolean;
  v_after boolean;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_MOVE_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_source_order_period_id = p_target_order_period_id
     or p_week_start is null or p_week_end <> p_week_start + 6
     or not (p_week_start = v_current_start or p_week_start = v_current_start + 7) then
    return jsonb_build_object('success', false, 'error', 'INVALID_WEEK_RANGE');
  end if;

  -- Lock order: both templates by id, then driver, then all driver assignments by id.
  perform 1 from public.organization_order_period_templates
  where id = any(array[p_source_order_period_id, p_target_order_period_id])
    and organization_id = p_organization_id and is_active and archived_at is null
  order by id for update;
  select * into v_source from public.organization_order_period_templates
  where id = p_source_order_period_id and organization_id = p_organization_id
    and is_active and archived_at is null;
  select * into v_target from public.organization_order_period_templates
  where id = p_target_order_period_id and organization_id = p_organization_id
    and is_active and archived_at is null;
  if not found or v_source.id is null or v_target.id is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND');
  end if;

  select * into v_driver from public.drivers
  where id = p_driver_id and organization_id = p_organization_id for update;
  if not found or v_driver.status <> 'active'::public.driver_status
     or v_driver.deleted_at is not null
     or v_driver.settlement_type <> 'per_order'::public.driver_settlement_type then
    return jsonb_build_object('success', false, 'error', 'DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD');
  end if;

  perform 1 from public.organization_order_period_assignments
  where organization_id = p_organization_id and driver_id = p_driver_id and is_active
  order by id for update;

  select * into v_assignment
  from public.organization_order_period_assignments
  where organization_id = p_organization_id and order_period_template_id = p_source_order_period_id
    and driver_id = p_driver_id and is_active
    and assignment_start_date <= p_week_end
    and (assignment_end_date is null or assignment_end_date >= p_week_start)
  order by assignment_start_date desc, id desc limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'SOURCE_ORDER_PERIOD_ASSIGNMENT_NOT_FOUND');
  end if;

  select id into v_conflict
  from public.organization_order_period_assignments
  where organization_id = p_organization_id and driver_id = p_driver_id
    and order_period_template_id = p_target_order_period_id and is_active
    and assignment_start_date <= p_week_end
    and (assignment_end_date is null or assignment_end_date >= p_week_start)
  limit 1;
  if v_conflict is not null then
    return jsonb_build_object('success', false, 'error', 'DRIVER_ALREADY_ASSIGNED_THIS_WEEK');
  end if;

  v_before := v_assignment.assignment_start_date < p_week_start;
  v_after := v_assignment.assignment_end_date is null or v_assignment.assignment_end_date > p_week_end;
  if v_before then
    update public.organization_order_period_assignments
    set assignment_end_date = p_week_start - 1, updated_by = v_actor_id
    where id = v_assignment.id;
    insert into public.organization_order_period_assignments (
      organization_id, order_period_template_id, driver_id,
      assignment_start_date, assignment_end_date, created_by, updated_by
    ) values (
      p_organization_id, p_target_order_period_id, p_driver_id,
      p_week_start, p_week_end, v_actor_id, v_actor_id
    );
    if v_after then
      insert into public.organization_order_period_assignments (
        organization_id, order_period_template_id, driver_id,
        assignment_start_date, assignment_end_date, created_by, updated_by
      ) values (
        p_organization_id, p_source_order_period_id, p_driver_id,
        p_week_end + 1, v_assignment.assignment_end_date, v_actor_id, v_actor_id
      );
    end if;
  elsif v_after then
    update public.organization_order_period_assignments
    set order_period_template_id = p_target_order_period_id,
        assignment_start_date = p_week_start, assignment_end_date = p_week_end,
        updated_by = v_actor_id
    where id = v_assignment.id;
    insert into public.organization_order_period_assignments (
      organization_id, order_period_template_id, driver_id,
      assignment_start_date, assignment_end_date, created_by, updated_by
    ) values (
      p_organization_id, p_source_order_period_id, p_driver_id,
      p_week_end + 1, v_assignment.assignment_end_date, v_actor_id, v_actor_id
    );
  else
    update public.organization_order_period_assignments
    set order_period_template_id = p_target_order_period_id,
        assignment_start_date = p_week_start, assignment_end_date = p_week_end,
        updated_by = v_actor_id
    where id = v_assignment.id;
  end if;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_driver_moved',
    'organization_order_period_assignment', v_assignment.id,
    jsonb_build_object('order_period_template_id', p_source_order_period_id),
    jsonb_build_object('order_period_template_id', p_target_order_period_id,
      'week_start', p_week_start, 'week_end', p_week_end),
    jsonb_build_object('driver_id', p_driver_id)
  );

  return jsonb_build_object('success', true, 'driver_id', p_driver_id,
    'source_order_period_id', p_source_order_period_id,
    'target_order_period_id', p_target_order_period_id);
end;
$$;

create or replace function public.get_my_order_period_assignment(
  p_effective_date date default null
)
returns table (
  assignment_id uuid,
  template_id uuid,
  template_name text,
  start_time time,
  end_time time,
  crosses_midnight boolean,
  assignment_start_date date,
  assignment_end_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_date date := coalesce(p_effective_date, (now() at time zone 'Asia/Riyadh')::date);
  v_match_count integer;
begin
  select count(*) into v_match_count
  from public.drivers d
  join public.organizations o on o.id = d.organization_id and o.is_active
  join public.organization_order_period_assignments a
    on a.driver_id = d.id and a.organization_id = d.organization_id and a.is_active
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
    and t.is_active and t.archived_at is null
  where d.auth_user_id = auth.uid()
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type
    and v_effective_date >= a.assignment_start_date
    and (a.assignment_end_date is null or v_effective_date <= a.assignment_end_date);

  if v_match_count > 1 then
    raise exception 'ORDER_PERIOD_DATA_INTEGRITY_MULTIPLE_MATCHES';
  end if;

  return query
  select a.id, t.id, t.name, t.start_time, t.end_time, t.crosses_midnight,
    a.assignment_start_date, a.assignment_end_date
  from public.drivers d
  join public.organization_order_period_assignments a
    on a.driver_id = d.id and a.organization_id = d.organization_id and a.is_active
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
    and t.is_active and t.archived_at is null
  where d.auth_user_id = auth.uid()
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type
    and v_effective_date >= a.assignment_start_date
    and (a.assignment_end_date is null or v_effective_date <= a.assignment_end_date);
end;
$$;

revoke all on function public.create_order_period_template(uuid, text, time, time, boolean) from public, anon;
revoke all on function public.update_order_period_template(uuid, uuid, text, time, time, boolean) from public, anon;
revoke all on function public.archive_order_period_template(uuid, uuid) from public, anon;
revoke all on function public.replace_order_period_week_members(uuid, uuid, date, date, uuid[]) from public, anon;
revoke all on function public.move_order_period_driver(uuid, uuid, uuid, uuid, date, date) from public, anon;
revoke all on function public.get_my_order_period_assignment(date) from public, anon;

grant execute on function public.create_order_period_template(uuid, text, time, time, boolean) to authenticated, service_role;
grant execute on function public.update_order_period_template(uuid, uuid, text, time, time, boolean) to authenticated, service_role;
grant execute on function public.archive_order_period_template(uuid, uuid) to authenticated, service_role;
grant execute on function public.replace_order_period_week_members(uuid, uuid, date, date, uuid[]) to authenticated, service_role;
grant execute on function public.move_order_period_driver(uuid, uuid, uuid, uuid, date, date) to authenticated, service_role;
grant execute on function public.get_my_order_period_assignment(date) to authenticated, service_role;

notify pgrst, 'reload schema';
