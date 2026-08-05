-- Phase 3C: managed-user lifecycle and append-only activity logs.
--
-- This migration preserves existing users and profiles. It adds application-level
-- archival, activity logging, and service-role-only transaction functions for
-- managed user lifecycle operations.

alter table public.profiles
  add column if not exists deleted_at timestamptz null;

comment on column public.profiles.deleted_at is
  'Application-level archival timestamp. Null means the profile is visible in normal user-management lists.';

create index if not exists profiles_not_deleted_created_at_idx
  on public.profiles (created_at)
  where deleted_at is null;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null
    references public.profiles(id)
    on delete set null,
  target_user_id uuid null
    references public.profiles(id)
    on delete set null,
  organization_id uuid null
    references public.organizations(id)
    on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  before_data jsonb null,
  after_data jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_logs_action_not_blank check (length(btrim(action)) > 0),
  constraint activity_logs_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint activity_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

comment on table public.activity_logs is
  'Append-only audit records for application-level user lifecycle and permissions operations.';

create index if not exists activity_logs_actor_created_at_idx
  on public.activity_logs (actor_user_id, created_at desc);

create index if not exists activity_logs_target_created_at_idx
  on public.activity_logs (target_user_id, created_at desc);

create index if not exists activity_logs_organization_created_at_idx
  on public.activity_logs (organization_id, created_at desc);

alter table public.activity_logs enable row level security;

revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;
grant select, insert on public.activity_logs to service_role;

drop policy if exists activity_logs_select_system_owner on public.activity_logs;
create policy activity_logs_select_system_owner
  on public.activity_logs
  for select
  to authenticated
  using (public.is_system_owner());

-- Existing security helpers now deny archived profiles.
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
      and p.deleted_at is null
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
        and p.deleted_at is null
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
        and p.deleted_at is null
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

create or replace function public.assert_managed_user_actor(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role = 'system_owner'::public.app_role
  ) then
    raise exception 'Managed user operation failed: actor is not authorized.';
  end if;
end;
$$;

create or replace function public.safe_access_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'organization_id', oa.organization_id,
        'access_level', oa.access_level
      )
      order by oa.organization_id
    ),
    '[]'::jsonb
  )
  from public.organization_access oa
  where oa.user_id = p_user_id;
$$;

drop function if exists public.create_managed_user_profile(
  uuid,
  text,
  public.app_role,
  text,
  uuid,
  jsonb
);

create or replace function public.create_managed_user_profile(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_role public.app_role,
  p_job_title text,
  p_home_organization_id uuid,
  p_additional_access jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_job_title text;
  v_access_item jsonb;
  v_organization_id uuid;
  v_access_level public.organization_access_level;
  v_seen_organization_ids uuid[] := array[]::uuid[];
begin
  perform public.assert_managed_user_actor(p_actor_user_id);

  if p_user_id is null then
    raise exception 'Managed user profile creation failed: user id is required.';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'Managed user profile creation failed: profile already exists.';
  end if;

  v_full_name := btrim(coalesce(p_full_name, ''));
  if v_full_name = '' or length(v_full_name) > 160 then
    raise exception 'Managed user profile creation failed: invalid full name.';
  end if;

  if p_role not in ('manager'::public.app_role, 'supervisor'::public.app_role, 'driver'::public.app_role) then
    raise exception 'Managed user profile creation failed: invalid role.';
  end if;

  v_job_title := btrim(coalesce(p_job_title, ''));
  if v_job_title = '' or length(v_job_title) > 160 then
    raise exception 'Managed user profile creation failed: invalid job title.';
  end if;

  if p_home_organization_id is null or not exists (
    select 1 from public.organizations o
    where o.id = p_home_organization_id and o.is_active = true
  ) then
    raise exception 'Managed user profile creation failed: home organization is inactive or missing.';
  end if;

  p_additional_access := coalesce(p_additional_access, '[]'::jsonb);

  if jsonb_typeof(p_additional_access) <> 'array' then
    raise exception 'Managed user profile creation failed: additional access must be an array.';
  end if;

  if p_role = 'driver'::public.app_role and jsonb_array_length(p_additional_access) > 0 then
    raise exception 'Managed user profile creation failed: drivers cannot receive additional organization access.';
  end if;

  for v_access_item in select value from jsonb_array_elements(p_additional_access)
  loop
    begin
      v_organization_id := (v_access_item ->> 'organization_id')::uuid;
      v_access_level := (v_access_item ->> 'access_level')::public.organization_access_level;
    exception
      when invalid_text_representation then
        raise exception 'Managed user profile creation failed: malformed additional access entry.';
    end;

    if v_access_level not in ('view'::public.organization_access_level, 'manage'::public.organization_access_level) then
      raise exception 'Managed user profile creation failed: invalid additional access level.';
    end if;

    if v_organization_id = p_home_organization_id or v_organization_id = any(v_seen_organization_ids) then
      raise exception 'Managed user profile creation failed: invalid duplicate additional organization access.';
    end if;

    if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.is_active = true) then
      raise exception 'Managed user profile creation failed: additional organization is inactive or missing.';
    end if;

    v_seen_organization_ids := array_append(v_seen_organization_ids, v_organization_id);
  end loop;

  insert into public.profiles (
    id, full_name, role, job_title, status, home_organization_id
  )
  values (
    p_user_id, v_full_name, p_role, v_job_title, 'active'::public.account_status, p_home_organization_id
  );

  for v_access_item in select value from jsonb_array_elements(p_additional_access)
  loop
    insert into public.organization_access (user_id, organization_id, access_level)
    values (
      p_user_id,
      (v_access_item ->> 'organization_id')::uuid,
      (v_access_item ->> 'access_level')::public.organization_access_level
    );
  end loop;

  insert into public.activity_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id, after_data
  )
  values (
    p_actor_user_id,
    p_user_id,
    'user_created',
    'user',
    p_user_id,
    jsonb_build_object(
      'full_name', v_full_name,
      'role', p_role,
      'job_title', v_job_title,
      'home_organization_id', p_home_organization_id,
      'status', 'active',
      'additional_access', public.safe_access_snapshot(p_user_id)
    )
  );
end;
$$;

create or replace function public.update_managed_user_profile(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_role public.app_role,
  p_job_title text,
  p_home_organization_id uuid,
  p_email_changed boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_full_name text;
  v_job_title text;
  v_before jsonb;
  v_after jsonb;
  v_removed_access jsonb;
begin
  perform public.assert_managed_user_actor(p_actor_user_id);

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user update failed: self operation is not allowed.';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_target_user_id
  for update;

  if not found or v_target.role = 'system_owner'::public.app_role or v_target.deleted_at is not null then
    raise exception 'Managed user update failed: target is not editable.';
  end if;

  if p_role not in ('manager'::public.app_role, 'supervisor'::public.app_role, 'driver'::public.app_role) then
    raise exception 'Managed user update failed: invalid role.';
  end if;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_job_title := btrim(coalesce(p_job_title, ''));

  if v_full_name = '' or length(v_full_name) > 160 or v_job_title = '' or length(v_job_title) > 160 then
    raise exception 'Managed user update failed: invalid profile data.';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_home_organization_id and o.is_active = true
  ) then
    raise exception 'Managed user update failed: invalid home organization.';
  end if;

  v_before := jsonb_build_object(
    'full_name', v_target.full_name,
    'role', v_target.role,
    'job_title', v_target.job_title,
    'home_organization_id', v_target.home_organization_id,
    'additional_access', public.safe_access_snapshot(p_target_user_id),
    'email_changed', false
  );

  v_removed_access := null;

  if p_role = 'driver'::public.app_role then
    v_removed_access := public.safe_access_snapshot(p_target_user_id);
    delete from public.organization_access oa
    where oa.user_id = p_target_user_id;
  else
    delete from public.organization_access oa
    where oa.user_id = p_target_user_id
      and oa.organization_id = p_home_organization_id;
  end if;

  update public.profiles
  set
    full_name = v_full_name,
    role = p_role,
    job_title = v_job_title,
    home_organization_id = p_home_organization_id,
    updated_at = now()
  where id = p_target_user_id;

  v_after := jsonb_build_object(
    'full_name', v_full_name,
    'role', p_role,
    'job_title', v_job_title,
    'home_organization_id', p_home_organization_id,
    'additional_access', public.safe_access_snapshot(p_target_user_id),
    'email_changed', p_email_changed,
    'removed_access', v_removed_access
  );

  insert into public.activity_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id, p_target_user_id, 'user_updated', 'user', p_target_user_id, v_before, v_after
  );
end;
$$;

create or replace function public.replace_managed_user_organization_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_additional_access jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_before jsonb;
  v_access_item jsonb;
  v_organization_id uuid;
  v_access_level public.organization_access_level;
  v_seen_organization_ids uuid[] := array[]::uuid[];
begin
  perform public.assert_managed_user_actor(p_actor_user_id);

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user permissions update failed: self operation is not allowed.';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_target_user_id
  for update;

  if not found or v_target.role = 'system_owner'::public.app_role or v_target.deleted_at is not null then
    raise exception 'Managed user permissions update failed: target is not editable.';
  end if;

  p_additional_access := coalesce(p_additional_access, '[]'::jsonb);

  if jsonb_typeof(p_additional_access) <> 'array' then
    raise exception 'Managed user permissions update failed: access must be an array.';
  end if;

  if v_target.role = 'driver'::public.app_role and jsonb_array_length(p_additional_access) > 0 then
    raise exception 'Managed user permissions update failed: drivers cannot receive additional access.';
  end if;

  v_before := jsonb_build_object('additional_access', public.safe_access_snapshot(p_target_user_id));

  for v_access_item in select value from jsonb_array_elements(p_additional_access)
  loop
    begin
      v_organization_id := (v_access_item ->> 'organization_id')::uuid;
      v_access_level := (v_access_item ->> 'access_level')::public.organization_access_level;
    exception
      when invalid_text_representation then
        raise exception 'Managed user permissions update failed: malformed access entry.';
    end;

    if v_access_level not in ('view'::public.organization_access_level, 'manage'::public.organization_access_level) then
      raise exception 'Managed user permissions update failed: invalid access level.';
    end if;

    if v_organization_id = v_target.home_organization_id or v_organization_id = any(v_seen_organization_ids) then
      raise exception 'Managed user permissions update failed: invalid duplicate organization.';
    end if;

    if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.is_active = true) then
      raise exception 'Managed user permissions update failed: organization inactive or missing.';
    end if;

    v_seen_organization_ids := array_append(v_seen_organization_ids, v_organization_id);
  end loop;

  delete from public.organization_access oa
  where oa.user_id = p_target_user_id;

  for v_access_item in select value from jsonb_array_elements(p_additional_access)
  loop
    insert into public.organization_access (user_id, organization_id, access_level)
    values (
      p_target_user_id,
      (v_access_item ->> 'organization_id')::uuid,
      (v_access_item ->> 'access_level')::public.organization_access_level
    );
  end loop;

  insert into public.activity_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    'user_permissions_updated',
    'user',
    p_target_user_id,
    v_before,
    jsonb_build_object('additional_access', public.safe_access_snapshot(p_target_user_id))
  );
end;
$$;

create or replace function public.set_managed_user_status(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_status public.account_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_action text;
begin
  perform public.assert_managed_user_actor(p_actor_user_id);

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user status update failed: self operation is not allowed.';
  end if;

  if p_status not in ('active'::public.account_status, 'suspended'::public.account_status) then
    raise exception 'Managed user status update failed: invalid status.';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_target_user_id
  for update;

  if not found or v_target.role = 'system_owner'::public.app_role or v_target.deleted_at is not null then
    raise exception 'Managed user status update failed: target is not editable.';
  end if;

  update public.profiles
  set status = p_status, updated_at = now()
  where id = p_target_user_id;

  v_action := case
    when p_status = 'active'::public.account_status then 'user_reactivated'
    else 'user_suspended'
  end;

  insert into public.activity_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    v_action,
    'user',
    p_target_user_id,
    jsonb_build_object('status', v_target.status),
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.archive_managed_user(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_deleted_at timestamptz;
begin
  perform public.assert_managed_user_actor(p_actor_user_id);

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user archive failed: self operation is not allowed.';
  end if;

  select * into v_target
  from public.profiles p
  where p.id = p_target_user_id
  for update;

  if not found or v_target.role = 'system_owner'::public.app_role or v_target.deleted_at is not null then
    raise exception 'Managed user archive failed: target is not archivable.';
  end if;

  v_deleted_at := now();

  update public.profiles
  set status = 'suspended'::public.account_status,
      deleted_at = v_deleted_at,
      updated_at = now()
  where id = p_target_user_id;

  insert into public.activity_logs (
    actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    'user_archived',
    'user',
    p_target_user_id,
    jsonb_build_object(
      'status', v_target.status,
      'deleted_at', v_target.deleted_at,
      'additional_access', public.safe_access_snapshot(p_target_user_id)
    ),
    jsonb_build_object(
      'status', 'suspended',
      'deleted_at', v_deleted_at,
      'additional_access', public.safe_access_snapshot(p_target_user_id)
    )
  );
end;
$$;

revoke all on function public.assert_managed_user_actor(uuid) from public, anon, authenticated;
revoke all on function public.safe_access_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.create_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.replace_managed_user_organization_access(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_managed_user_status(uuid, uuid, public.account_status) from public, anon, authenticated;
revoke all on function public.archive_managed_user(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, jsonb) to service_role;
grant execute on function public.update_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, boolean) to service_role;
grant execute on function public.replace_managed_user_organization_access(uuid, uuid, jsonb) to service_role;
grant execute on function public.set_managed_user_status(uuid, uuid, public.account_status) to service_role;
grant execute on function public.archive_managed_user(uuid, uuid) to service_role;

revoke all on function public.is_system_owner() from public, anon;
revoke all on function public.can_view_organization(uuid) from public, anon;
revoke all on function public.can_manage_organization(uuid) from public, anon;
grant execute on function public.is_system_owner() to authenticated;
grant execute on function public.can_view_organization(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
