create table if not exists public.maintenance_inventory_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  maintenance_job_id uuid null references public.maintenance_jobs(id) on delete set null,
  item_name text not null,
  category text not null,
  record_type text not null,
  quantity numeric(12,3) not null,
  unit text not null,
  note text null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_inventory_records_item_name_not_blank check (
    length(btrim(item_name)) between 1 and 160
  ),
  constraint maintenance_inventory_records_category_check check (
    category in ('oil', 'spare_part', 'material')
  ),
  constraint maintenance_inventory_records_record_type_check check (
    record_type in ('leftover', 'returned')
  ),
  constraint maintenance_inventory_records_unit_check check (
    unit in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
  ),
  constraint maintenance_inventory_records_quantity_check check (
    quantity > 0
  ),
  constraint maintenance_inventory_records_delete_shape_check check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);

create index if not exists maintenance_inventory_records_org_created_idx
  on public.maintenance_inventory_records (organization_id, deleted_at, created_at desc);

create index if not exists maintenance_inventory_records_org_category_type_idx
  on public.maintenance_inventory_records (organization_id, category, record_type, deleted_at);

create index if not exists maintenance_inventory_records_provider_created_idx
  on public.maintenance_inventory_records (provider_id, deleted_at, created_at desc);

create index if not exists maintenance_inventory_records_job_idx
  on public.maintenance_inventory_records (maintenance_job_id)
  where maintenance_job_id is not null;

drop trigger if exists set_maintenance_inventory_records_updated_at
  on public.maintenance_inventory_records;
create trigger set_maintenance_inventory_records_updated_at
  before update on public.maintenance_inventory_records
  for each row
  execute function public.set_maintenance_partner_updated_at();

alter table public.maintenance_inventory_records enable row level security;

revoke all on public.maintenance_inventory_records from public, anon, authenticated;
grant select on public.maintenance_inventory_records to authenticated;
grant select, insert, update, delete on public.maintenance_inventory_records to service_role;

drop policy if exists maintenance_inventory_records_select_authorized
  on public.maintenance_inventory_records;
create policy maintenance_inventory_records_select_authorized
  on public.maintenance_inventory_records
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_system_owner()
      or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
      or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
    )
  );

create or replace function public.validate_maintenance_inventory_admin_actor(
  p_actor_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null then
    raise exception 'MAINTENANCE_INVENTORY_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role in (
        'system_owner'::public.app_role,
        'manager'::public.app_role,
        'supervisor'::public.app_role
      )
  ) then
    raise exception 'MAINTENANCE_INVENTORY_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_organization_permission(
    p_actor_id,
    p_organization_id,
    'maintenance_materials.manage'
  ) then
    raise exception 'MAINTENANCE_INVENTORY_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.validate_maintenance_inventory_links(
  p_organization_id uuid,
  p_provider_id uuid,
  p_maintenance_job_id uuid
)
returns public.maintenance_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.maintenance_jobs%rowtype;
begin
  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.organization_id = p_organization_id
      and mpo.provider_id = p_provider_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_INVENTORY_PROVIDER_NOT_AVAILABLE' using errcode = '22023';
  end if;

  if p_maintenance_job_id is null then
    return null;
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_maintenance_job_id;

  if not found then
    raise exception 'MAINTENANCE_INVENTORY_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_job.organization_id <> p_organization_id
    or v_job.provider_id <> p_provider_id
  then
    raise exception 'MAINTENANCE_INVENTORY_JOB_INVALID_SCOPE' using errcode = '22023';
  end if;

  return v_job;
end;
$$;

create or replace function public.create_maintenance_inventory_record(
  p_organization_id uuid,
  p_provider_id uuid,
  p_item_name text,
  p_category text,
  p_record_type text,
  p_quantity numeric,
  p_unit text,
  p_maintenance_job_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_record public.maintenance_inventory_records%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_record_type text := btrim(coalesce(p_record_type, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_item_name is null
    or v_category not in ('oil', 'spare_part', 'material')
    or v_record_type not in ('leftover', 'returned')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or p_quantity is null
    or p_quantity <= 0
  then
    raise exception 'MAINTENANCE_INVENTORY_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  perform public.validate_maintenance_inventory_admin_actor(
    v_actor_id,
    p_organization_id
  );

  perform public.validate_maintenance_inventory_links(
    p_organization_id,
    p_provider_id,
    p_maintenance_job_id
  );

  insert into public.maintenance_inventory_records (
    organization_id,
    provider_id,
    maintenance_job_id,
    item_name,
    category,
    record_type,
    quantity,
    unit,
    note,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    p_provider_id,
    p_maintenance_job_id,
    v_item_name,
    v_category,
    v_record_type,
    p_quantity,
    v_unit,
    v_note,
    v_actor_id,
    v_actor_id
  )
  returning * into v_record;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_record.organization_id,
    'maintenance_inventory_created',
    'maintenance_inventory_record',
    v_record.id,
    null,
    to_jsonb(v_record),
    jsonb_build_object(
      'provider_id', v_record.provider_id,
      'maintenance_job_id', v_record.maintenance_job_id
    )
  );

  return jsonb_build_object('id', v_record.id, 'status', 'created');
end;
$$;

create or replace function public.update_maintenance_inventory_record(
  p_record_id uuid,
  p_item_name text,
  p_category text,
  p_record_type text,
  p_quantity numeric,
  p_unit text,
  p_maintenance_job_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_old_record public.maintenance_inventory_records%rowtype;
  v_record public.maintenance_inventory_records%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_record_type text := btrim(coalesce(p_record_type, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_item_name is null
    or v_category not in ('oil', 'spare_part', 'material')
    or v_record_type not in ('leftover', 'returned')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or p_quantity is null
    or p_quantity <= 0
  then
    raise exception 'MAINTENANCE_INVENTORY_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  select *
    into v_old_record
  from public.maintenance_inventory_records
  where id = p_record_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'MAINTENANCE_INVENTORY_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_inventory_admin_actor(
    v_actor_id,
    v_old_record.organization_id
  );

  perform public.validate_maintenance_inventory_links(
    v_old_record.organization_id,
    v_old_record.provider_id,
    p_maintenance_job_id
  );

  update public.maintenance_inventory_records
  set
    maintenance_job_id = p_maintenance_job_id,
    item_name = v_item_name,
    category = v_category,
    record_type = v_record_type,
    quantity = p_quantity,
    unit = v_unit,
    note = v_note,
    updated_by = v_actor_id
  where id = v_old_record.id
  returning * into v_record;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_record.organization_id,
    'maintenance_inventory_updated',
    'maintenance_inventory_record',
    v_record.id,
    to_jsonb(v_old_record),
    to_jsonb(v_record),
    jsonb_build_object(
      'provider_id', v_record.provider_id,
      'maintenance_job_id', v_record.maintenance_job_id
    )
  );

  return jsonb_build_object('id', v_record.id, 'status', 'updated');
end;
$$;

create or replace function public.archive_maintenance_inventory_record(
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_old_record public.maintenance_inventory_records%rowtype;
  v_record public.maintenance_inventory_records%rowtype;
begin
  select *
    into v_old_record
  from public.maintenance_inventory_records
  where id = p_record_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'MAINTENANCE_INVENTORY_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_inventory_admin_actor(
    v_actor_id,
    v_old_record.organization_id
  );

  update public.maintenance_inventory_records
  set
    deleted_at = now(),
    deleted_by = v_actor_id,
    updated_by = v_actor_id
  where id = v_old_record.id
  returning * into v_record;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_record.organization_id,
    'maintenance_inventory_archived',
    'maintenance_inventory_record',
    v_record.id,
    to_jsonb(v_old_record),
    to_jsonb(v_record),
    jsonb_build_object(
      'provider_id', v_record.provider_id,
      'maintenance_job_id', v_record.maintenance_job_id
    )
  );

  return jsonb_build_object('id', v_record.id, 'status', 'archived');
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
        and tablename = 'maintenance_inventory_records'
    ) then
      alter publication supabase_realtime add table public.maintenance_inventory_records;
    end if;
  end if;
end;
$$;

revoke all on function public.validate_maintenance_inventory_admin_actor(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.validate_maintenance_inventory_links(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_inventory_record(uuid, uuid, text, text, text, numeric, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_maintenance_inventory_record(uuid, text, text, text, numeric, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.archive_maintenance_inventory_record(uuid)
  from public, anon, authenticated;

grant execute on function public.validate_maintenance_inventory_admin_actor(uuid, uuid)
  to service_role;
grant execute on function public.validate_maintenance_inventory_links(uuid, uuid, uuid)
  to service_role;
grant execute on function public.create_maintenance_inventory_record(uuid, uuid, text, text, text, numeric, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.update_maintenance_inventory_record(uuid, text, text, text, numeric, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.archive_maintenance_inventory_record(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
