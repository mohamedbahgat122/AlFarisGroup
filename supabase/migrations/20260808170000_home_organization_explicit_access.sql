-- Keep the home organization as a normal explicitly-permissioned organization.
-- The home organization is a default/profile reference, not an implicit full-access grant.

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
          exists (
            select 1
            from public.organization_access oa
            where oa.user_id = p.id
              and oa.organization_id = target_organization_id
              and oa.access_level in (
                'view'::public.organization_access_level,
                'manage'::public.organization_access_level
              )
          )
          or exists (
            select 1
            from public.organization_user_permissions oup
            where oup.user_id = p.id
              and oup.organization_id = target_organization_id
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
          exists (
            select 1
            from public.organization_access oa
            where oa.user_id = p.id
              and oa.organization_id = target_organization_id
              and oa.access_level = 'manage'::public.organization_access_level
          )
          or exists (
            select 1
            from public.organization_user_permissions oup
            where oup.user_id = p.id
              and oup.organization_id = target_organization_id
              and oup.permission_key <> all(public.view_only_organization_permission_keys())
          )
        )
    );
$$;

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
  v_permission_keys text[];
  v_permission_key text;
  v_invalid_permission_keys text[];
  v_access_level public.organization_access_level;
  v_seen_organization_ids uuid[] := array[]::uuid[];
  v_permission_payload jsonb;
  v_view_permissions text[] := public.view_only_organization_permission_keys();
  v_all_permissions text[] := public.organization_permission_keys();
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
      v_organization_id := coalesce(
        v_access_item ->> 'organizationId',
        v_access_item ->> 'organization_id'
      )::uuid;
      v_permission_payload := coalesce(
        v_access_item -> 'permissionKeys',
        v_access_item -> 'permission_keys'
      );
    exception
      when invalid_text_representation then
        raise exception 'Managed user profile creation failed: malformed additional access entry.';
    end;

    if v_organization_id = any(v_seen_organization_ids) then
      raise exception 'Managed user profile creation failed: duplicate organization access.';
    end if;

    if v_permission_payload is null or jsonb_typeof(v_permission_payload) <> 'array' then
      raise exception 'Managed user profile creation failed: permission keys must be an array.';
    end if;

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_permission_keys
    from jsonb_array_elements_text(v_permission_payload) as permission(value);

    if cardinality(v_permission_keys) = 0 then
      raise exception 'Managed user profile creation failed: missing permissions.';
    end if;

    select coalesce(array_agg(value order by value), array[]::text[])
      into v_invalid_permission_keys
    from unnest(v_permission_keys) as permission(value)
    where value <> all(v_all_permissions);

    if cardinality(v_invalid_permission_keys) > 0 then
      raise exception 'Managed user profile creation failed: invalid permission.';
    end if;

    if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.is_active = true) then
      raise exception 'Managed user profile creation failed: organization is inactive or missing.';
    end if;

    v_seen_organization_ids := array_append(v_seen_organization_ids, v_organization_id);
  end loop;

  insert into public.profiles (
    id, full_name, role, job_title, status, home_organization_id
  )
  values (
    p_user_id, v_full_name, p_role, v_job_title, 'active'::public.account_status, p_home_organization_id
  );

  if p_role in ('manager'::public.app_role, 'supervisor'::public.app_role) then
    insert into public.organization_access (user_id, organization_id, access_level)
    values (p_user_id, p_home_organization_id, 'view'::public.organization_access_level)
    on conflict (user_id, organization_id) do nothing;
  end if;

  for v_access_item in select value from jsonb_array_elements(p_additional_access)
  loop
    v_organization_id := coalesce(
      v_access_item ->> 'organizationId',
      v_access_item ->> 'organization_id'
    )::uuid;
    v_permission_payload := coalesce(
      v_access_item -> 'permissionKeys',
      v_access_item -> 'permission_keys'
    );

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_permission_keys
    from jsonb_array_elements_text(v_permission_payload) as permission(value);

    v_access_level := case
      when v_permission_keys <@ v_view_permissions then 'view'::public.organization_access_level
      else 'manage'::public.organization_access_level
    end;

    insert into public.organization_access (user_id, organization_id, access_level)
    values (p_user_id, v_organization_id, v_access_level)
    on conflict (user_id, organization_id)
    do update set
      access_level = excluded.access_level,
      updated_at = timezone('utc', now());

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
        p_user_id,
        v_organization_id,
        v_permission_key,
        p_actor_user_id,
        p_actor_user_id
      );
    end loop;
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

    delete from public.organization_user_permissions oup
    where oup.user_id = p_target_user_id;

    delete from public.organization_access oa
    where oa.user_id = p_target_user_id;
  else
    if v_target.home_organization_id is not null
      and v_target.home_organization_id <> p_home_organization_id
      and not exists (
        select 1
        from public.organization_user_permissions oup
        where oup.user_id = p_target_user_id
          and oup.organization_id = v_target.home_organization_id
      )
    then
      delete from public.organization_access oa
      where oa.user_id = p_target_user_id
        and oa.organization_id = v_target.home_organization_id;
    end if;

    insert into public.organization_access (user_id, organization_id, access_level)
    values (p_target_user_id, p_home_organization_id, 'view'::public.organization_access_level)
    on conflict (user_id, organization_id) do nothing;
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
  v_view_permissions text[] := public.view_only_organization_permission_keys();
  v_all_permissions text[] := public.organization_permission_keys();
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
      raise exception 'Managed user permissions update failed: invalid permission: %.', v_invalid_permission_keys;
    end if;
  end loop;

  for v_organization_id in
    select organization_id
    from (
      select oa.organization_id
      from public.organization_access oa
      where oa.user_id = p_target_user_id
      union
      select oup.organization_id
      from public.organization_user_permissions oup
      where oup.user_id = p_target_user_id
    ) existing_access
    where jsonb_array_length(p_access) = 0
      or not exists (
        select 1
        from jsonb_array_elements(p_access) item
        where (item ->> 'organizationId')::uuid = existing_access.organization_id
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

    if v_organization_id = v_target_home_organization_id
      and v_target_role in ('manager'::public.app_role, 'supervisor'::public.app_role)
    then
      insert into public.organization_access (user_id, organization_id, access_level)
      values (p_target_user_id, v_organization_id, 'view'::public.organization_access_level)
      on conflict (user_id, organization_id)
      do update set
        access_level = 'view'::public.organization_access_level,
        updated_at = timezone('utc', now());
    else
      delete from public.organization_access
      where user_id = p_target_user_id
        and organization_id = v_organization_id;
    end if;

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
      jsonb_build_object('permission_keys', array[]::text[]),
      jsonb_build_object(
        'access_level',
        case
          when v_organization_id = v_target_home_organization_id then 'view'
          else null
        end
      )
    );
  end loop;

  for v_access_item in select * from jsonb_array_elements(p_access)
  loop
    v_organization_id := (v_access_item ->> 'organizationId')::uuid;

    select coalesce(array_agg(distinct value order by value), array[]::text[])
      into v_permission_keys
    from jsonb_array_elements_text(v_access_item -> 'permissionKeys') as permission(value);

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

    if cardinality(v_old_permissions) <> cardinality(v_new_permissions) or not (v_old_permissions @> v_new_permissions and v_old_permissions <@ v_new_permissions) then
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
    end if;
  end loop;

  if v_target_role in ('manager'::public.app_role, 'supervisor'::public.app_role)
    and v_target_home_organization_id is not null
    and not exists (
      select 1
      from jsonb_array_elements(p_access) item
      where (item ->> 'organizationId')::uuid = v_target_home_organization_id
    )
  then
    insert into public.organization_access (user_id, organization_id, access_level)
    values (p_target_user_id, v_target_home_organization_id, 'view'::public.organization_access_level)
    on conflict (user_id, organization_id) do nothing;
  end if;
end;
$$;

insert into public.organization_access (user_id, organization_id, access_level)
select
  p.id,
  p.home_organization_id,
  case
    when exists (
      select 1
      from public.organization_user_permissions oup
      where oup.user_id = p.id
        and oup.organization_id = p.home_organization_id
        and oup.permission_key <> all(public.view_only_organization_permission_keys())
    ) then 'manage'::public.organization_access_level
    else 'view'::public.organization_access_level
  end
from public.profiles p
join public.organizations o
  on o.id = p.home_organization_id
 and o.is_active = true
where p.deleted_at is null
  and p.status = 'active'::public.account_status
  and p.role in ('manager'::public.app_role, 'supervisor'::public.app_role)
  and p.home_organization_id is not null
on conflict (user_id, organization_id) do nothing;

update public.organization_access oa
set
  access_level = case
    when exists (
      select 1
      from public.organization_user_permissions oup
      where oup.user_id = oa.user_id
        and oup.organization_id = oa.organization_id
        and oup.permission_key <> all(public.view_only_organization_permission_keys())
    ) then 'manage'::public.organization_access_level
    else 'view'::public.organization_access_level
  end,
  updated_at = timezone('utc', now())
from public.profiles p
where p.id = oa.user_id
  and p.deleted_at is null
  and p.status = 'active'::public.account_status
  and p.role in ('manager'::public.app_role, 'supervisor'::public.app_role)
  and p.home_organization_id = oa.organization_id;

revoke all on function public.can_view_organization(uuid) from public, anon;
revoke all on function public.can_manage_organization(uuid) from public, anon;
revoke all on function public.create_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  from public, anon;

grant execute on function public.can_view_organization(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.create_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, jsonb)
  to service_role;
grant execute on function public.update_managed_user_profile(uuid, uuid, text, public.app_role, text, uuid, boolean)
  to service_role;
grant execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
