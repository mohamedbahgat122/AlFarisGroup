create or replace function public.organization_permission_keys()
returns text[]
language sql
stable
set search_path = ''
as $$
  select array[
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
    'entitlements.view',
    'entitlements.create_transaction',
    'entitlements.view_transactions',
    'entitlements.reverse_transaction',
    'entitlements.publish',
    'shifts.view',
    'shifts.create',
    'shifts.update',
    'shifts.assign',
    'shifts.archive',
    'maintenance_providers.view',
    'maintenance_providers.manage',
    'maintenance_jobs.view',
    'maintenance_jobs.assign',
    'maintenance_jobs.cancel',
    'maintenance_materials.view',
    'maintenance_materials.manage'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key = any(public.organization_permission_keys())
  );

create table if not exists public.maintenance_job_materials (
  id uuid primary key default gen_random_uuid(),
  maintenance_job_id uuid not null references public.maintenance_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  item_name text not null,
  category text not null,
  unit text not null,
  issued_quantity numeric(12,3) not null,
  used_quantity numeric(12,3) null,
  returned_quantity numeric(12,3) generated always as (
    case
      when used_quantity is null then null
      else issued_quantity - used_quantity
    end
  ) stored,
  usage_recorded_at timestamptz null,
  usage_recorded_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_job_materials_item_name_not_blank check (
    length(btrim(item_name)) between 1 and 160
  ),
  constraint maintenance_job_materials_category_check check (
    category in ('oil', 'spare_part', 'material')
  ),
  constraint maintenance_job_materials_unit_check check (
    unit in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
  ),
  constraint maintenance_job_materials_issued_quantity_check check (
    issued_quantity > 0
  ),
  constraint maintenance_job_materials_used_quantity_check check (
    used_quantity is null or (used_quantity >= 0 and used_quantity <= issued_quantity)
  ),
  constraint maintenance_job_materials_usage_shape_check check (
    (used_quantity is null and usage_recorded_at is null and usage_recorded_by is null)
    or (used_quantity is not null and usage_recorded_at is not null and usage_recorded_by is not null)
  )
);

create index if not exists maintenance_job_materials_job_idx
  on public.maintenance_job_materials (maintenance_job_id, created_at desc);

create index if not exists maintenance_job_materials_organization_category_idx
  on public.maintenance_job_materials (organization_id, category, created_at desc);

create index if not exists maintenance_job_materials_provider_job_idx
  on public.maintenance_job_materials (provider_id, maintenance_job_id);

drop trigger if exists set_maintenance_job_materials_updated_at
  on public.maintenance_job_materials;
create trigger set_maintenance_job_materials_updated_at
  before update on public.maintenance_job_materials
  for each row
  execute function public.set_maintenance_partner_updated_at();

alter table public.maintenance_job_materials enable row level security;

revoke all on public.maintenance_job_materials from public, anon, authenticated;
grant select on public.maintenance_job_materials to authenticated;
grant select, insert, update, delete on public.maintenance_job_materials to service_role;

drop policy if exists maintenance_job_materials_select_authorized
  on public.maintenance_job_materials;
create policy maintenance_job_materials_select_authorized
  on public.maintenance_job_materials
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(provider_id)
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
  );

create or replace function public.create_maintenance_job_material(
  p_maintenance_job_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_issued_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_material public.maintenance_job_materials%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_item_name is null
    or v_category not in ('oil', 'spare_part', 'material')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or p_issued_quantity is null
    or p_issued_quantity <= 0
  then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_maintenance_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_job.status not in ('ready', 'in_progress') then
    raise exception 'MAINTENANCE_MATERIAL_JOB_LOCKED' using errcode = '22023';
  end if;

  if not public.has_organization_permission(v_actor_id, v_job.organization_id, 'maintenance_materials.manage') then
    raise exception 'MAINTENANCE_MATERIAL_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.maintenance_job_materials (
    maintenance_job_id,
    organization_id,
    provider_id,
    item_name,
    category,
    unit,
    issued_quantity,
    created_by,
    updated_by
  )
  values (
    v_job.id,
    v_job.organization_id,
    v_job.provider_id,
    v_item_name,
    v_category,
    v_unit,
    p_issued_quantity,
    v_actor_id,
    v_actor_id
  )
  returning * into v_material;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_created',
    'maintenance_job_material',
    v_material.id,
    null,
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id
    )
  );

  return jsonb_build_object('id', v_material.id, 'status', 'created');
end;
$$;

create or replace function public.update_maintenance_job_material(
  p_material_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_issued_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_job public.maintenance_jobs%rowtype;
  v_old_material public.maintenance_job_materials%rowtype;
  v_material public.maintenance_job_materials%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_item_name is null
    or v_category not in ('oil', 'spare_part', 'material')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or p_issued_quantity is null
    or p_issued_quantity <= 0
  then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  select *
    into v_old_material
  from public.maintenance_job_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = v_old_material.maintenance_job_id
  for update;

  if not found
    or v_job.organization_id <> v_old_material.organization_id
    or v_job.provider_id <> v_old_material.provider_id
  then
    raise exception 'MAINTENANCE_MATERIAL_JOB_INVALID_STATE' using errcode = '22023';
  end if;

  if v_job.status not in ('ready', 'in_progress') then
    raise exception 'MAINTENANCE_MATERIAL_JOB_LOCKED' using errcode = '22023';
  end if;

  if not public.has_organization_permission(v_actor_id, v_job.organization_id, 'maintenance_materials.manage') then
    raise exception 'MAINTENANCE_MATERIAL_FORBIDDEN' using errcode = '42501';
  end if;

  if v_old_material.used_quantity is not null and p_issued_quantity < v_old_material.used_quantity then
    raise exception 'MAINTENANCE_MATERIAL_USED_EXCEEDS_ISSUED' using errcode = '23514';
  end if;

  update public.maintenance_job_materials
  set
    item_name = v_item_name,
    category = v_category,
    unit = v_unit,
    issued_quantity = p_issued_quantity,
    organization_id = v_job.organization_id,
    provider_id = v_job.provider_id,
    updated_by = v_actor_id
  where id = v_old_material.id
  returning * into v_material;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_updated',
    'maintenance_job_material',
    v_material.id,
    to_jsonb(v_old_material),
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id
    )
  );

  return jsonb_build_object('id', v_material.id, 'status', 'updated');
end;
$$;

create or replace function public.delete_maintenance_job_material(
  p_material_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_job public.maintenance_jobs%rowtype;
  v_material public.maintenance_job_materials%rowtype;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_material
  from public.maintenance_job_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = v_material.maintenance_job_id
  for update;

  if not found
    or v_job.organization_id <> v_material.organization_id
    or v_job.provider_id <> v_material.provider_id
  then
    raise exception 'MAINTENANCE_MATERIAL_JOB_INVALID_STATE' using errcode = '22023';
  end if;

  if v_job.status not in ('ready', 'in_progress') then
    raise exception 'MAINTENANCE_MATERIAL_JOB_LOCKED' using errcode = '22023';
  end if;

  if v_material.used_quantity is not null then
    raise exception 'MAINTENANCE_MATERIAL_USAGE_ALREADY_RECORDED' using errcode = '22023';
  end if;

  if not public.has_organization_permission(v_actor_id, v_job.organization_id, 'maintenance_materials.manage') then
    raise exception 'MAINTENANCE_MATERIAL_FORBIDDEN' using errcode = '42501';
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_deleted',
    'maintenance_job_material',
    v_material.id,
    to_jsonb(v_material),
    null,
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id
    )
  );

  delete from public.maintenance_job_materials
  where id = v_material.id;

  return jsonb_build_object('id', v_material.id, 'status', 'deleted');
end;
$$;

create or replace function public.record_maintenance_job_material_usage(
  p_material_id uuid,
  p_used_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_job public.maintenance_jobs%rowtype;
  v_old_material public.maintenance_job_materials%rowtype;
  v_material public.maintenance_job_materials%rowtype;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_used_quantity is null or p_used_quantity < 0 then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_USAGE' using errcode = '22023';
  end if;

  select *
    into v_old_material
  from public.maintenance_job_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_used_quantity > v_old_material.issued_quantity then
    raise exception 'MAINTENANCE_MATERIAL_USED_EXCEEDS_ISSUED' using errcode = '23514';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = v_old_material.maintenance_job_id
  for update;

  if not found
    or v_job.organization_id <> v_old_material.organization_id
    or v_job.provider_id <> v_old_material.provider_id
  then
    raise exception 'MAINTENANCE_MATERIAL_JOB_INVALID_STATE' using errcode = '22023';
  end if;

  if v_job.status <> 'in_progress' then
    raise exception 'MAINTENANCE_MATERIAL_JOB_LOCKED' using errcode = '22023';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_MATERIAL_FORBIDDEN' using errcode = '42501';
  end if;

  if v_old_material.used_quantity is not distinct from p_used_quantity then
    return jsonb_build_object(
      'id', v_old_material.id,
      'status', 'unchanged',
      'returned_quantity', v_old_material.returned_quantity
    );
  end if;

  update public.maintenance_job_materials
  set
    used_quantity = p_used_quantity,
    usage_recorded_at = v_now,
    usage_recorded_by = v_actor_id,
    updated_by = v_actor_id
  where id = v_old_material.id
  returning * into v_material;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_usage_recorded',
    'maintenance_job_material',
    v_material.id,
    to_jsonb(v_old_material),
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id
    )
  );

  return jsonb_build_object(
    'id', v_material.id,
    'status', 'updated',
    'returned_quantity', v_material.returned_quantity
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'maintenance_job_materials'
    ) then
      alter publication supabase_realtime add table public.maintenance_job_materials;
    end if;
  end if;
end;
$$;

revoke all on function public.create_maintenance_job_material(uuid, text, text, text, numeric)
  from public, anon, authenticated;
revoke all on function public.update_maintenance_job_material(uuid, text, text, text, numeric)
  from public, anon, authenticated;
revoke all on function public.delete_maintenance_job_material(uuid)
  from public, anon, authenticated;
revoke all on function public.record_maintenance_job_material_usage(uuid, numeric)
  from public, anon, authenticated;

grant execute on function public.create_maintenance_job_material(uuid, text, text, text, numeric)
  to authenticated, service_role;
grant execute on function public.update_maintenance_job_material(uuid, text, text, text, numeric)
  to authenticated, service_role;
grant execute on function public.delete_maintenance_job_material(uuid)
  to authenticated, service_role;
grant execute on function public.record_maintenance_job_material_usage(uuid, numeric)
  to authenticated, service_role;

notify pgrst, 'reload schema';
