create table if not exists public.maintenance_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.maintenance_stock_items(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  available_quantity numeric(12,3) not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_stock_allocations_quantity_check check (available_quantity >= 0),
  constraint maintenance_stock_allocations_archive_shape_check check (
    (archived_at is null and archived_by is null and is_active = true)
    or (archived_at is not null and archived_by is not null and is_active = false)
  )
);

create unique index if not exists maintenance_stock_allocations_active_item_org_key
  on public.maintenance_stock_allocations (stock_item_id, organization_id)
  where archived_at is null;

create index if not exists maintenance_stock_allocations_stock_active_idx
  on public.maintenance_stock_allocations (stock_item_id, is_active)
  where archived_at is null;

create index if not exists maintenance_stock_allocations_org_provider_idx
  on public.maintenance_stock_allocations (organization_id, provider_id, is_active)
  where archived_at is null;

create table if not exists public.maintenance_stock_allocation_movements (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.maintenance_stock_allocations(id) on delete restrict,
  stock_item_id uuid not null references public.maintenance_stock_items(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  movement_type text not null,
  quantity numeric(12,3) not null,
  quantity_delta numeric(12,3) not null,
  quantity_before numeric(12,3) not null,
  quantity_after numeric(12,3) not null,
  note text null,
  maintenance_job_id uuid null references public.maintenance_jobs(id) on delete restrict,
  maintenance_job_material_id uuid null references public.maintenance_job_materials(id) on delete restrict,
  client_submission_id uuid null,
  payload_hash text null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint maintenance_stock_allocation_movements_type_check check (
    movement_type in ('allocate', 'release', 'consume')
  ),
  constraint maintenance_stock_allocation_movements_quantity_check check (quantity > 0),
  constraint maintenance_stock_allocation_movements_delta_check check (
    (
      movement_type = 'allocate'
      and quantity_delta = quantity
    )
    or (
      movement_type in ('release', 'consume')
      and quantity_delta = -quantity
    )
  ),
  constraint maintenance_stock_allocation_movements_balance_check check (
    quantity_before >= 0
    and quantity_after >= 0
    and quantity_after = quantity_before + quantity_delta
  ),
  constraint maintenance_stock_allocation_movements_consume_link_check check (
    movement_type <> 'consume'
    or (maintenance_job_id is not null and maintenance_job_material_id is not null)
  ),
  constraint maintenance_stock_allocation_movements_admin_idempotency_shape_check check (
    (
      movement_type in ('allocate', 'release')
      and client_submission_id is not null
      and payload_hash is not null
    )
    or (
      movement_type = 'consume'
      and client_submission_id is null
      and payload_hash is not null
    )
  )
);

create index if not exists maintenance_stock_allocation_movements_allocation_created_idx
  on public.maintenance_stock_allocation_movements (allocation_id, created_at desc);

create index if not exists maintenance_stock_allocation_movements_stock_created_idx
  on public.maintenance_stock_allocation_movements (stock_item_id, created_at desc);

create index if not exists maintenance_stock_allocation_movements_org_provider_created_idx
  on public.maintenance_stock_allocation_movements (organization_id, provider_id, created_at desc);

create index if not exists maintenance_stock_allocation_movements_job_idx
  on public.maintenance_stock_allocation_movements (maintenance_job_id)
  where maintenance_job_id is not null;

create unique index if not exists maintenance_stock_allocation_movements_consume_material_key
  on public.maintenance_stock_allocation_movements (maintenance_job_material_id)
  where movement_type = 'consume' and maintenance_job_material_id is not null;

create unique index if not exists maintenance_stock_allocation_movements_client_submission_key
  on public.maintenance_stock_allocation_movements (created_by, client_submission_id)
  where client_submission_id is not null;

create table if not exists public.maintenance_stock_allocation_submissions (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_submission_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_id, client_submission_id),
  constraint maintenance_stock_allocation_submissions_operation_check check (
    operation in ('allocate', 'release')
  )
);

alter table public.maintenance_stock_allocations enable row level security;
alter table public.maintenance_stock_allocation_movements enable row level security;
alter table public.maintenance_stock_allocation_submissions enable row level security;

revoke all on public.maintenance_stock_allocations from public, anon, authenticated;
revoke all on public.maintenance_stock_allocation_movements from public, anon, authenticated;
revoke all on public.maintenance_stock_allocation_submissions from public, anon, authenticated;

grant select on public.maintenance_stock_allocations to authenticated;
grant select on public.maintenance_stock_allocation_movements to authenticated;
grant select, insert, update, delete on public.maintenance_stock_allocations to service_role;
grant select, insert, update, delete on public.maintenance_stock_allocation_movements to service_role;
grant select, insert, update, delete on public.maintenance_stock_allocation_submissions to service_role;

drop trigger if exists set_maintenance_stock_allocations_updated_at
  on public.maintenance_stock_allocations;
create trigger set_maintenance_stock_allocations_updated_at
  before update on public.maintenance_stock_allocations
  for each row
  execute function public.set_maintenance_partner_updated_at();

create or replace function public.maintenance_partner_can_read_stock_item(
  p_provider_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.maintenance_partner_has_provider_access(p_provider_id)
    and exists (
      select 1
      from public.maintenance_providers mp
      where mp.id = p_provider_id
        and mp.is_active = true
    )
    and exists (
      select 1
      from public.maintenance_provider_organizations mpo
      where mpo.provider_id = p_provider_id
        and mpo.organization_id = p_organization_id
        and mpo.is_active = true
    );
$$;

drop policy if exists maintenance_stock_items_provider_select_authorized
  on public.maintenance_stock_items;
create policy maintenance_stock_items_provider_select_authorized
  on public.maintenance_stock_items
  for select
  to authenticated
  using (
    is_active = true
    and archived_at is null
    and public.maintenance_partner_has_provider_access(provider_id)
  );

drop policy if exists maintenance_stock_allocations_select_authorized
  on public.maintenance_stock_allocations;
create policy maintenance_stock_allocations_select_authorized
  on public.maintenance_stock_allocations
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_can_read_stock_item(provider_id, organization_id)
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
  );

drop policy if exists maintenance_stock_allocation_movements_select_authorized
  on public.maintenance_stock_allocation_movements;
create policy maintenance_stock_allocation_movements_select_authorized
  on public.maintenance_stock_allocation_movements
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_can_read_stock_item(provider_id, organization_id)
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
  );

create or replace view public.maintenance_stock_allocation_summaries
with (security_invoker = true)
as
select
  item.id as stock_item_id,
  coalesce(sum(allocation.available_quantity) filter (
    where allocation.is_active = true
      and allocation.archived_at is null
  ), 0)::numeric(12,3) as allocated_quantity,
  (
    item.current_quantity
    - coalesce(sum(allocation.available_quantity) filter (
      where allocation.is_active = true
        and allocation.archived_at is null
    ), 0)
  )::numeric(12,3) as unallocated_quantity
from public.maintenance_stock_items item
left join public.maintenance_stock_allocations allocation
  on allocation.stock_item_id = item.id
group by item.id, item.current_quantity;

create or replace view public.maintenance_job_allocated_stock_items
with (security_invoker = true)
as
select
  allocation.stock_item_id,
  allocation.organization_id,
  allocation.provider_id,
  item.item_name,
  item.category,
  item.unit,
  item.sku,
  item.minimum_quantity,
  item.current_quantity as central_current_quantity,
  allocation.available_quantity as allocated_available_quantity,
  item.is_active,
  item.archived_at,
  item.updated_at
from public.maintenance_stock_allocations allocation
join public.maintenance_stock_items item
  on item.id = allocation.stock_item_id
where allocation.is_active = true
  and allocation.archived_at is null
  and item.is_active = true
  and item.archived_at is null;

revoke all on public.maintenance_stock_allocation_summaries from public, anon, authenticated;
grant select on public.maintenance_stock_allocation_summaries to authenticated;
revoke all on public.maintenance_job_allocated_stock_items from public, anon, authenticated;
grant select on public.maintenance_job_allocated_stock_items to authenticated;

create or replace function public.claim_maintenance_stock_allocation_submission(
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
  v_existing public.maintenance_stock_allocation_submissions%rowtype;
begin
  insert into public.maintenance_stock_allocation_submissions (
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
  from public.maintenance_stock_allocation_submissions
  where actor_id = p_actor_id
    and client_submission_id = p_client_submission_id;

  if not found
    or v_existing.operation <> p_operation
    or v_existing.payload_hash <> p_payload_hash
  then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  return v_existing.result;
end;
$$;

create or replace function public.maintenance_stock_allocated_quantity(
  p_stock_item_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(allocation.available_quantity), 0)::numeric(12,3)
  from public.maintenance_stock_allocations allocation
  where allocation.stock_item_id = p_stock_item_id
    and allocation.is_active = true
    and allocation.archived_at is null;
$$;

create or replace function public.validate_maintenance_stock_allocation_target(
  p_provider_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.maintenance_provider_organizations mpo
    join public.maintenance_providers mp
      on mp.id = mpo.provider_id
     and mp.is_active = true
    where mpo.provider_id = p_provider_id
      and mpo.organization_id = p_organization_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_TARGET_NOT_AVAILABLE' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.allocate_maintenance_stock_to_organization(
  p_stock_item_id uuid,
  p_organization_id uuid,
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
  v_item public.maintenance_stock_items%rowtype;
  v_allocation public.maintenance_stock_allocations%rowtype;
  v_allocation_after public.maintenance_stock_allocations%rowtype;
  v_movement public.maintenance_stock_allocation_movements%rowtype;
  v_payload_hash text;
  v_existing_result jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allocated_total numeric(12,3);
  v_unallocated numeric(12,3);
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_STOCK_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or p_stock_item_id is null
    or p_organization_id is null
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'allocate',
    'stock_item_id', p_stock_item_id,
    'organization_id', p_organization_id,
    'quantity', p_quantity,
    'note', v_note
  )::text);

  v_existing_result := public.claim_maintenance_stock_allocation_submission(
    v_actor_id,
    p_client_submission_id,
    'allocate',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select *
    into v_item
  from public.maintenance_stock_items
  where id = p_stock_item_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_stock_admin_actor(v_actor_id, p_organization_id);

  if v_item.archived_at is not null or v_item.is_active = false then
    raise exception 'MAINTENANCE_STOCK_ITEM_ARCHIVED' using errcode = '22023';
  end if;

  perform public.validate_maintenance_stock_allocation_target(v_item.provider_id, p_organization_id);

  v_allocated_total := public.maintenance_stock_allocated_quantity(v_item.id);
  v_unallocated := v_item.current_quantity - v_allocated_total;

  if p_quantity > v_unallocated then
    raise exception 'MAINTENANCE_STOCK_UNALLOCATED_QUANTITY_INSUFFICIENT' using errcode = '23514';
  end if;

  select *
    into v_allocation
  from public.maintenance_stock_allocations
  where stock_item_id = v_item.id
    and organization_id = p_organization_id
    and archived_at is null
  for update;

  if not found then
    insert into public.maintenance_stock_allocations (
      stock_item_id,
      organization_id,
      provider_id,
      available_quantity,
      created_at,
      created_by,
      updated_at,
      updated_by
    )
    values (
      v_item.id,
      p_organization_id,
      v_item.provider_id,
      0,
      v_now,
      v_actor_id,
      v_now,
      v_actor_id
    )
    on conflict (stock_item_id, organization_id) where archived_at is null do update
      set updated_at = public.maintenance_stock_allocations.updated_at
    returning * into v_allocation;

    if v_allocation.provider_id <> v_item.provider_id
      or v_allocation.is_active = false
      or v_allocation.archived_at is not null
    then
      raise exception 'MAINTENANCE_STOCK_ALLOCATION_INVALID_STATE' using errcode = '22023';
    end if;

    select *
      into v_allocation
    from public.maintenance_stock_allocations
    where id = v_allocation.id
    for update;
  end if;

  update public.maintenance_stock_allocations
  set
    available_quantity = available_quantity + p_quantity,
    updated_at = v_now,
    updated_by = v_actor_id
  where id = v_allocation.id
  returning * into v_allocation_after;

  insert into public.maintenance_stock_allocation_movements (
    allocation_id,
    stock_item_id,
    organization_id,
    provider_id,
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
    v_allocation.id,
    v_item.id,
    p_organization_id,
    v_item.provider_id,
    'allocate',
    p_quantity,
    p_quantity,
    v_allocation.available_quantity,
    v_allocation_after.available_quantity,
    v_note,
    p_client_submission_id,
    v_payload_hash,
    v_now,
    v_actor_id
  )
  returning * into v_movement;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    p_organization_id,
    'maintenance_stock_allocated',
    'maintenance_stock_allocation',
    v_allocation_after.id,
    to_jsonb(v_allocation),
    to_jsonb(v_allocation_after),
    jsonb_build_object(
      'stock_item_id', v_item.id,
      'provider_id', v_item.provider_id,
      'quantity_delta', p_quantity,
      'movement_id', v_movement.id
    )
  );

  v_existing_result := jsonb_build_object(
    'id', v_allocation_after.id,
    'stock_item_id', v_item.id,
    'organization_id', p_organization_id,
    'status', 'allocated',
    'available_quantity', v_allocation_after.available_quantity
  );

  update public.maintenance_stock_allocation_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
end;
$$;

create or replace function public.release_maintenance_stock_from_organization(
  p_stock_item_id uuid,
  p_organization_id uuid,
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
  v_item public.maintenance_stock_items%rowtype;
  v_allocation public.maintenance_stock_allocations%rowtype;
  v_allocation_after public.maintenance_stock_allocations%rowtype;
  v_movement public.maintenance_stock_allocation_movements%rowtype;
  v_payload_hash text;
  v_existing_result jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_STOCK_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or p_stock_item_id is null
    or p_organization_id is null
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'operation', 'release',
    'stock_item_id', p_stock_item_id,
    'organization_id', p_organization_id,
    'quantity', p_quantity,
    'note', v_note
  )::text);

  v_existing_result := public.claim_maintenance_stock_allocation_submission(
    v_actor_id,
    p_client_submission_id,
    'release',
    v_payload_hash
  );

  if v_existing_result is not null then
    return v_existing_result;
  end if;

  select *
    into v_item
  from public.maintenance_stock_items
  where id = p_stock_item_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_stock_admin_actor(v_actor_id, p_organization_id);

  select *
    into v_allocation
  from public.maintenance_stock_allocations
  where stock_item_id = v_item.id
    and organization_id = p_organization_id
    and provider_id = v_item.provider_id
    and is_active = true
    and archived_at is null
  for update;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_allocation.available_quantity < p_quantity then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_QUANTITY_INSUFFICIENT' using errcode = '23514';
  end if;

  update public.maintenance_stock_allocations
  set
    available_quantity = available_quantity - p_quantity,
    updated_at = v_now,
    updated_by = v_actor_id
  where id = v_allocation.id
  returning * into v_allocation_after;

  insert into public.maintenance_stock_allocation_movements (
    allocation_id,
    stock_item_id,
    organization_id,
    provider_id,
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
    v_allocation.id,
    v_item.id,
    p_organization_id,
    v_item.provider_id,
    'release',
    p_quantity,
    -p_quantity,
    v_allocation.available_quantity,
    v_allocation_after.available_quantity,
    v_note,
    p_client_submission_id,
    v_payload_hash,
    v_now,
    v_actor_id
  )
  returning * into v_movement;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    p_organization_id,
    'maintenance_stock_allocation_released',
    'maintenance_stock_allocation',
    v_allocation_after.id,
    to_jsonb(v_allocation),
    to_jsonb(v_allocation_after),
    jsonb_build_object(
      'stock_item_id', v_item.id,
      'provider_id', v_item.provider_id,
      'quantity_delta', -p_quantity,
      'movement_id', v_movement.id
    )
  );

  v_existing_result := jsonb_build_object(
    'id', v_allocation_after.id,
    'stock_item_id', v_item.id,
    'organization_id', p_organization_id,
    'status', 'released',
    'available_quantity', v_allocation_after.available_quantity
  );

  update public.maintenance_stock_allocation_submissions
  set result = v_existing_result
  where actor_id = v_actor_id
    and client_submission_id = p_client_submission_id;

  return v_existing_result;
end;
$$;

create or replace function public.create_maintenance_stock_movement(
  p_stock_item_id uuid,
  p_movement_type text,
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
  v_item public.maintenance_stock_items%rowtype;
  v_item_after public.maintenance_stock_items%rowtype;
  v_movement public.maintenance_stock_movements%rowtype;
  v_existing public.maintenance_stock_movements%rowtype;
  v_movement_type text := btrim(coalesce(p_movement_type, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_quantity_delta numeric(12,3);
  v_quantity_before numeric(12,3);
  v_quantity_after numeric(12,3);
  v_allocated_total numeric(12,3);
  v_payload_hash text;
  v_audit_action text;
begin
  if v_actor_id is null then
    raise exception 'MAINTENANCE_STOCK_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_client_submission_id is null
    or v_movement_type not in ('opening_balance', 'stock_in', 'adjustment_in', 'adjustment_out')
    or p_quantity is null
    or p_quantity <= 0
    or p_quantity > 999999999.999
    or p_quantity <> round(p_quantity, 3)
  then
    raise exception 'MAINTENANCE_STOCK_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  v_payload_hash := md5(
    jsonb_build_object(
      'stock_item_id', p_stock_item_id,
      'movement_type', v_movement_type,
      'quantity', p_quantity,
      'note', v_note
    )::text
  );

  select *
    into v_existing
  from public.maintenance_stock_movements
  where created_by = v_actor_id
    and client_submission_id = p_client_submission_id;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'MAINTENANCE_STOCK_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'id', v_existing.id,
      'stock_item_id', v_existing.stock_item_id,
      'status', 'unchanged',
      'quantity_after', v_existing.quantity_after
    );
  end if;

  select *
    into v_item
  from public.maintenance_stock_items
  where id = p_stock_item_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_stock_admin_actor(v_actor_id, v_item.organization_id);

  if v_item.archived_at is not null or v_item.is_active = false then
    raise exception 'MAINTENANCE_STOCK_ITEM_ARCHIVED' using errcode = '22023';
  end if;

  if v_movement_type = 'opening_balance' and (
    v_item.current_quantity <> 0
    or exists (
      select 1
      from public.maintenance_stock_movements movement
      where movement.stock_item_id = v_item.id
    )
  ) then
    raise exception 'MAINTENANCE_STOCK_OPENING_BALANCE_LOCKED' using errcode = '22023';
  end if;

  v_quantity_delta := case
    when v_movement_type in ('opening_balance', 'stock_in', 'adjustment_in') then p_quantity
    else -p_quantity
  end;
  v_quantity_before := v_item.current_quantity;
  v_quantity_after := v_quantity_before + v_quantity_delta;

  if v_quantity_after < 0 then
    raise exception 'MAINTENANCE_STOCK_INSUFFICIENT_QUANTITY' using errcode = '23514';
  end if;

  v_allocated_total := public.maintenance_stock_allocated_quantity(v_item.id);

  if v_quantity_after < v_allocated_total then
    raise exception 'MAINTENANCE_STOCK_BELOW_ALLOCATED_QUANTITY' using errcode = '23514';
  end if;

  insert into public.maintenance_stock_movements (
    stock_item_id,
    organization_id,
    provider_id,
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
    v_item.id,
    v_item.organization_id,
    v_item.provider_id,
    v_movement_type,
    p_quantity,
    v_quantity_delta,
    v_quantity_before,
    v_quantity_after,
    v_note,
    p_client_submission_id,
    v_payload_hash,
    v_now,
    v_actor_id
  )
  on conflict (created_by, client_submission_id) do nothing
  returning * into v_movement;

  if not found then
    select *
      into v_existing
    from public.maintenance_stock_movements
    where created_by = v_actor_id
      and client_submission_id = p_client_submission_id;

    if found and v_existing.payload_hash = v_payload_hash then
      return jsonb_build_object(
        'id', v_existing.id,
        'stock_item_id', v_existing.stock_item_id,
        'status', 'unchanged',
        'quantity_after', v_existing.quantity_after
      );
    end if;

    raise exception 'MAINTENANCE_STOCK_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  update public.maintenance_stock_items
  set
    current_quantity = v_quantity_after,
    updated_at = v_now,
    updated_by = v_actor_id
  where id = v_item.id
  returning * into v_item_after;

  v_audit_action := case
    when v_movement_type in ('opening_balance', 'stock_in') then 'maintenance_stock_added'
    else 'maintenance_stock_adjusted'
  end;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_item.organization_id,
    v_audit_action,
    'maintenance_stock_movement',
    v_movement.id,
    to_jsonb(v_item),
    to_jsonb(v_item_after),
    jsonb_build_object(
      'stock_item_id', v_item.id,
      'provider_id', v_item.provider_id,
      'movement_type', v_movement.movement_type,
      'quantity_delta', v_movement.quantity_delta,
      'allocated_quantity', v_allocated_total
    )
  );

  return jsonb_build_object(
    'id', v_movement.id,
    'stock_item_id', v_item.id,
    'status', 'created',
    'quantity_after', v_item_after.current_quantity
  );
end;
$$;

create or replace function public.archive_maintenance_stock_item(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_old_item public.maintenance_stock_items%rowtype;
  v_item public.maintenance_stock_items%rowtype;
begin
  select *
    into v_old_item
  from public.maintenance_stock_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.validate_maintenance_stock_admin_actor(v_actor_id, v_old_item.organization_id);

  if v_old_item.archived_at is not null or v_old_item.is_active = false then
    return jsonb_build_object('id', v_old_item.id, 'status', 'unchanged');
  end if;

  if v_old_item.current_quantity <> 0 then
    raise exception 'MAINTENANCE_STOCK_ARCHIVE_NON_ZERO' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.maintenance_stock_allocations allocation
    where allocation.stock_item_id = v_old_item.id
      and allocation.is_active = true
      and allocation.archived_at is null
      and allocation.available_quantity > 0
  ) then
    raise exception 'MAINTENANCE_STOCK_ARCHIVE_NON_ZERO_ALLOCATION' using errcode = '23514';
  end if;

  update public.maintenance_stock_items
  set
    is_active = false,
    archived_at = v_now,
    archived_by = v_actor_id,
    updated_at = v_now,
    updated_by = v_actor_id
  where id = v_old_item.id
  returning * into v_item;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_item.organization_id,
    'maintenance_stock_archived',
    'maintenance_stock_item',
    v_item.id,
    to_jsonb(v_old_item),
    to_jsonb(v_item),
    jsonb_build_object('provider_id', v_item.provider_id)
  );

  return jsonb_build_object('id', v_item.id, 'status', 'archived');
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
  v_job public.maintenance_jobs%rowtype;
  v_stock_item public.maintenance_stock_items%rowtype;
  v_allocation public.maintenance_stock_allocations%rowtype;
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
    or v_stock_item.provider_id <> v_job.provider_id
    or v_stock_item.is_active = false
    or v_stock_item.archived_at is not null
  then
    raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_allocation
  from public.maintenance_stock_allocations
  where stock_item_id = v_stock_item.id
    and organization_id = v_job.organization_id
    and provider_id = v_job.provider_id
    and is_active = true
    and archived_at is null;

  if not found then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_allocation.available_quantity < p_quantity then
    raise exception 'MAINTENANCE_STOCK_ALLOCATION_QUANTITY_INSUFFICIENT' using errcode = '23514';
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
  v_allocation public.maintenance_stock_allocations%rowtype;
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
      or v_stock_item.provider_id <> v_job.provider_id
      or v_stock_item.is_active = false
      or v_stock_item.archived_at is not null
    then
      raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;

    select *
      into v_allocation
    from public.maintenance_stock_allocations
    where stock_item_id = v_stock_item.id
      and organization_id = v_job.organization_id
      and provider_id = v_job.provider_id
      and is_active = true
      and archived_at is null;

    if not found then
      raise exception 'MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_allocation.available_quantity < p_quantity then
      raise exception 'MAINTENANCE_STOCK_ALLOCATION_QUANTITY_INSUFFICIENT' using errcode = '23514';
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
  v_allocation public.maintenance_stock_allocations%rowtype;
  v_allocation_after public.maintenance_stock_allocations%rowtype;
  v_stock_item_id uuid;
  v_item_after public.maintenance_stock_items%rowtype;
  v_movement public.maintenance_stock_movements%rowtype;
  v_allocation_movement public.maintenance_stock_allocation_movements%rowtype;
  v_existing_movement public.maintenance_stock_movements%rowtype;
  v_existing_allocation_movement public.maintenance_stock_allocation_movements%rowtype;
  v_submission public.maintenance_job_completion_submissions%rowtype;
  v_completion_notes text := nullif(btrim(coalesce(p_completion_notes, '')), '');
  v_payload_hash text;
  v_movement_payload_hash text;
  v_quantity_after numeric(12,3);
  v_allocation_quantity_after numeric(12,3);
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
      or v_stock_item.provider_id <> v_job.provider_id
      or v_stock_item.is_active = false
      or v_stock_item.archived_at is not null
    then
      raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
    end if;

    select *
      into v_allocation
    from public.maintenance_stock_allocations
    where stock_item_id = v_stock_item.id
      and organization_id = v_job.organization_id
      and provider_id = v_job.provider_id
      and is_active = true
      and archived_at is null
    for update;

    if not found then
      raise exception 'MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
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
        or v_stock_item.provider_id <> v_job.provider_id
        or v_stock_item.is_active = false
        or v_stock_item.archived_at is not null
      then
        raise exception 'MAINTENANCE_STOCK_ITEM_NOT_FOUND' using errcode = 'P0002';
      end if;

      select *
        into v_allocation
      from public.maintenance_stock_allocations
      where stock_item_id = v_stock_item.id
        and organization_id = v_job.organization_id
        and provider_id = v_job.provider_id
        and is_active = true
        and archived_at is null
      for update;

      if not found then
        raise exception 'MAINTENANCE_STOCK_ALLOCATION_NOT_FOUND' using errcode = 'P0002';
      end if;

      if v_stock_item.current_quantity < v_material.issued_quantity then
        raise exception 'MAINTENANCE_STOCK_INSUFFICIENT_QUANTITY' using errcode = '23514';
      end if;

      if v_allocation.available_quantity < v_material.issued_quantity then
        raise exception 'MAINTENANCE_STOCK_ALLOCATION_QUANTITY_INSUFFICIENT' using errcode = '23514';
      end if;

      v_quantity_after := v_stock_item.current_quantity - v_material.issued_quantity;
      v_allocation_quantity_after := v_allocation.available_quantity - v_material.issued_quantity;
      v_movement_payload_hash := md5(jsonb_build_object(
        'operation', 'maintenance_job_material_consume',
        'maintenance_job_id', v_job.id,
        'material_id', v_material.id,
        'stock_item_id', v_stock_item.id,
        'allocation_id', v_allocation.id,
        'organization_id', v_job.organization_id,
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

        update public.maintenance_stock_allocations
        set
          available_quantity = v_allocation_quantity_after,
          updated_at = v_now,
          updated_by = v_actor_id
        where id = v_allocation.id
        returning * into v_allocation_after;

        insert into public.maintenance_stock_allocation_movements (
          allocation_id,
          stock_item_id,
          organization_id,
          provider_id,
          movement_type,
          quantity,
          quantity_delta,
          quantity_before,
          quantity_after,
          note,
          maintenance_job_id,
          maintenance_job_material_id,
          payload_hash,
          created_at,
          created_by
        )
        values (
          v_allocation.id,
          v_stock_item.id,
          v_job.organization_id,
          v_job.provider_id,
          'consume',
          v_material.issued_quantity,
          -v_material.issued_quantity,
          v_allocation.available_quantity,
          v_allocation_after.available_quantity,
          coalesce(v_material.note, 'Maintenance job material allocation consumption'),
          v_job.id,
          v_material.id,
          v_movement_payload_hash,
          v_now,
          v_actor_id
        )
        returning * into v_allocation_movement;

        perform public.insert_maintenance_activity_log(
          v_actor_id,
          v_job.organization_id,
          'maintenance_stock_allocation_consumed',
          'maintenance_stock_allocation_movement',
          v_allocation_movement.id,
          to_jsonb(v_allocation),
          to_jsonb(v_allocation_after),
          jsonb_build_object(
            'maintenance_job_id', v_job.id,
            'maintenance_job_material_id', v_material.id,
            'stock_item_id', v_stock_item.id,
            'provider_id', v_stock_item.provider_id,
            'quantity_delta', -v_material.issued_quantity
          )
        );

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
            'allocation_id', v_allocation.id,
            'allocation_movement_id', v_allocation_movement.id,
            'organization_id', v_job.organization_id,
            'quantity_delta', v_movement.quantity_delta
          )
        );
      end if;

      select *
        into v_existing_allocation_movement
      from public.maintenance_stock_allocation_movements
      where maintenance_job_material_id = v_material.id
        and movement_type = 'consume'
      limit 1;

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
        and tablename = 'maintenance_stock_allocations'
    ) then
      alter publication supabase_realtime add table public.maintenance_stock_allocations;
    end if;
  end if;
end;
$$;

revoke all on function public.maintenance_partner_can_read_stock_item(uuid, uuid)
  from public, anon;
revoke all on function public.claim_maintenance_stock_allocation_submission(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.maintenance_stock_allocated_quantity(uuid)
  from public, anon, authenticated;
revoke all on function public.validate_maintenance_stock_allocation_target(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.allocate_maintenance_stock_to_organization(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.release_maintenance_stock_from_organization(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_stock_movement(uuid, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.archive_maintenance_stock_item(uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_job_company_stock_material_draft(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.update_maintenance_job_material_draft(uuid, text, text, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_maintenance_job(uuid, text, integer, uuid)
  from public, anon, authenticated;

grant execute on function public.maintenance_partner_can_read_stock_item(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.claim_maintenance_stock_allocation_submission(uuid, uuid, text, text)
  to service_role;
grant execute on function public.maintenance_stock_allocated_quantity(uuid)
  to service_role;
grant execute on function public.validate_maintenance_stock_allocation_target(uuid, uuid)
  to service_role;
grant execute on function public.allocate_maintenance_stock_to_organization(uuid, uuid, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.release_maintenance_stock_from_organization(uuid, uuid, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.create_maintenance_stock_movement(uuid, text, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.archive_maintenance_stock_item(uuid)
  to authenticated, service_role;
grant execute on function public.create_maintenance_job_company_stock_material_draft(uuid, uuid, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.update_maintenance_job_material_draft(uuid, text, text, text, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.complete_maintenance_job(uuid, text, integer, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
