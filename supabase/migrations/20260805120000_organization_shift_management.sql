-- Persistent organization shift templates and driver assignments.
-- driver_shifts remains the Driver PWA odometer/session history table.

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

create table if not exists public.organization_shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  has_break boolean not null default false,
  break_start_time time null,
  break_end_time time null,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_shift_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint organization_shift_templates_non_zero_duration check (start_time <> end_time),
  constraint organization_shift_templates_break_shape check (
    (
      has_break = false
      and break_start_time is null
      and break_end_time is null
    )
    or (
      has_break = true
      and break_start_time is not null
      and break_end_time is not null
      and break_start_time <> break_end_time
    )
  )
);

create index if not exists organization_shift_templates_org_active_idx
  on public.organization_shift_templates (organization_id, is_active, archived_at, start_time);

create table if not exists public.organization_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shift_template_id uuid not null references public.organization_shift_templates(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  assignment_start_date date null,
  assignment_end_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_shift_assignments_dates_check check (
    assignment_end_date is null
    or assignment_start_date is null
    or assignment_end_date >= assignment_start_date
  )
);

create unique index if not exists organization_shift_assignments_active_driver_shift_key
  on public.organization_shift_assignments (shift_template_id, driver_id)
  where is_active = true;

create index if not exists organization_shift_assignments_org_active_idx
  on public.organization_shift_assignments (organization_id, is_active, shift_template_id);

create index if not exists organization_shift_assignments_driver_active_idx
  on public.organization_shift_assignments (driver_id, is_active);

create or replace function public.set_organization_shift_templates_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  new.crosses_midnight = new.end_time <= new.start_time;
  if new.has_break = false then
    new.break_start_time = null;
    new.break_end_time = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_organization_shift_templates_updated_at
  on public.organization_shift_templates;
create trigger set_organization_shift_templates_updated_at
  before insert or update on public.organization_shift_templates
  for each row
  execute function public.set_organization_shift_templates_updated_at();

create or replace function public.set_organization_shift_assignments_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_organization_shift_assignments_updated_at
  on public.organization_shift_assignments;
create trigger set_organization_shift_assignments_updated_at
  before update on public.organization_shift_assignments
  for each row
  execute function public.set_organization_shift_assignments_updated_at();

alter table public.organization_shift_templates enable row level security;
alter table public.organization_shift_assignments enable row level security;

revoke all on public.organization_shift_templates from anon, authenticated;
revoke all on public.organization_shift_assignments from anon, authenticated;
grant select on public.organization_shift_templates to authenticated;
grant select on public.organization_shift_assignments to authenticated;
grant select, insert, update on public.organization_shift_templates to service_role;
grant select, insert, update on public.organization_shift_assignments to service_role;

drop policy if exists organization_shift_templates_select_scoped on public.organization_shift_templates;
create policy organization_shift_templates_select_scoped
  on public.organization_shift_templates
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'shifts.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p
        on p.id = d.auth_user_id
      join public.organization_shift_assignments osa
        on osa.shift_template_id = organization_shift_templates.id
       and osa.driver_id = d.id
       and osa.is_active = true
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );

drop policy if exists organization_shift_assignments_select_scoped on public.organization_shift_assignments;
create policy organization_shift_assignments_select_scoped
  on public.organization_shift_assignments
  for select
  to authenticated
  using (
    public.has_organization_permission(auth.uid(), organization_id, 'shifts.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p
        on p.id = d.auth_user_id
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.id = organization_shift_assignments.driver_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_shift_templates'
    ) then
      alter publication supabase_realtime add table public.organization_shift_templates;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'organization_shift_assignments'
    ) then
      alter publication supabase_realtime add table public.organization_shift_assignments;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
