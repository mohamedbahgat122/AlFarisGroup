-- Keep home-organization permissions separate from additional access.
-- The existing function signature and service_role grant remain unchanged.

create or replace function public.replace_managed_user_organization_permissions(
  p_actor_user_id uuid, p_target_user_id uuid, p_access jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target_role public.app_role;
  v_home uuid;
  v_home_permissions text[];
  v_item jsonb;
  v_org uuid;
  v_keys text[];
  v_key text;
  v_old text[];
  v_new text[];
  v_level public.organization_access_level;
  v_seen uuid[] := array[]::uuid[];
  v_view constant text[] := array[
    'organization.dashboard.view','drivers.view','driver_reports.view','driver_order_reports.view',
    'fleet.cars.view','fleet.motorcycles.view','fuel.reports.view','app_requests.view','odometer.manage',
    'notifications.view','driver_warnings.view','entitlements.view','entitlements.view_transactions',
    'shifts.view','maintenance_providers.view','maintenance_jobs.view','maintenance_materials.view','order_periods.view'
  ];
begin
  if not public.is_system_owner_user(p_actor_user_id) then
    raise exception 'Managed user permissions update failed: unauthorized.';
  end if;
  if p_actor_user_id = p_target_user_id then
    raise exception 'Managed user permissions update failed: self operation is not allowed.';
  end if;

  select p.role, p.home_organization_id into v_target_role, v_home
  from public.profiles p
  where p.id = p_target_user_id and p.deleted_at is null;
  if v_target_role is null then
    raise exception 'Managed user permissions update failed: target is unavailable.';
  end if;
  if v_target_role = 'system_owner'::public.app_role then
    raise exception 'Managed user permissions update failed: target is protected.';
  end if;

  -- New callers send an object. An array remains accepted as legacy additional access.
  if jsonb_typeof(p_access) = 'object' then
    if jsonb_typeof(p_access->'home_permissions') <> 'array'
       or jsonb_typeof(p_access->'additional_access') <> 'array' then
      raise exception 'Managed user permissions update failed: malformed access payload.';
    end if;
    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_home_permissions
    from jsonb_array_elements_text(p_access->'home_permissions') as permission(value);
  elsif jsonb_typeof(p_access) = 'array' then
    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_home_permissions
    from public.organization_user_permissions
    where user_id = p_target_user_id and organization_id = v_home;
  else
    raise exception 'Managed user permissions update failed: access must be an array or object.';
  end if;

  if v_home is null
     and jsonb_typeof(p_access) = 'object'
     and cardinality(v_home_permissions) > 0 then
    raise exception 'Managed user permissions update failed: home organization is required for home permissions.';
  end if;

  if v_target_role = 'driver'::public.app_role
     and (
       (jsonb_typeof(p_access) = 'object'
        and (cardinality(v_home_permissions) > 0
          or jsonb_array_length(p_access->'additional_access') > 0))
       or (jsonb_typeof(p_access) = 'array' and jsonb_array_length(p_access) > 0)
     ) then
    raise exception 'Managed user permissions update failed: drivers cannot receive additional access.';
  end if;

  foreach v_key in array v_home_permissions loop
    if not v_key = any(public.organization_permission_keys()) then
      raise exception 'Managed user permissions update failed: invalid permission key.';
    end if;
  end loop;

  -- Replace home permissions while retaining the user's home organization membership.
  select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
    into v_old
  from public.organization_user_permissions
  where user_id = p_target_user_id and organization_id = v_home;
  if jsonb_typeof(p_access) = 'object' then
    delete from public.organization_user_permissions
    where user_id = p_target_user_id and organization_id = v_home;
    foreach v_key in array v_home_permissions loop
      insert into public.organization_user_permissions
        (user_id, organization_id, permission_key, granted_by, updated_by)
      values (p_target_user_id, v_home, v_key, p_actor_user_id, p_actor_user_id);
    end loop;
  end if;
  if v_home is not null and v_target_role in ('manager'::public.app_role, 'supervisor'::public.app_role) then
    v_level := case when v_home_permissions <@ v_view then 'view'::public.organization_access_level else 'manage'::public.organization_access_level end;
    insert into public.organization_access(user_id, organization_id, access_level)
    values (p_target_user_id, v_home, v_level)
    on conflict (user_id, organization_id) do update
      set access_level = excluded.access_level, updated_at = timezone('utc', now());
  end if;
  if jsonb_typeof(p_access) = 'object' then
    insert into public.activity_logs(action, actor_user_id, target_user_id, organization_id, entity_type, entity_id, before_data, after_data, metadata)
    values ('user_permissions_updated', p_actor_user_id, p_target_user_id, v_home, 'profile', p_target_user_id,
      jsonb_build_object('permission_keys', v_old), jsonb_build_object('permission_keys', v_home_permissions),
      jsonb_build_object('home_organization', true));
  end if;

  -- Validate the additional-access portion before changing any additional rows.
  for v_item in select * from jsonb_array_elements(coalesce(p_access->'additional_access', p_access)) loop
    v_org := coalesce(v_item->>'organization_id', v_item->>'organizationId')::uuid;
    if v_org = any(v_seen) then
      raise exception 'Managed user permissions update failed: duplicate organization.';
    end if;
    v_seen := array_append(v_seen, v_org);
    if v_org = v_home then
      raise exception 'Managed user permissions update failed: home organization cannot be additional access.';
    end if;
    if not exists(select 1 from public.organizations o where o.id = v_org and o.is_active) then
      raise exception 'Managed user permissions update failed: organization inactive or missing.';
    end if;
    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_keys
    from jsonb_array_elements_text(coalesce(v_item->'permission_keys', v_item->'permissionKeys')) as permission(value);
    if cardinality(v_keys) = 0 then
      raise exception 'Managed user permissions update failed: missing permissions.';
    end if;
    foreach v_key in array v_keys loop
      if not v_key = any(public.organization_permission_keys()) then
        raise exception 'Managed user permissions update failed: invalid permission key.';
      end if;
    end loop;
  end loop;

  for v_org in
    select existing.organization_id
    from (
      select oa.organization_id from public.organization_access oa where oa.user_id = p_target_user_id
      union
      select oup.organization_id from public.organization_user_permissions oup where oup.user_id = p_target_user_id
    ) existing
    where (v_home is null or existing.organization_id <> v_home)
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_access->'additional_access', p_access)) item
        where coalesce(item->>'organization_id', item->>'organizationId')::uuid = existing.organization_id
      )
  loop
    select coalesce(array_agg(permission_key order by permission_key), array[]::text[])
      into v_old
    from public.organization_user_permissions
    where user_id = p_target_user_id and organization_id = v_org;
    delete from public.organization_user_permissions
    where user_id = p_target_user_id and organization_id = v_org;
    delete from public.organization_access
    where user_id = p_target_user_id and organization_id = v_org;
    insert into public.activity_logs(action, actor_user_id, target_user_id, organization_id, entity_type, entity_id, before_data, after_data, metadata)
    values ('user_permissions_updated', p_actor_user_id, p_target_user_id, v_org, 'profile', p_target_user_id,
      jsonb_build_object('permission_keys', v_old), jsonb_build_object('permission_keys', array[]::text[]),
      jsonb_build_object('changed_permissions', true));
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_access->'additional_access', p_access)) loop
    v_org := coalesce(v_item->>'organization_id', v_item->>'organizationId')::uuid;
    select coalesce(array_agg(permission_key order by permission_key), array[]::text[]) into v_old
    from public.organization_user_permissions where user_id = p_target_user_id and organization_id = v_org;
    select coalesce(array_agg(distinct value order by value), array[]::text[]) into v_new
    from jsonb_array_elements_text(coalesce(v_item->'permission_keys', v_item->'permissionKeys')) as permission(value);
    v_level := case when v_new <@ v_view then 'view'::public.organization_access_level else 'manage'::public.organization_access_level end;
    insert into public.organization_access(user_id, organization_id, access_level)
    values (p_target_user_id, v_org, v_level)
    on conflict (user_id, organization_id) do update
      set access_level = excluded.access_level, updated_at = timezone('utc', now());
    delete from public.organization_user_permissions
    where user_id = p_target_user_id and organization_id = v_org;
    foreach v_key in array v_new loop
      insert into public.organization_user_permissions
        (user_id, organization_id, permission_key, granted_by, updated_by)
      values (p_target_user_id, v_org, v_key, p_actor_user_id, p_actor_user_id);
    end loop;
    insert into public.activity_logs(action, actor_user_id, target_user_id, organization_id, entity_type, entity_id, before_data, after_data, metadata)
    values ('user_permissions_updated', p_actor_user_id, p_target_user_id, v_org, 'profile', p_target_user_id,
      jsonb_build_object('permission_keys', v_old), jsonb_build_object('permission_keys', v_new),
      jsonb_build_object('changed_permissions', true));
  end loop;
end;
$$;

revoke all on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
