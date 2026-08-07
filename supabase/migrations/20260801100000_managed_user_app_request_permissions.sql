-- Keep managed-user granular permission replacement aligned with the app request permissions.

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
  v_invalid_permission_keys text[];
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
    'fuel.reports.view',
    'app_requests.view',
    'odometer.manage'
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
    'fuel.increase.review',
    'app_requests.view',
    'app_requests.review',
    'odometer.manage'
  ];
begin
  if not public.is_system_owner_user(p_actor_user_id) then
    raise exception 'Managed user permissions update failed: unauthorized.';
  end if;

  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user permissions update failed: self operation is not allowed.';
  end if;

  if jsonb_typeof(p_access) is distinct from 'array' then
    raise exception 'Managed user permissions update failed: invalid access payload.';
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
    from jsonb_array_elements_text(v_access_item -> 'permissionKeys') as permission(value);

    if cardinality(v_permission_keys) = 0 then
      raise exception 'Managed user permissions update failed: missing permissions.';
    end if;

    select coalesce(array_agg(value order by value), array[]::text[])
      into v_invalid_permission_keys
    from unnest(v_permission_keys) as permission(value)
    where value <> all(v_all_permissions);

    if cardinality(v_invalid_permission_keys) > 0 then
      raise exception 'Managed user permissions update failed: invalid permission.';
    end if;

    v_access_level := case
      when v_permission_keys <@ v_view_permissions then 'view'::public.organization_access_level
      else 'manage'::public.organization_access_level
    end;

    insert into public.organization_access (
      user_id,
      organization_id,
      access_level
    )
    values (
      p_target_user_id,
      v_organization_id,
      v_access_level
    )
    on conflict (user_id, organization_id)
    do update set
      access_level = excluded.access_level,
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

revoke all on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
