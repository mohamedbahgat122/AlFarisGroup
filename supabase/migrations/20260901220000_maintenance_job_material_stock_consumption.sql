alter table public.maintenance_job_materials
  add column if not exists source_type text null,
  add column if not exists stock_item_id uuid null,
  add column if not exists stock_movement_id uuid null,
  add column if not exists sku_snapshot text null,
  add column if not exists note text null,
  add column if not exists finalized_at timestamptz null,
  add column if not exists finalized_by uuid null references public.profiles(id) on delete set null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references public.profiles(id) on delete set null;

alter table public.maintenance_stock_movements
  add column if not exists maintenance_job_material_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_stock_item_fkey'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_stock_item_fkey
      foreign key (stock_item_id)
      references public.maintenance_stock_items(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_stock_movement_fkey'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_stock_movement_fkey
      foreign key (stock_movement_id)
      references public.maintenance_stock_movements(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_stock_movements_job_material_fkey'
      and conrelid = 'public.maintenance_stock_movements'::regclass
  ) then
    alter table public.maintenance_stock_movements
      add constraint maintenance_stock_movements_job_material_fkey
      foreign key (maintenance_job_material_id)
      references public.maintenance_job_materials(id)
      on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_source_type_check'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_source_type_check
      check (source_type is null or source_type in ('company_stock', 'provider_supplied'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_new_source_shape_check'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_new_source_shape_check
      check (
        source_type is null
        or (
          source_type = 'company_stock'
          and stock_item_id is not null
          and item_name is not null
          and length(btrim(item_name)) > 0
          and issued_quantity > 0
          and (finalized_at is null or stock_movement_id is not null)
        )
        or (
          source_type = 'provider_supplied'
          and stock_item_id is null
          and stock_movement_id is null
          and item_name is not null
          and length(btrim(item_name)) > 0
          and issued_quantity > 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_deleted_shape_check'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_deleted_shape_check
      check (
        (deleted_at is null and deleted_by is null)
        or (deleted_at is not null and deleted_by is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_job_materials_finalized_shape_check'
      and conrelid = 'public.maintenance_job_materials'::regclass
  ) then
    alter table public.maintenance_job_materials
      add constraint maintenance_job_materials_finalized_shape_check
      check (
        (finalized_at is null and finalized_by is null)
        or (finalized_at is not null and finalized_by is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_stock_movements_consume_material_check'
      and conrelid = 'public.maintenance_stock_movements'::regclass
  ) then
    alter table public.maintenance_stock_movements
      add constraint maintenance_stock_movements_consume_material_check
      check (movement_type <> 'consume' or maintenance_job_material_id is not null);
  end if;
end;
$$;

create unique index if not exists maintenance_job_materials_active_company_stock_item_key
  on public.maintenance_job_materials (maintenance_job_id, stock_item_id)
  where source_type = 'company_stock' and deleted_at is null;

create index if not exists maintenance_job_materials_job_active_idx
  on public.maintenance_job_materials (maintenance_job_id, finalized_at, created_at)
  where deleted_at is null;

create index if not exists maintenance_job_materials_stock_item_idx
  on public.maintenance_job_materials (stock_item_id)
  where stock_item_id is not null;

create index if not exists maintenance_stock_movements_job_material_idx
  on public.maintenance_stock_movements (maintenance_job_material_id)
  where maintenance_job_material_id is not null;

create table if not exists public.maintenance_job_material_draft_submissions (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_submission_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, client_submission_id),
  constraint maintenance_job_material_draft_submissions_operation_check check (
    operation in (
      'add_company_stock',
      'add_provider_supplied',
      'update_draft',
      'remove_draft'
    )
  )
);

create table if not exists public.maintenance_job_completion_submissions (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_submission_id uuid not null,
  maintenance_job_id uuid not null references public.maintenance_jobs(id) on delete restrict,
  payload_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, client_submission_id)
);

alter table public.maintenance_job_material_draft_submissions enable row level security;
alter table public.maintenance_job_completion_submissions enable row level security;

revoke all on public.maintenance_job_material_draft_submissions from public, anon, authenticated;
revoke all on public.maintenance_job_completion_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.maintenance_job_material_draft_submissions to service_role;
grant select, insert, update, delete on public.maintenance_job_completion_submissions to service_role;

create or replace function public.claim_maintenance_material_draft_submission(
  p_actor_id uuid,
  p_client_submission_id uuid,
  p_operation text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.maintenance_job_material_draft_submissions%rowtype;
begin
  insert into public.maintenance_job_material_draft_submissions (
    actor_id,
    client_submission_id,
    operation,
    payload_hash
  )
  values (
    p_actor_id,
    p_client_submission_id,
    p_operation,
    p_payload_hash
  )
  on conflict (actor_id, client_submission_id) do nothing;

  if found then
    return null;
  end if;

  select *
    into v_existing
  from public.maintenance_job_material_draft_submissions
  where actor_id = p_actor_id
    and client_submission_id = p_client_submission_id;

  if not found
    or v_existing.operation <> p_operation
    or v_existing.payload_hash <> p_payload_hash
  then
    raise exception 'MAINTENANCE_MATERIAL_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  return v_existing.result;
end;
$$;

create or replace function public.validate_maintenance_material_provider_job(
  p_job_id uuid
)
returns public.maintenance_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_job public.maintenance_jobs%rowtype;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_job.status <> 'in_progress' then
    raise exception 'MAINTENANCE_MATERIAL_JOB_LOCKED' using errcode = '22023';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_MATERIAL_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  return v_job;
end;
$$;

create or replace function public.create_maintenance_job_company_stock_material_draft(
  p_maintenance_job_id uuid,
  p_stock_item_id uuid,
  p_quantity numeric,
  p_note text,
  p_client_submission_id uuid
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
  v_stock_item public.maintenance_stock_items%rowtype;
  v_existing public.maintenance_job_materials%rowtype;
  v_material public.maintenance_job_materials%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payload_hash text;
  v_existing_result jsonb;
  v_status text;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or p_stock_item_id is null
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'add_company_stock',
    'maintenance_job_id', p_maintenance_job_id,
    'stock_item_id', p_stock_item_id,
    'quantity', p_quantity,
    'note', v_note
  )::text);

  v_existing_result := public.claim_maintenance_material_draft_submission(
    v_actor_id,
    p_client_submission_id,
    'add_company_stock',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  v_job := public.validate_maintenance_material_provider_job(p_maintenance_job_id);

  select *
    into v_stock_item
  from public.maintenance_stock_items
  where id = p_stock_item_id;

  if not found
    or v_stock_item.organization_id <> v_job.organization_id
    or v_stock_item.provider_id <> v_job.provider_id
    or v_stock_item.is_active = false
    or v_stock_item.archived_at is not null
  then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_stock_item.current_quantity < p_quantity then
    raise exception 'MAINTENANCE_STOCK_INSUFFICIENT_QUANTITY' using errcode = '23514';
  end if;

  select *
    into v_existing
  from public.maintenance_job_materials
  where maintenance_job_id = v_job.id
    and source_type = 'company_stock'
    and stock_item_id = v_stock_item.id
    and deleted_at is null
  for update;

  if found then
    if v_existing.finalized_at is not null then
      raise exception 'MAINTENANCE_MATERIAL_FINALIZED' using errcode = '22023';
    end if;

    update public.maintenance_job_materials
    set
      item_name = v_stock_item.item_name,
      category = v_stock_item.category,
      unit = v_stock_item.unit,
      issued_quantity = p_quantity,
      sku_snapshot = v_stock_item.sku,
      note = v_note,
      organization_id = v_job.organization_id,
      provider_id = v_job.provider_id,
      updated_by = v_actor_id
    where id = v_existing.id
    returning * into v_material;

    v_status := 'updated';
  else
    insert into public.maintenance_job_materials (
      maintenance_job_id,
      organization_id,
      provider_id,
      source_type,
      stock_item_id,
      item_name,
      category,
      unit,
      issued_quantity,
      sku_snapshot,
      note,
      created_by,
      updated_by
    )
    values (
      v_job.id,
      v_job.organization_id,
      v_job.provider_id,
      'company_stock',
      v_stock_item.id,
      v_stock_item.item_name,
      v_stock_item.category,
      v_stock_item.unit,
      p_quantity,
      v_stock_item.sku,
      v_note,
      v_actor_id,
      v_actor_id
    )
    returning * into v_material;

    v_status := 'created';
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    case when v_status = 'created' then 'maintenance_material_draft_added' else 'maintenance_material_draft_updated' end,
    'maintenance_job_material',
    v_material.id,
    case when v_status = 'created' then null else to_jsonb(v_existing) end,
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id,
      'source_type', v_material.source_type,
      'stock_item_id', v_material.stock_item_id
    )
  );

  v_existing_result := jsonb_build_object(
    'id', v_material.id,
    'status', v_status,
    'source_type', v_material.source_type,
    'stock_item_id', v_material.stock_item_id
  );

  update public.maintenance_job_material_draft_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
exception
  when unique_violation then
    raise exception 'MAINTENANCE_MATERIAL_DUPLICATE_STOCK_DRAFT' using errcode = '23505';
end;
$$;

create or replace function public.create_maintenance_job_provider_material_draft(
  p_maintenance_job_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_quantity numeric,
  p_note text,
  p_client_submission_id uuid
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
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payload_hash text;
  v_existing_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or v_item_name is null
    or length(v_item_name) > 160
    or v_category not in ('oil', 'spare_part', 'material')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'add_provider_supplied',
    'maintenance_job_id', p_maintenance_job_id,
    'item_name', v_item_name,
    'category', v_category,
    'unit', v_unit,
    'quantity', p_quantity,
    'note', v_note
  )::text);

  v_existing_result := public.claim_maintenance_material_draft_submission(
    v_actor_id,
    p_client_submission_id,
    'add_provider_supplied',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  v_job := public.validate_maintenance_material_provider_job(p_maintenance_job_id);

  insert into public.maintenance_job_materials (
    maintenance_job_id,
    organization_id,
    provider_id,
    source_type,
    item_name,
    category,
    unit,
    issued_quantity,
    note,
    created_by,
    updated_by
  )
  values (
    v_job.id,
    v_job.organization_id,
    v_job.provider_id,
    'provider_supplied',
    v_item_name,
    v_category,
    v_unit,
    p_quantity,
    v_note,
    v_actor_id,
    v_actor_id
  )
  returning * into v_material;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_draft_added',
    'maintenance_job_material',
    v_material.id,
    null,
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id,
      'source_type', v_material.source_type
    )
  );

  v_existing_result := jsonb_build_object(
    'id', v_material.id,
    'status', 'created',
    'source_type', v_material.source_type
  );

  update public.maintenance_job_material_draft_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
end;
$$;

create or replace function public.update_maintenance_job_material_draft(
  p_material_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_quantity numeric,
  p_note text,
  p_client_submission_id uuid
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
  v_stock_item public.maintenance_stock_items%rowtype;
  v_material_job_id uuid;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payload_hash text;
  v_existing_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'update_draft',
    'material_id', p_material_id,
    'item_name', v_item_name,
    'category', v_category,
    'unit', v_unit,
    'quantity', p_quantity,
    'note', v_note
  )::text);

  v_existing_result := public.claim_maintenance_material_draft_submission(
    v_actor_id,
    p_client_submission_id,
    'update_draft',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select maintenance_job_id
    into v_material_job_id
  from public.maintenance_job_materials
  where id = p_material_id;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_job := public.validate_maintenance_material_provider_job(v_material_job_id);

  select *
    into v_old_material
  from public.maintenance_job_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_old_material.source_type is null then
    raise exception 'MAINTENANCE_MATERIAL_LEGACY_ROW_LOCKED' using errcode = '22023';
  end if;

  if v_old_material.deleted_at is not null then
    raise exception 'MAINTENANCE_MATERIAL_DELETED' using errcode = '22023';
  end if;

  if v_old_material.finalized_at is not null then
    raise exception 'MAINTENANCE_MATERIAL_FINALIZED' using errcode = '22023';
  end if;

  if v_old_material.maintenance_job_id <> v_job.id
    or v_job.organization_id <> v_old_material.organization_id
    or v_job.provider_id <> v_old_material.provider_id
  then
    raise exception 'MAINTENANCE_MATERIAL_JOB_INVALID_STATE' using errcode = '22023';
  end if;

  if v_old_material.source_type = 'company_stock' then
    select *
      into v_stock_item
    from public.maintenance_stock_items
    where id = v_old_material.stock_item_id;

    if not found
      or v_stock_item.organization_id <> v_job.organization_id
      or v_stock_item.provider_id <> v_job.provider_id
      or v_stock_item.is_active = false
      or v_stock_item.archived_at is not null
    then
      raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_stock_item.current_quantity < p_quantity then
      raise exception 'MAINTENANCE_STOCK_INSUFFICIENT_QUANTITY' using errcode = '23514';
    end if;

    update public.maintenance_job_materials
    set
      item_name = v_stock_item.item_name,
      category = v_stock_item.category,
      unit = v_stock_item.unit,
      issued_quantity = p_quantity,
      sku_snapshot = v_stock_item.sku,
      note = v_note,
      updated_by = v_actor_id
    where id = v_old_material.id
    returning * into v_material;
  else
    if v_item_name is null
      or length(v_item_name) > 160
      or v_category not in ('oil', 'spare_part', 'material')
      or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    then
      raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
    end if;

    update public.maintenance_job_materials
    set
      item_name = v_item_name,
      category = v_category,
      unit = v_unit,
      issued_quantity = p_quantity,
      note = v_note,
      updated_by = v_actor_id
    where id = v_old_material.id
    returning * into v_material;
  end if;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_material.organization_id,
    'maintenance_material_draft_updated',
    'maintenance_job_material',
    v_material.id,
    to_jsonb(v_old_material),
    to_jsonb(v_material),
    jsonb_build_object(
      'maintenance_job_id', v_material.maintenance_job_id,
      'provider_id', v_material.provider_id,
      'source_type', v_material.source_type
    )
  );

  v_existing_result := jsonb_build_object(
    'id', v_material.id,
    'status', 'updated',
    'source_type', v_material.source_type
  );

  update public.maintenance_job_material_draft_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
end;
$$;

create or replace function public.remove_maintenance_job_material_draft(
  p_material_id uuid,
  p_client_submission_id uuid
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
  v_material_job_id uuid;
  v_payload_hash text;
  v_existing_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_MATERIAL_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null then
    raise exception 'MAINTENANCE_MATERIAL_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'remove_draft',
    'material_id', p_material_id
  )::text);

  v_existing_result := public.claim_maintenance_material_draft_submission(
    v_actor_id,
    p_client_submission_id,
    'remove_draft',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select maintenance_job_id
    into v_material_job_id
  from public.maintenance_job_materials
  where id = p_material_id;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_job := public.validate_maintenance_material_provider_job(v_material_job_id);

  select *
    into v_old_material
  from public.maintenance_job_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_old_material.source_type is null then
    raise exception 'MAINTENANCE_MATERIAL_LEGACY_ROW_LOCKED' using errcode = '22023';
  end if;

  if v_old_material.finalized_at is not null then
    raise exception 'MAINTENANCE_MATERIAL_FINALIZED' using errcode = '22023';
  end if;

  if v_old_material.maintenance_job_id <> v_job.id
    or v_job.organization_id <> v_old_material.organization_id
    or v_job.provider_id <> v_old_material.provider_id
  then
    raise exception 'MAINTENANCE_MATERIAL_JOB_INVALID_STATE' using errcode = '22023';
  end if;

  if v_old_material.deleted_at is not null then
    v_material := v_old_material;
  else
    update public.maintenance_job_materials
    set
      deleted_at = v_now,
      deleted_by = v_actor_id,
      updated_by = v_actor_id
    where id = v_old_material.id
    returning * into v_material;

    perform public.insert_maintenance_activity_log(
      v_actor_id,
      v_material.organization_id,
      'maintenance_material_draft_removed',
      'maintenance_job_material',
      v_material.id,
      to_jsonb(v_old_material),
      to_jsonb(v_material),
      jsonb_build_object(
        'maintenance_job_id', v_material.maintenance_job_id,
        'provider_id', v_material.provider_id,
        'source_type', v_material.source_type
      )
    );
  end if;

  v_existing_result := jsonb_build_object(
    'id', v_material.id,
    'status', case when v_old_material.deleted_at is null then 'removed' else 'unchanged' end,
    'source_type', v_material.source_type
  );

  update public.maintenance_job_material_draft_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
end;
$$;

create or replace function public.complete_maintenance_job(
  p_job_id uuid,
  p_completion_notes text,
  p_oil_interval_km integer,
  p_client_submission_id uuid
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
  v_stock_item public.maintenance_stock_items%rowtype;
  v_stock_item_id uuid;
  v_item_after public.maintenance_stock_items%rowtype;
  v_movement public.maintenance_stock_movements%rowtype;
  v_existing_movement public.maintenance_stock_movements%rowtype;
  v_submission public.maintenance_job_completion_submissions%rowtype;
  v_completion_notes text := nullif(btrim(coalesce(p_completion_notes, '')), '');
  v_payload_hash text;
  v_movement_payload_hash text;
  v_quantity_after numeric(12,3);
  v_result jsonb;
  v_finalized_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null then
    raise exception 'MAINTENANCE_JOB_INVALID_COMPLETION_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'complete_maintenance_job',
    'maintenance_job_id', p_job_id,
    'completion_notes', v_completion_notes,
    'oil_interval_km', p_oil_interval_km
  )::text);

  insert into public.maintenance_job_completion_submissions (
    actor_id,
    client_submission_id,
    maintenance_job_id,
    payload_hash
  )
  values (
    v_actor_id,
    p_client_submission_id,
    p_job_id,
    v_payload_hash
  )
  on conflict (actor_id, client_submission_id) do nothing;

  if not found then
    select *
      into v_submission
    from public.maintenance_job_completion_submissions
    where actor_id = v_actor_id
      and client_submission_id = p_client_submission_id;

    if not found
      or v_submission.maintenance_job_id <> p_job_id
      or v_submission.payload_hash <> v_payload_hash
    then
      raise exception 'MAINTENANCE_JOB_COMPLETION_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    return v_submission.result;
  end if;

  select *
    into v_job
  from public.maintenance_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_JOB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.maintenance_partner_has_provider_access(v_job.provider_id) then
    raise exception 'MAINTENANCE_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = v_job.provider_id
      and mpo.organization_id = v_job.organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_PROVIDER_NOT_AVAILABLE' using errcode = '42501';
  end if;

  if v_job.status = 'completed' then
    v_result := public.complete_maintenance_job(
      p_job_id,
      p_completion_notes,
      p_oil_interval_km
    );

    update public.maintenance_job_completion_submissions
    set result = v_result
    where actor_id = v_actor_id
      and client_submission_id = p_client_submission_id;

    return v_result;
  end if;

  if v_job.status <> 'in_progress' then
    raise exception 'MAINTENANCE_JOB_INVALID_STATUS' using errcode = '22023';
  end if;

  for v_material in
    select *
    from public.maintenance_job_materials
    where maintenance_job_id = v_job.id
      and source_type in ('company_stock', 'provider_supplied')
      and deleted_at is null
      and finalized_at is null
    order by id
    for update
  loop
    null;
  end loop;

  for v_stock_item_id in
    select distinct material.stock_item_id
    from public.maintenance_job_materials material
    where material.maintenance_job_id = v_job.id
      and material.source_type = 'company_stock'
      and material.deleted_at is null
      and material.finalized_at is null
      and material.stock_item_id is not null
    order by material.stock_item_id
  loop
    select *
      into v_stock_item
    from public.maintenance_stock_items
    where id = v_stock_item_id
    for update;

    if not found
      or v_stock_item.organization_id <> v_job.organization_id
      or v_stock_item.provider_id <> v_job.provider_id
      or v_stock_item.is_active = false
      or v_stock_item.archived_at is not null
    then
      raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;
  end loop;

  for v_material in
    select *
    from public.maintenance_job_materials
    where maintenance_job_id = v_job.id
      and source_type in ('company_stock', 'provider_supplied')
      and deleted_at is null
      and finalized_at is null
    order by id
    for update
  loop
    if v_material.source_type = 'company_stock' then
      select *
        into v_stock_item
      from public.maintenance_stock_items
      where id = v_material.stock_item_id
      for update;

      if not found
        or v_stock_item.organization_id <> v_job.organization_id
        or v_stock_item.provider_id <> v_job.provider_id
        or v_stock_item.is_active = false
        or v_stock_item.archived_at is not null
      then
        raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
      end if;

      if v_stock_item.current_quantity < v_material.issued_quantity then
        raise exception 'MAINTENANCE_STOCK_INSUFFICIENT_QUANTITY' using errcode = '23514';
      end if;

      v_quantity_after := v_stock_item.current_quantity - v_material.issued_quantity;
      v_movement_payload_hash := md5(jsonb_build_object(
        'operation', 'maintenance_job_material_consume',
        'maintenance_job_id', v_job.id,
        'material_id', v_material.id,
        'stock_item_id', v_stock_item.id,
        'quantity', v_material.issued_quantity
      )::text);

      insert into public.maintenance_stock_movements (
        stock_item_id,
        organization_id,
        provider_id,
        maintenance_job_id,
        maintenance_job_material_id,
        movement_type,
        quantity,
        quantity_delta,
        quantity_before,
        quantity_after,
        note,
        client_submission_id,
        payload_hash,
        created_at,
        created_by
      )
      values (
        v_stock_item.id,
        v_stock_item.organization_id,
        v_stock_item.provider_id,
        v_job.id,
        v_material.id,
        'consume',
        v_material.issued_quantity,
        -v_material.issued_quantity,
        v_stock_item.current_quantity,
        v_quantity_after,
        coalesce(v_material.note, 'Maintenance job material consumption'),
        v_material.id,
        v_movement_payload_hash,
        v_now,
        v_actor_id
      )
      on conflict (created_by, client_submission_id) do nothing
      returning * into v_movement;

      if not found then
        select *
          into v_existing_movement
        from public.maintenance_stock_movements
        where created_by = v_actor_id
          and client_submission_id = v_material.id;

        if not found or v_existing_movement.payload_hash <> v_movement_payload_hash then
          raise exception 'MAINTENANCE_STOCK_IDEMPOTENCY_CONFLICT' using errcode = '23505';
        end if;

        v_movement := v_existing_movement;
      else
        update public.maintenance_stock_items
        set
          current_quantity = v_quantity_after,
          updated_at = v_now,
          updated_by = v_actor_id
        where id = v_stock_item.id
        returning * into v_item_after;

        perform public.insert_maintenance_activity_log(
          v_actor_id,
          v_stock_item.organization_id,
          'maintenance_stock_consumed',
          'maintenance_stock_movement',
          v_movement.id,
          to_jsonb(v_stock_item),
          to_jsonb(v_item_after),
          jsonb_build_object(
            'maintenance_job_id', v_job.id,
            'maintenance_job_material_id', v_material.id,
            'stock_item_id', v_stock_item.id,
            'provider_id', v_stock_item.provider_id,
            'quantity_delta', v_movement.quantity_delta
          )
        );
      end if;

      update public.maintenance_job_materials
      set
        stock_movement_id = v_movement.id,
        used_quantity = issued_quantity,
        usage_recorded_at = v_now,
        usage_recorded_by = v_actor_id,
        finalized_at = v_now,
        finalized_by = v_actor_id,
        updated_by = v_actor_id
      where id = v_material.id;
    else
      update public.maintenance_job_materials
      set
        used_quantity = issued_quantity,
        usage_recorded_at = v_now,
        usage_recorded_by = v_actor_id,
        finalized_at = v_now,
        finalized_by = v_actor_id,
        updated_by = v_actor_id
      where id = v_material.id;
    end if;

    v_finalized_count := v_finalized_count + 1;
  end loop;

  if v_finalized_count > 0 then
    perform public.insert_maintenance_activity_log(
      v_actor_id,
      v_job.organization_id,
      'maintenance_materials_finalized',
      'maintenance_job',
      v_job.id,
      null,
      null,
      jsonb_build_object(
        'maintenance_job_id', v_job.id,
        'provider_id', v_job.provider_id,
        'finalized_count', v_finalized_count
      )
    );
  end if;

  v_result := public.complete_maintenance_job(
    p_job_id,
    p_completion_notes,
    p_oil_interval_km
  );

  update public.maintenance_job_completion_submissions
  set result = v_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_result;
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

revoke all on function public.claim_maintenance_material_draft_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.validate_maintenance_material_provider_job(uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_job_company_stock_material_draft(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_job_provider_material_draft(uuid, text, text, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.update_maintenance_job_material_draft(uuid, text, text, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.remove_maintenance_job_material_draft(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_maintenance_job(uuid, text, integer, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_maintenance_material_draft_submission(uuid, uuid, text, text)
  to service_role;
grant execute on function public.validate_maintenance_material_provider_job(uuid)
  to service_role;
grant execute on function public.create_maintenance_job_company_stock_material_draft(uuid, uuid, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.create_maintenance_job_provider_material_draft(uuid, text, text, text, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.update_maintenance_job_material_draft(uuid, text, text, text, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.remove_maintenance_job_material_draft(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.complete_maintenance_job(uuid, text, integer, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
