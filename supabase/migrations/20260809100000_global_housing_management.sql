-- Global Housing / Accommodation Management
-- Housing is a global source of truth. Organizations and drivers are assignments.

create or replace function public.actor_has_global_permission(
  p_actor_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and (
        p.role = 'system_owner'::public.app_role
        or exists (
          select 1
          from public.user_global_permissions ugp
          where ugp.user_id = p_actor_user_id
            and ugp.permission_key = p_permission_key
        )
      )
  );
$$;

revoke all on function public.actor_has_global_permission(uuid, text) from public, anon;
grant execute on function public.actor_has_global_permission(uuid, text) to authenticated, service_role;

alter table public.user_global_permissions
  drop constraint if exists user_global_permissions_permission_key_check,
  add constraint user_global_permissions_permission_key_check check (
    permission_key in (
      'fleet.view',
      'fleet.create',
      'fleet.update',
      'fleet.technical_status',
      'fleet.operational_status',
      'fleet.archive',
      'fleet.operating_card.download',
      'fleet.activity.view',
      'housing.view',
      'housing.create',
      'housing.update',
      'housing.archive',
      'housing.assign_organizations',
      'housing.assign_drivers',
      'housing.activity.view'
    )
  );

create table if not exists public.housing_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text null,
  address text null,
  city text null,
  location_notes text null,
  capacity integer not null,
  status text not null default 'active',
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  archived_by uuid null references public.profiles(id) on delete set null,
  constraint housing_units_name_not_blank check (length(btrim(name)) > 0),
  constraint housing_units_code_not_blank check (code is null or length(btrim(code)) > 0),
  constraint housing_units_code_unique unique (code),
  constraint housing_units_capacity_positive check (capacity > 0),
  constraint housing_units_status_check check (status in ('active', 'full', 'maintenance', 'inactive'))
);

create table if not exists public.housing_organization_assignments (
  id uuid primary key default gen_random_uuid(),
  housing_id uuid not null references public.housing_units(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  active boolean not null default true,
  assigned_at timestamptz not null default timezone('utc', now()),
  unassigned_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint housing_organization_assignment_dates_check check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

create table if not exists public.housing_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  housing_id uuid not null references public.housing_units(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  assigned_at timestamptz not null default timezone('utc', now()),
  unassigned_at timestamptz null,
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint housing_driver_assignment_dates_check check (
    unassigned_at is null or unassigned_at >= assigned_at
  )
);

create unique index if not exists housing_units_code_unique_not_null_idx
  on public.housing_units (lower(code))
  where code is not null and archived_at is null;

create index if not exists housing_units_status_archived_idx
  on public.housing_units (status, archived_at);

create index if not exists housing_organization_assignments_housing_idx
  on public.housing_organization_assignments (housing_id, active);

create index if not exists housing_organization_assignments_organization_idx
  on public.housing_organization_assignments (organization_id, active);

create unique index if not exists housing_organization_assignments_active_unique
  on public.housing_organization_assignments (housing_id, organization_id)
  where active is true;

create index if not exists housing_driver_assignments_housing_idx
  on public.housing_driver_assignments (housing_id, unassigned_at);

create index if not exists housing_driver_assignments_driver_idx
  on public.housing_driver_assignments (driver_id, unassigned_at);

create unique index if not exists housing_driver_assignments_one_active_driver
  on public.housing_driver_assignments (driver_id)
  where unassigned_at is null;

alter table public.housing_units enable row level security;
alter table public.housing_organization_assignments enable row level security;
alter table public.housing_driver_assignments enable row level security;

revoke all on public.housing_units from public, anon;
revoke all on public.housing_organization_assignments from public, anon;
revoke all on public.housing_driver_assignments from public, anon;

grant select, insert, update on public.housing_units to authenticated;
grant select, insert, update on public.housing_organization_assignments to authenticated;
grant select, insert, update on public.housing_driver_assignments to authenticated;

grant select, insert, update, delete on public.housing_units to service_role;
grant select, insert, update, delete on public.housing_organization_assignments to service_role;
grant select, insert, update, delete on public.housing_driver_assignments to service_role;

drop policy if exists housing_units_select_global_view on public.housing_units;
create policy housing_units_select_global_view
  on public.housing_units
  for select
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.view'));

drop policy if exists housing_units_insert_global_create on public.housing_units;
create policy housing_units_insert_global_create
  on public.housing_units
  for insert
  to authenticated
  with check (public.actor_has_global_permission(auth.uid(), 'housing.create'));

drop policy if exists housing_units_update_global_update_archive on public.housing_units;
create policy housing_units_update_global_update_archive
  on public.housing_units
  for update
  to authenticated
  using (
    public.actor_has_global_permission(auth.uid(), 'housing.update')
    or public.actor_has_global_permission(auth.uid(), 'housing.archive')
  )
  with check (
    public.actor_has_global_permission(auth.uid(), 'housing.update')
    or public.actor_has_global_permission(auth.uid(), 'housing.archive')
  );

drop policy if exists housing_organization_assignments_select_global_view on public.housing_organization_assignments;
create policy housing_organization_assignments_select_global_view
  on public.housing_organization_assignments
  for select
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.view'));

drop policy if exists housing_organization_assignments_mutate_global_assign on public.housing_organization_assignments;
create policy housing_organization_assignments_mutate_global_assign
  on public.housing_organization_assignments
  for all
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.assign_organizations'))
  with check (public.actor_has_global_permission(auth.uid(), 'housing.assign_organizations'));

drop policy if exists housing_driver_assignments_select_global_view on public.housing_driver_assignments;
create policy housing_driver_assignments_select_global_view
  on public.housing_driver_assignments
  for select
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.view'));

drop policy if exists housing_driver_assignments_mutate_global_assign on public.housing_driver_assignments;
create policy housing_driver_assignments_mutate_global_assign
  on public.housing_driver_assignments
  for all
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.assign_drivers'))
  with check (public.actor_has_global_permission(auth.uid(), 'housing.assign_drivers'));

create or replace function public.insert_housing_activity(
  p_actor_user_id uuid,
  p_housing_id uuid,
  p_action text,
  p_entity_id uuid default null,
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
    null,
    p_action,
    'housing',
    coalesce(p_entity_id, p_housing_id),
    p_before_data,
    p_after_data,
    jsonb_build_object('housing_id', p_housing_id) || coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.insert_housing_activity(uuid, uuid, text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.insert_housing_activity(uuid, uuid, text, uuid, jsonb, jsonb, jsonb) to service_role;

create or replace function public.assign_driver_to_housing(
  p_actor_user_id uuid,
  p_housing_id uuid,
  p_driver_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_housing public.housing_units%rowtype;
  v_driver public.drivers%rowtype;
  v_old_assignment public.housing_driver_assignments%rowtype;
  v_new_assignment_id uuid;
  v_occupied integer;
  v_action text := 'housing_driver_assigned';
  v_had_old_assignment boolean := false;
begin
  if not public.actor_has_global_permission(p_actor_user_id, 'housing.assign_drivers') then
    raise exception 'HOUSING_PERMISSION_DENIED';
  end if;

  select * into v_housing
  from public.housing_units
  where id = p_housing_id
  for update;

  if not found or v_housing.archived_at is not null then
    raise exception 'HOUSING_UNAVAILABLE';
  end if;

  if v_housing.status in ('inactive', 'maintenance', 'full') then
    raise exception 'HOUSING_NOT_ASSIGNABLE';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and status = 'active'::public.driver_status
    and deleted_at is null;

  if not found then
    raise exception 'HOUSING_DRIVER_UNAVAILABLE';
  end if;

  select * into v_old_assignment
  from public.housing_driver_assignments
  where driver_id = p_driver_id
    and unassigned_at is null
  for update;
  v_had_old_assignment := found;

  if v_had_old_assignment and v_old_assignment.housing_id = p_housing_id then
    return jsonb_build_object('assignment_id', v_old_assignment.id, 'moved', false, 'unchanged', true);
  end if;

  select count(*)::integer into v_occupied
  from public.housing_driver_assignments
  where housing_id = p_housing_id
    and unassigned_at is null;

  if v_occupied >= v_housing.capacity then
    raise exception 'HOUSING_FULL';
  end if;

  if v_had_old_assignment then
    update public.housing_driver_assignments
    set unassigned_at = timezone('utc', now()),
        updated_by = p_actor_user_id
    where id = v_old_assignment.id;
    v_action := 'housing_driver_moved';
  end if;

  insert into public.housing_driver_assignments (
    housing_id,
    driver_id,
    notes,
    created_by,
    updated_by
  )
  values (
    p_housing_id,
    p_driver_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into v_new_assignment_id;

  perform public.insert_housing_activity(
    p_actor_user_id,
    p_housing_id,
    v_action,
    p_driver_id,
    case when v_had_old_assignment then jsonb_build_object('housing_id', v_old_assignment.housing_id, 'assignment_id', v_old_assignment.id) else null end,
    jsonb_build_object('housing_id', p_housing_id, 'driver_id', p_driver_id, 'assignment_id', v_new_assignment_id),
    jsonb_build_object('driver_id', p_driver_id)
  );

  return jsonb_build_object('assignment_id', v_new_assignment_id, 'moved', v_had_old_assignment, 'unchanged', false);
end;
$$;

create or replace function public.remove_driver_from_housing(
  p_actor_user_id uuid,
  p_housing_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.housing_driver_assignments%rowtype;
begin
  if not public.actor_has_global_permission(p_actor_user_id, 'housing.assign_drivers') then
    raise exception 'HOUSING_PERMISSION_DENIED';
  end if;

  select * into v_assignment
  from public.housing_driver_assignments
  where housing_id = p_housing_id
    and driver_id = p_driver_id
    and unassigned_at is null
  for update;

  if not found then
    raise exception 'HOUSING_ASSIGNMENT_UNAVAILABLE';
  end if;

  update public.housing_driver_assignments
  set unassigned_at = timezone('utc', now()),
      updated_by = p_actor_user_id
  where id = v_assignment.id;

  perform public.insert_housing_activity(
    p_actor_user_id,
    p_housing_id,
    'housing_driver_removed',
    p_driver_id,
    jsonb_build_object('assignment_id', v_assignment.id, 'driver_id', p_driver_id),
    null,
    jsonb_build_object('driver_id', p_driver_id)
  );

  return jsonb_build_object('assignment_id', v_assignment.id);
end;
$$;

create or replace function public.set_housing_organization_assignment(
  p_actor_user_id uuid,
  p_housing_id uuid,
  p_organization_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.housing_organization_assignments%rowtype;
  v_assignment_id uuid;
begin
  if not public.actor_has_global_permission(p_actor_user_id, 'housing.assign_organizations') then
    raise exception 'HOUSING_PERMISSION_DENIED';
  end if;

  if not exists (select 1 from public.housing_units where id = p_housing_id and archived_at is null) then
    raise exception 'HOUSING_UNAVAILABLE';
  end if;

  if not exists (select 1 from public.organizations where id = p_organization_id and is_active = true) then
    raise exception 'HOUSING_ORGANIZATION_UNAVAILABLE';
  end if;

  select * into v_assignment
  from public.housing_organization_assignments
  where housing_id = p_housing_id
    and organization_id = p_organization_id
    and active is true
  for update;

  if p_active then
    if found then
      return jsonb_build_object('assignment_id', v_assignment.id, 'unchanged', true);
    end if;

    insert into public.housing_organization_assignments (
      housing_id,
      organization_id,
      active,
      created_by,
      updated_by
    )
    values (
      p_housing_id,
      p_organization_id,
      true,
      p_actor_user_id,
      p_actor_user_id
    )
    returning id into v_assignment_id;

    perform public.insert_housing_activity(
      p_actor_user_id,
      p_housing_id,
      'housing_organization_assigned',
      p_organization_id,
      null,
      jsonb_build_object('organization_id', p_organization_id, 'assignment_id', v_assignment_id),
      jsonb_build_object('organization_id', p_organization_id)
    );

    return jsonb_build_object('assignment_id', v_assignment_id, 'unchanged', false);
  end if;

  if not found then
    raise exception 'HOUSING_ORGANIZATION_ASSIGNMENT_UNAVAILABLE';
  end if;

  update public.housing_organization_assignments
  set active = false,
      unassigned_at = timezone('utc', now()),
      updated_by = p_actor_user_id
  where id = v_assignment.id;

  perform public.insert_housing_activity(
    p_actor_user_id,
    p_housing_id,
    'housing_organization_unassigned',
    p_organization_id,
    jsonb_build_object('organization_id', p_organization_id, 'assignment_id', v_assignment.id),
    null,
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('assignment_id', v_assignment.id, 'unchanged', false);
end;
$$;

revoke all on function public.assign_driver_to_housing(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.remove_driver_from_housing(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_housing_organization_assignment(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_driver_to_housing(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.remove_driver_from_housing(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.set_housing_organization_assignment(uuid, uuid, uuid, boolean) to authenticated, service_role;

comment on table public.housing_units is
  'Global housing/accommodation units. Occupancy is calculated from active housing_driver_assignments.';
comment on table public.housing_organization_assignments is
  'Operational organization relationships for global housing. Does not own the housing identity.';
comment on table public.housing_driver_assignments is
  'Driver housing assignment history. A driver may have only one active row.';
