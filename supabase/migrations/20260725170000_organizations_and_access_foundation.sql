-- Phase 1: multi-organization database foundation.
--
-- This migration intentionally separates organizational affiliation from access:
-- - public.profiles.home_organization_id is the person's real/home organization.
-- - public.organization_access grants additional view/manage access only.
-- - organization_access rows must never make a person an employee/driver of that organization.
-- - permissions require both the existing global role and the organization access level.
--
-- No organizations are inserted here. The exact six organization names/codes are pending review.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0),
  constraint organizations_code_not_blank check (length(btrim(code)) > 0),
  constraint organizations_code_key unique (code)
);

comment on table public.organizations is
  'Business organizations available in the logistics system. Rows are not seeded until final names and codes are approved.';
comment on column public.organizations.code is
  'Stable unique machine identifier for an organization.';

create index if not exists organizations_active_idx
  on public.organizations (is_active)
  where is_active = true;

alter table public.profiles
  add column if not exists home_organization_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_home_organization_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_home_organization_id_fkey
      foreign key (home_organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

comment on column public.profiles.home_organization_id is
  'The organization this person actually belongs to. This is affiliation, not additional access.';

create index if not exists profiles_home_organization_id_idx
  on public.profiles (home_organization_id);

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'organization_access_level'
  ) then
    create type public.organization_access_level as enum ('view', 'manage');
  end if;
end
$$;

create table if not exists public.organization_access (
  user_id uuid not null,
  organization_id uuid not null,
  access_level public.organization_access_level not null default 'view',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_access_pkey primary key (user_id, organization_id),
  constraint organization_access_user_id_fkey
    foreign key (user_id)
    references public.profiles(id)
    on delete cascade,
  constraint organization_access_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete cascade
);

comment on table public.organization_access is
  'Additional organization access grants. These rows do not define employee or driver membership.';
comment on column public.organization_access.access_level is
  'view permits read access only; manage still requires a compatible global role.';

create index if not exists organization_access_organization_id_idx
  on public.organization_access (organization_id);

-- No existing local migration identifies the profiles updated_at trigger function reliably.
-- Use a dedicated non-conflicting trigger function for these two new tables only.
create or replace function public.set_organization_foundation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
  before update on public.organizations
  for each row
  execute function public.set_organization_foundation_updated_at();

drop trigger if exists set_organization_access_updated_at on public.organization_access;
create trigger set_organization_access_updated_at
  before update on public.organization_access
  for each row
  execute function public.set_organization_foundation_updated_at();

-- Security helper functions.
-- These are SECURITY DEFINER to avoid recursive RLS evaluation while policies inspect profiles/access.
-- They derive the current user only from auth.uid(); no browser-supplied user_id is trusted.

create or replace function public.is_system_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'::public.account_status
      and p.role = 'system_owner'::public.app_role
  );
$$;

create or replace function public.can_view_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_system_owner()
    or exists (
      select 1
      from public.profiles p
      join public.organizations o
        on o.id = target_organization_id
       and o.is_active = true
      where p.id = auth.uid()
        and p.status = 'active'::public.account_status
        and p.role in ('manager'::public.app_role, 'supervisor'::public.app_role)
        and (
          p.home_organization_id = target_organization_id
          or exists (
            select 1
            from public.organization_access oa
            where oa.user_id = p.id
              and oa.organization_id = target_organization_id
              and oa.access_level in (
                'view'::public.organization_access_level,
                'manage'::public.organization_access_level
              )
          )
        )
    );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_system_owner()
    or exists (
      select 1
      from public.profiles p
      join public.organizations o
        on o.id = target_organization_id
       and o.is_active = true
      where p.id = auth.uid()
        and p.status = 'active'::public.account_status
        and p.role in ('manager'::public.app_role, 'supervisor'::public.app_role)
        and (
          p.home_organization_id = target_organization_id
          or exists (
            select 1
            from public.organization_access oa
            where oa.user_id = p.id
              and oa.organization_id = target_organization_id
              and oa.access_level = 'manage'::public.organization_access_level
          )
        )
    );
$$;

revoke all on function public.is_system_owner() from public, anon;
revoke all on function public.can_view_organization(uuid) from public, anon;
revoke all on function public.can_manage_organization(uuid) from public, anon;

grant execute on function public.is_system_owner() to authenticated;
grant execute on function public.can_view_organization(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_access enable row level security;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_access to authenticated;
revoke all on public.organizations from anon;
revoke all on public.organization_access from anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_select_viewable'
  ) then
    create policy organizations_select_viewable
      on public.organizations
      for select
      to authenticated
      using (public.can_view_organization(id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_insert_system_owner'
  ) then
    create policy organizations_insert_system_owner
      on public.organizations
      for insert
      to authenticated
      with check (public.is_system_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_update_system_owner'
  ) then
    create policy organizations_update_system_owner
      on public.organizations
      for update
      to authenticated
      using (public.is_system_owner())
      with check (public.is_system_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_delete_system_owner'
  ) then
    create policy organizations_delete_system_owner
      on public.organizations
      for delete
      to authenticated
      using (public.is_system_owner());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_access'
      and policyname = 'organization_access_select_own_or_system_owner'
  ) then
    create policy organization_access_select_own_or_system_owner
      on public.organization_access
      for select
      to authenticated
      using (public.is_system_owner() or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_access'
      and policyname = 'organization_access_insert_system_owner'
  ) then
    create policy organization_access_insert_system_owner
      on public.organization_access
      for insert
      to authenticated
      with check (public.is_system_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_access'
      and policyname = 'organization_access_update_system_owner'
  ) then
    create policy organization_access_update_system_owner
      on public.organization_access
      for update
      to authenticated
      using (public.is_system_owner())
      with check (public.is_system_owner());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_access'
      and policyname = 'organization_access_delete_system_owner'
  ) then
    create policy organization_access_delete_system_owner
      on public.organization_access
      for delete
      to authenticated
      using (public.is_system_owner());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_organization_visible'
  ) then
    create policy profiles_select_organization_visible
      on public.profiles
      for select
      to authenticated
      using (
        public.is_system_owner()
        or id = auth.uid()
        or (
          home_organization_id is not null
          and public.can_view_organization(home_organization_id)
        )
      );
  end if;
end
$$;
