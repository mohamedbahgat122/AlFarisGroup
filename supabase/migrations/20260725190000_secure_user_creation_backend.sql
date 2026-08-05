-- Phase 3A: secure backend support for managed user creation.
--
-- Supabase Auth users are created first by a server-only Admin client.
-- This function atomically creates the matching profile and any additional
-- organization access rows. It is callable only by the service_role database role.

create or replace function public.create_managed_user_profile(
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
  if p_user_id is null then
    raise exception 'Managed user profile creation failed: user id is required.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
  ) then
    raise exception 'Managed user profile creation failed: profile already exists.';
  end if;

  v_full_name := btrim(coalesce(p_full_name, ''));
  if v_full_name = '' or length(v_full_name) > 160 then
    raise exception 'Managed user profile creation failed: invalid full name.';
  end if;

  if p_role not in (
    'manager'::public.app_role,
    'supervisor'::public.app_role,
    'driver'::public.app_role
  ) then
    raise exception 'Managed user profile creation failed: invalid role.';
  end if;

  v_job_title := btrim(coalesce(p_job_title, ''));
  if v_job_title = '' or length(v_job_title) > 160 then
    raise exception 'Managed user profile creation failed: invalid job title.';
  end if;

  if p_home_organization_id is null then
    raise exception 'Managed user profile creation failed: home organization is required.';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_home_organization_id
      and o.is_active = true
  ) then
    raise exception 'Managed user profile creation failed: home organization is inactive or missing.';
  end if;

  if p_additional_access is null then
    p_additional_access := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_additional_access) <> 'array' then
    raise exception 'Managed user profile creation failed: additional access must be an array.';
  end if;

  if p_role = 'driver'::public.app_role and jsonb_array_length(p_additional_access) > 0 then
    raise exception 'Managed user profile creation failed: drivers cannot receive additional organization access.';
  end if;

  for v_access_item in
    select value
    from jsonb_array_elements(p_additional_access)
  loop
    if jsonb_typeof(v_access_item) <> 'object' then
      raise exception 'Managed user profile creation failed: each additional access entry must be an object.';
    end if;

    if not (v_access_item ? 'organization_id') or not (v_access_item ? 'access_level') then
      raise exception 'Managed user profile creation failed: malformed additional access entry.';
    end if;

    begin
      v_organization_id := (v_access_item ->> 'organization_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Managed user profile creation failed: invalid additional organization id.';
    end;

    if v_organization_id = p_home_organization_id then
      raise exception 'Managed user profile creation failed: home organization cannot be duplicated as additional access.';
    end if;

    if v_organization_id = any(v_seen_organization_ids) then
      raise exception 'Managed user profile creation failed: duplicate additional organization access.';
    end if;

    v_seen_organization_ids := array_append(v_seen_organization_ids, v_organization_id);

    begin
      v_access_level := (v_access_item ->> 'access_level')::public.organization_access_level;
    exception
      when invalid_text_representation then
        raise exception 'Managed user profile creation failed: invalid additional access level.';
    end;

    if v_access_level not in (
      'view'::public.organization_access_level,
      'manage'::public.organization_access_level
    ) then
      raise exception 'Managed user profile creation failed: invalid additional access level.';
    end if;

    if not exists (
      select 1
      from public.organizations o
      where o.id = v_organization_id
        and o.is_active = true
    ) then
      raise exception 'Managed user profile creation failed: additional organization is inactive or missing.';
    end if;
  end loop;

  insert into public.profiles (
    id,
    full_name,
    role,
    job_title,
    status,
    home_organization_id
  )
  values (
    p_user_id,
    v_full_name,
    p_role,
    v_job_title,
    'active'::public.account_status,
    p_home_organization_id
  );

  for v_access_item in
    select value
    from jsonb_array_elements(p_additional_access)
  loop
    insert into public.organization_access (
      user_id,
      organization_id,
      access_level
    )
    values (
      p_user_id,
      (v_access_item ->> 'organization_id')::uuid,
      (v_access_item ->> 'access_level')::public.organization_access_level
    );
  end loop;
end;
$$;

revoke all on function public.create_managed_user_profile(
  uuid,
  text,
  public.app_role,
  text,
  uuid,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_managed_user_profile(
  uuid,
  text,
  public.app_role,
  text,
  uuid,
  jsonb
) to service_role;
