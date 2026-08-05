-- Granular per-user, per-organization permissions.

create table if not exists public.organization_user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  permission_key text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default timezone('utc', now()),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_user_permissions_key_check check (
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
      'fleet.activity.view'
    )
  ),
  constraint organization_user_permissions_unique unique (
    user_id,
    organization_id,
    permission_key
  )
);

create index if not exists organization_user_permissions_user_org_idx
  on public.organization_user_permissions (user_id, organization_id);

create index if not exists organization_user_permissions_org_key_idx
  on public.organization_user_permissions (organization_id, permission_key);

alter table public.organization_user_permissions enable row level security;

grant select on public.organization_user_permissions to authenticated;
grant select, insert, update, delete on public.organization_user_permissions to service_role;
revoke all on public.organization_user_permissions from anon;

create or replace function public.is_system_owner_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.role = 'system_owner'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
  );
$$;

revoke all on function public.is_system_owner_user(uuid) from public, anon;
grant execute on function public.is_system_owner_user(uuid) to authenticated;

create or replace function public.has_organization_permission(
  target_user_id uuid,
  target_organization_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_system_owner_user(target_user_id)
    or exists (
      select 1
      from public.organization_user_permissions oup
      where oup.user_id = target_user_id
        and oup.organization_id = target_organization_id
        and oup.permission_key = target_permission_key
    );
$$;

revoke all on function public.has_organization_permission(uuid, uuid, text) from public, anon;
grant execute on function public.has_organization_permission(uuid, uuid, text) to authenticated;

drop policy if exists organization_user_permissions_select_own_or_system_owner
  on public.organization_user_permissions;
create policy organization_user_permissions_select_own_or_system_owner
  on public.organization_user_permissions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_system_owner()
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
  select unnest(
    case
      when oa.access_level = 'manage'::public.organization_access_level then array[
        'organization.dashboard.view',
        'drivers.view',
        'drivers.create',
        'drivers.update',
        'drivers.status',
        'drivers.archive',
        'drivers.documents.view',
        'drivers.documents.download',
        'drivers.activity.view',
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
        'fleet.activity.view'
      ]::text[]
      else array[
        'organization.dashboard.view',
        'drivers.view',
        'driver_reports.view',
        'fleet.cars.view',
        'fleet.motorcycles.view'
      ]::text[]
    end
  ) as permission_key
) permissions
on conflict (user_id, organization_id, permission_key) do nothing;

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
    'fleet.motorcycles.view'
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
    'fleet.activity.view'
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

  if v_target_role is null then
    raise exception 'Managed user permissions update failed: target is unavailable.';
  end if;

  if v_target_role = 'system_owner'::public.app_role then
    raise exception 'Managed user permissions update failed: target is protected.';
  end if;

  if jsonb_typeof(p_access) <> 'array' then
    raise exception 'Managed user permissions update failed: access must be an array.';
  end if;

  if v_target_role = 'driver'::public.app_role and jsonb_array_length(p_access) > 0 then
    raise exception 'Managed user permissions update failed: drivers cannot receive additional access.';
  end if;

  for v_access_item in select * from jsonb_array_elements(p_access)
  loop
    if not (v_access_item ? 'organization_id') or not (v_access_item ? 'permission_keys') then
      raise exception 'Managed user permissions update failed: malformed access entry.';
    end if;

    v_organization_id := (v_access_item ->> 'organization_id')::uuid;

    if v_organization_id = any(v_seen_organizations) then
      raise exception 'Managed user permissions update failed: duplicate organization.';
    end if;
    v_seen_organizations := array_append(v_seen_organizations, v_organization_id);

    if v_organization_id = v_target_home_organization_id then
      raise exception 'Managed user permissions update failed: home organization cannot be additional access.';
    end if;

    if not exists (
      select 1 from public.organizations o
      where o.id = v_organization_id
        and o.is_active = true
    ) then
      raise exception 'Managed user permissions update failed: organization inactive or missing.';
    end if;

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_permission_keys
    from jsonb_array_elements_text(v_access_item -> 'permission_keys') as keys(value);

    foreach v_permission_key in array v_permission_keys
    loop
      if not v_permission_key = any(v_all_permissions) then
        raise exception 'Managed user permissions update failed: invalid permission key.';
      end if;
    end loop;
  end loop;

  for v_organization_id in
    select oa.organization_id
    from public.organization_access oa
    where oa.user_id = p_target_user_id
      and (
        jsonb_array_length(p_access) = 0
        or not exists (
          select 1
          from jsonb_array_elements(p_access) item
          where (item ->> 'organization_id')::uuid = oa.organization_id
        )
      )
  loop
    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_old_permissions
    from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    delete from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    delete from public.organization_access
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    insert into public.activity_logs (
      action,
      actor_user_id,
      target_user_id,
      organization_id,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata
    )
    values (
      'user_permissions_updated',
      p_actor_user_id,
      p_target_user_id,
      v_organization_id,
      'profile',
      p_target_user_id,
      jsonb_build_object('access_enabled', true, 'permission_keys', v_old_permissions),
      jsonb_build_object('access_enabled', false, 'permission_keys', array[]::text[]),
      jsonb_build_object('changed_permissions', true)
    );
  end loop;

  for v_access_item in select * from jsonb_array_elements(p_access)
  loop
    v_organization_id := (v_access_item ->> 'organization_id')::uuid;

    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_old_permissions
    from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_new_permissions
    from jsonb_array_elements_text(v_access_item -> 'permission_keys') as keys(value);

    v_access_level :=
      case
        when v_new_permissions <@ v_view_permissions then 'view'::public.organization_access_level
        else 'manage'::public.organization_access_level
      end;

    insert into public.organization_access (user_id, organization_id, access_level)
    values (p_target_user_id, v_organization_id, v_access_level)
    on conflict (user_id, organization_id) do update
      set access_level = excluded.access_level,
          updated_at = timezone('utc', now());

    delete from public.organization_user_permissions
    where user_id = p_target_user_id
      and organization_id = v_organization_id;

    foreach v_permission_key in array v_new_permissions
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
      );
    end loop;

    insert into public.activity_logs (
      action,
      actor_user_id,
      target_user_id,
      organization_id,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata
    )
    values (
      'user_permissions_updated',
      p_actor_user_id,
      p_target_user_id,
      v_organization_id,
      'profile',
      p_target_user_id,
      jsonb_build_object('access_enabled', cardinality(v_old_permissions) > 0, 'permission_keys', v_old_permissions),
      jsonb_build_object('access_enabled', true, 'permission_keys', v_new_permissions),
      jsonb_build_object(
        'added_permissions',
        (select coalesce(jsonb_agg(value), '[]'::jsonb) from unnest(v_new_permissions) value where not value = any(v_old_permissions)),
        'removed_permissions',
        (select coalesce(jsonb_agg(value), '[]'::jsonb) from unnest(v_old_permissions) value where not value = any(v_new_permissions))
      )
    );
  end loop;
end;
$$;

revoke all on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  to service_role;
