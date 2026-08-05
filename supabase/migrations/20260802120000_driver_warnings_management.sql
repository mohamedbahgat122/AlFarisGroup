-- Auditable Driver Warnings management shared by Dashboard and Driver PWA.

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
      'driver_warnings.revoke'
    )
  );

create table if not exists public.driver_warnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  category text not null,
  severity text not null,
  title text not null,
  description text not null,
  incident_at timestamptz not null,
  status text not null default 'active',
  issued_by_user_id uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default timezone('utc', now()),
  driver_seen_at timestamptz null,
  revoked_by_user_id uuid null references public.profiles(id) on delete restrict,
  revoked_at timestamptz null,
  revoke_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint driver_warnings_category_check check (
    category in (
      'attendance',
      'behavior',
      'compliance',
      'documentation',
      'performance',
      'safety',
      'vehicle_care',
      'other'
    )
  ),
  constraint driver_warnings_severity_check check (
    severity in ('low', 'medium', 'high')
  ),
  constraint driver_warnings_status_check check (
    status in ('active', 'revoked')
  ),
  constraint driver_warnings_title_not_blank check (length(btrim(title)) > 0),
  constraint driver_warnings_description_not_blank check (length(btrim(description)) > 0),
  constraint driver_warnings_revocation_shape check (
    (
      status = 'active'
      and revoked_by_user_id is null
      and revoked_at is null
      and revoke_reason is null
    )
    or (
      status = 'revoked'
      and revoked_by_user_id is not null
      and revoked_at is not null
      and length(btrim(coalesce(revoke_reason, ''))) > 0
    )
  )
);

create index if not exists driver_warnings_organization_created_idx
  on public.driver_warnings (organization_id, created_at desc);

create index if not exists driver_warnings_organization_status_idx
  on public.driver_warnings (organization_id, status, created_at desc);

create index if not exists driver_warnings_driver_issued_idx
  on public.driver_warnings (driver_id, issued_at desc);

create index if not exists driver_warnings_severity_idx
  on public.driver_warnings (severity);

create index if not exists driver_warnings_incident_idx
  on public.driver_warnings (incident_at desc);

alter table public.driver_warnings enable row level security;
alter table public.driver_warnings replica identity full;

revoke all on public.driver_warnings from public, anon, authenticated;
grant select on public.driver_warnings to authenticated;
grant select, insert, update, delete on public.driver_warnings to service_role;

drop policy if exists driver_warnings_select_admins on public.driver_warnings;
create policy driver_warnings_select_admins
  on public.driver_warnings
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'driver_warnings.view')
  );

drop policy if exists driver_warnings_select_own_driver on public.driver_warnings;
create policy driver_warnings_select_own_driver
  on public.driver_warnings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_warnings.driver_id
        and d.auth_user_id = auth.uid()
        and d.deleted_at is null
    )
  );

create or replace function public.prevent_driver_warning_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Driver warnings are immutable and cannot be deleted.';
end;
$$;

drop trigger if exists prevent_driver_warning_delete on public.driver_warnings;
create trigger prevent_driver_warning_delete
  before delete on public.driver_warnings
  for each row
  execute function public.prevent_driver_warning_delete();

create or replace function public.protect_driver_warning_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.driver_id is distinct from new.driver_id
    or old.category is distinct from new.category
    or old.severity is distinct from new.severity
    or old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.incident_at is distinct from new.incident_at
    or old.issued_by_user_id is distinct from new.issued_by_user_id
    or old.issued_at is distinct from new.issued_at
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Driver warning issuance fields are immutable.';
  end if;

  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'Revoked driver warnings cannot be reactivated.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_driver_warning_immutable_fields on public.driver_warnings;
create trigger protect_driver_warning_immutable_fields
  before update on public.driver_warnings
  for each row
  execute function public.protect_driver_warning_immutable_fields();

create or replace function public.issue_driver_warning(
  p_organization_id uuid,
  p_driver_id uuid,
  p_category text,
  p_severity text,
  p_title text,
  p_description text,
  p_incident_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_driver record;
  v_warning_id uuid;
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_severity text := lower(btrim(coalesce(p_severity, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
begin
  if v_actor_user_id is null then
    raise exception 'Driver warning issue failed: unauthorized.';
  end if;

  if not public.has_organization_permission(v_actor_user_id, p_organization_id, 'driver_warnings.issue') then
    raise exception 'Driver warning issue failed: permission denied.';
  end if;

  if v_category not in ('attendance', 'behavior', 'compliance', 'documentation', 'performance', 'safety', 'vehicle_care', 'other') then
    raise exception 'Driver warning issue failed: invalid category.';
  end if;

  if v_severity not in ('low', 'medium', 'high') then
    raise exception 'Driver warning issue failed: invalid severity.';
  end if;

  if length(v_title) = 0 or length(v_description) = 0 or p_incident_at is null then
    raise exception 'Driver warning issue failed: missing required details.';
  end if;

  select d.id, d.full_name, d.auth_user_id
    into v_driver
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
    and d.deleted_at is null
    and d.status = 'active'::public.driver_status;

  if not found then
    raise exception 'Driver warning issue failed: active driver not found in organization.';
  end if;

  if v_driver.auth_user_id is null then
    raise exception 'Driver warning issue failed: driver account is not linked.';
  end if;

  insert into public.driver_warnings (
    organization_id,
    driver_id,
    category,
    severity,
    title,
    description,
    incident_at,
    issued_by_user_id
  )
  values (
    p_organization_id,
    p_driver_id,
    v_category,
    v_severity,
    v_title,
    v_description,
    p_incident_at,
    v_actor_user_id
  )
  returning id into v_warning_id;

  perform public.insert_app_notification(
    v_driver.auth_user_id,
    p_organization_id,
    'driver_warning_issued',
    'New driver warning',
    'A new administrative warning has been issued. Open it to review the details.',
    'driver_warning',
    v_warning_id,
    'driver_warning:' || v_warning_id::text || ':issued:' || v_driver.auth_user_id::text
  );

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
    v_actor_user_id,
    v_driver.auth_user_id,
    p_organization_id,
    'driver_warning_issued',
    'driver_warning',
    v_warning_id,
    null,
    jsonb_build_object(
      'driver_id', p_driver_id,
      'category', v_category,
      'severity', v_severity,
      'status', 'active',
      'incident_at', p_incident_at
    ),
    jsonb_build_object('source', 'logistics-dashboard')
  );

  return v_warning_id;
end;
$$;

create or replace function public.revoke_driver_warning(
  p_warning_id uuid,
  p_revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_warning record;
  v_reason text := btrim(coalesce(p_revoke_reason, ''));
begin
  if v_actor_user_id is null then
    raise exception 'Driver warning revoke failed: unauthorized.';
  end if;

  if length(v_reason) = 0 then
    raise exception 'Driver warning revoke failed: revoke reason is required.';
  end if;

  select w.*
    into v_warning
  from public.driver_warnings w
  where w.id = p_warning_id
    and w.status = 'active';

  if not found then
    raise exception 'Driver warning revoke failed: active warning not found.';
  end if;

  if not public.has_organization_permission(v_actor_user_id, v_warning.organization_id, 'driver_warnings.revoke') then
    raise exception 'Driver warning revoke failed: permission denied.';
  end if;

  update public.driver_warnings
  set
    status = 'revoked',
    revoked_by_user_id = v_actor_user_id,
    revoked_at = timezone('utc', now()),
    revoke_reason = v_reason
  where id = p_warning_id
    and status = 'active';

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
    v_actor_user_id,
    null,
    v_warning.organization_id,
    'driver_warning_revoked',
    'driver_warning',
    p_warning_id,
    jsonb_build_object(
      'status', v_warning.status,
      'revoke_reason', null
    ),
    jsonb_build_object(
      'status', 'revoked',
      'revoke_reason', v_reason
    ),
    jsonb_build_object('source', 'logistics-dashboard')
  );
end;
$$;

create or replace function public.mark_driver_warning_seen(p_warning_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_warning record;
begin
  if v_actor_user_id is null then
    raise exception 'Driver warning seen failed: unauthorized.';
  end if;

  select w.id, w.organization_id, w.driver_id, w.driver_seen_at
    into v_warning
  from public.driver_warnings w
  join public.drivers d on d.id = w.driver_id
  where w.id = p_warning_id
    and d.auth_user_id = v_actor_user_id
    and d.deleted_at is null;

  if not found then
    raise exception 'Driver warning seen failed: warning not found.';
  end if;

  if v_warning.driver_seen_at is null then
    update public.driver_warnings
    set driver_seen_at = timezone('utc', now())
    where id = p_warning_id
      and driver_seen_at is null;

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
      v_actor_user_id,
      v_actor_user_id,
      v_warning.organization_id,
      'driver_warning_seen',
      'driver_warning',
      p_warning_id,
      jsonb_build_object('driver_seen_at', null),
      jsonb_build_object('driver_seen_at', timezone('utc', now())),
      jsonb_build_object('source', 'alfaris-driver-pwa')
    );
  end if;
end;
$$;

revoke all on function public.prevent_driver_warning_delete() from public, anon, authenticated;
revoke all on function public.protect_driver_warning_immutable_fields() from public, anon, authenticated;
revoke all on function public.issue_driver_warning(uuid, uuid, text, text, text, text, timestamptz)
  from public, anon;
revoke all on function public.revoke_driver_warning(uuid, text)
  from public, anon;
revoke all on function public.mark_driver_warning_seen(uuid)
  from public, anon;

grant execute on function public.issue_driver_warning(uuid, uuid, text, text, text, text, timestamptz)
  to authenticated;
grant execute on function public.revoke_driver_warning(uuid, text)
  to authenticated;
grant execute on function public.mark_driver_warning_seen(uuid)
  to authenticated;

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
    'odometer.manage',
    'notifications.view',
    'driver_warnings.view'
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
    'odometer.manage',
    'notifications.view',
    'driver_warnings.view',
    'driver_warnings.issue',
    'driver_warnings.revoke'
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_warnings'
    ) then
      alter publication supabase_realtime add table public.driver_warnings;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
