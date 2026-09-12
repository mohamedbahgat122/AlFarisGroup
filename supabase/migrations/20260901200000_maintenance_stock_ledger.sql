create table if not exists public.maintenance_stock_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  item_name text not null,
  category text not null,
  unit text not null,
  sku text null,
  minimum_quantity numeric(12,3) null,
  current_quantity numeric(12,3) not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint maintenance_stock_items_name_not_blank check (
    length(btrim(item_name)) between 1 and 160
  ),
  constraint maintenance_stock_items_category_check check (
    category in ('oil', 'spare_part', 'material')
  ),
  constraint maintenance_stock_items_unit_check check (
    unit in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
  ),
  constraint maintenance_stock_items_sku_not_blank check (
    sku is null or length(btrim(sku)) between 1 and 80
  ),
  constraint maintenance_stock_items_minimum_quantity_check check (
    minimum_quantity is null or minimum_quantity >= 0
  ),
  constraint maintenance_stock_items_current_quantity_check check (
    current_quantity >= 0
  ),
  constraint maintenance_stock_items_archive_shape_check check (
    (archived_at is null and archived_by is null and is_active = true)
    or (archived_at is not null and archived_by is not null and is_active = false)
  )
);

create table if not exists public.maintenance_stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.maintenance_stock_items(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.maintenance_providers(id) on delete restrict,
  maintenance_job_id uuid null references public.maintenance_jobs(id) on delete restrict,
  movement_type text not null,
  quantity numeric(12,3) not null,
  quantity_delta numeric(12,3) not null,
  quantity_before numeric(12,3) not null,
  quantity_after numeric(12,3) not null,
  note text null,
  client_submission_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint maintenance_stock_movements_type_check check (
    movement_type in (
      'opening_balance',
      'stock_in',
      'consume',
      'return',
      'adjustment_in',
      'adjustment_out'
    )
  ),
  constraint maintenance_stock_movements_quantity_check check (
    quantity > 0
  ),
  constraint maintenance_stock_movements_quantity_delta_check check (
    (
      movement_type in ('opening_balance', 'stock_in', 'return', 'adjustment_in')
      and quantity_delta = quantity
    )
    or (
      movement_type in ('consume', 'adjustment_out')
      and quantity_delta = -quantity
    )
  ),
  constraint maintenance_stock_movements_balance_check check (
    quantity_before >= 0
    and quantity_after >= 0
    and quantity_after = quantity_before + quantity_delta
  ),
  constraint maintenance_stock_movements_consume_job_check check (
    movement_type <> 'consume' or maintenance_job_id is not null
  )
);

create unique index if not exists maintenance_stock_items_active_name_unit_key
  on public.maintenance_stock_items (
    organization_id,
    provider_id,
    lower(btrim(item_name)),
    unit
  )
  where archived_at is null;

create unique index if not exists maintenance_stock_items_active_sku_key
  on public.maintenance_stock_items (
    organization_id,
    provider_id,
    lower(btrim(sku))
  )
  where archived_at is null and sku is not null;

create index if not exists maintenance_stock_items_org_provider_active_idx
  on public.maintenance_stock_items (organization_id, provider_id, is_active);

create index if not exists maintenance_stock_items_category_idx
  on public.maintenance_stock_items (category);

create index if not exists maintenance_stock_items_current_quantity_idx
  on public.maintenance_stock_items (organization_id, current_quantity);

create index if not exists maintenance_stock_movements_item_created_idx
  on public.maintenance_stock_movements (stock_item_id, created_at desc);

create index if not exists maintenance_stock_movements_org_provider_created_idx
  on public.maintenance_stock_movements (organization_id, provider_id, created_at desc);

create index if not exists maintenance_stock_movements_job_idx
  on public.maintenance_stock_movements (maintenance_job_id)
  where maintenance_job_id is not null;

create unique index if not exists maintenance_stock_movements_client_submission_key
  on public.maintenance_stock_movements (created_by, client_submission_id);

drop trigger if exists set_maintenance_stock_items_updated_at
  on public.maintenance_stock_items;
create trigger set_maintenance_stock_items_updated_at
  before update on public.maintenance_stock_items
  for each row
  execute function public.set_maintenance_partner_updated_at();

alter table public.maintenance_stock_items enable row level security;
alter table public.maintenance_stock_movements enable row level security;

revoke all on public.maintenance_stock_items from public, anon, authenticated;
revoke all on public.maintenance_stock_movements from public, anon, authenticated;
grant select on public.maintenance_stock_items to authenticated;
grant select on public.maintenance_stock_movements to authenticated;
grant select, insert, update, delete on public.maintenance_stock_items to service_role;
grant select, insert, update, delete on public.maintenance_stock_movements to service_role;

drop policy if exists maintenance_stock_items_select_authorized
  on public.maintenance_stock_items;
create policy maintenance_stock_items_select_authorized
  on public.maintenance_stock_items
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
  );

drop policy if exists maintenance_stock_movements_select_authorized
  on public.maintenance_stock_movements;
create policy maintenance_stock_movements_select_authorized
  on public.maintenance_stock_movements
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_materials.manage')
  );

create or replace view public.maintenance_stock_item_summaries
with (security_invoker = true)
as
select
  item.id as stock_item_id,
  coalesce(
    sum(movement.quantity) filter (
      where movement.movement_type in ('opening_balance', 'stock_in', 'adjustment_in')
    ),
    0
  )::numeric(12,3) as total_added,
  coalesce(
    sum(movement.quantity) filter (
      where movement.movement_type = 'consume'
    ),
    0
  )::numeric(12,3) as total_consumed,
  coalesce(
    sum(movement.quantity) filter (
      where movement.movement_type = 'return'
    ),
    0
  )::numeric(12,3) as total_returned,
  coalesce(
    sum(movement.quantity) filter (
      where movement.movement_type = 'adjustment_out'
    ),
    0
  )::numeric(12,3) as total_adjusted_out,
  max(movement.created_at) as last_movement_at,
  count(movement.id)::integer as movement_count
from public.maintenance_stock_items item
left join public.maintenance_stock_movements movement
  on movement.stock_item_id = item.id
group by item.id;

create or replace view public.maintenance_stock_items_overview
with (security_invoker = true)
as
select
  id,
  organization_id,
  provider_id,
  item_name,
  category,
  unit,
  sku,
  minimum_quantity,
  current_quantity,
  is_active,
  archived_at,
  created_at,
  updated_at,
  (
    archived_at is null
    and is_active = true
    and current_quantity = 0
  ) as is_out_of_stock,
  (
    archived_at is null
    and is_active = true
    and minimum_quantity is not null
    and current_quantity > 0
    and current_quantity <= minimum_quantity
  ) as is_low_stock
from public.maintenance_stock_items;

revoke all on public.maintenance_stock_item_summaries from public, anon, authenticated;
grant select on public.maintenance_stock_item_summaries to authenticated;
revoke all on public.maintenance_stock_items_overview from public, anon, authenticated;
grant select on public.maintenance_stock_items_overview to authenticated;

create or replace function public.validate_maintenance_stock_admin_actor(
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
    raise exception 'MAINTENANCE_STOCK_AUTH_REQUIRED' using errcode = '42501';
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
    raise exception 'MAINTENANCE_STOCK_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_organization_permission(
    p_actor_id,
    p_organization_id,
    'maintenance_materials.manage'
  ) then
    raise exception 'MAINTENANCE_STOCK_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.validate_maintenance_stock_provider_org(
  p_organization_id uuid,
  p_provider_id uuid
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
    where mpo.organization_id = p_organization_id
      and mpo.provider_id = p_provider_id
      and mpo.is_active = true
  ) then
    raise exception 'MAINTENANCE_STOCK_PROVIDER_NOT_AVAILABLE' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_maintenance_stock_item(
  p_organization_id uuid,
  p_provider_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_sku text default null,
  p_minimum_quantity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_item public.maintenance_stock_items%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
begin
  if v_item_name is null
    or length(v_item_name) > 160
    or v_category not in ('oil', 'spare_part', 'material')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or (v_sku is not null and length(v_sku) > 80)
    or (p_minimum_quantity is not null and (p_minimum_quantity < 0 or p_minimum_quantity <> round(p_minimum_quantity, 3)))
  then
    raise exception 'MAINTENANCE_STOCK_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  perform public.validate_maintenance_stock_admin_actor(v_actor_id, p_organization_id);
  perform public.validate_maintenance_stock_provider_org(p_organization_id, p_provider_id);

  insert into public.maintenance_stock_items (
    organization_id,
    provider_id,
    item_name,
    category,
    unit,
    sku,
    minimum_quantity,
    current_quantity,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    p_provider_id,
    v_item_name,
    v_category,
    v_unit,
    v_sku,
    p_minimum_quantity,
    0,
    v_actor_id,
    v_actor_id
  )
  returning * into v_item;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_item.organization_id,
    'maintenance_stock_item_created',
    'maintenance_stock_item',
    v_item.id,
    null,
    to_jsonb(v_item),
    jsonb_build_object('provider_id', v_item.provider_id)
  );

  return jsonb_build_object('id', v_item.id, 'status', 'created');
exception
  when unique_violation then
    raise exception 'MAINTENANCE_STOCK_ITEM_DUPLICATE' using errcode = '23505';
end;
$$;

create or replace function public.update_maintenance_stock_item(
  p_item_id uuid,
  p_item_name text,
  p_category text,
  p_unit text,
  p_sku text default null,
  p_minimum_quantity numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_old_item public.maintenance_stock_items%rowtype;
  v_item public.maintenance_stock_items%rowtype;
  v_item_name text := nullif(btrim(coalesce(p_item_name, '')), '');
  v_category text := btrim(coalesce(p_category, ''));
  v_unit text := btrim(coalesce(p_unit, ''));
  v_sku text := nullif(btrim(coalesce(p_sku, '')), '');
begin
  if v_item_name is null
    or length(v_item_name) > 160
    or v_category not in ('oil', 'spare_part', 'material')
    or v_unit not in ('liter', 'piece', 'set', 'kg', 'meter', 'other')
    or (v_sku is not null and length(v_sku) > 80)
    or (p_minimum_quantity is not null and (p_minimum_quantity < 0 or p_minimum_quantity <> round(p_minimum_quantity, 3)))
  then
    raise exception 'MAINTENANCE_STOCK_INVALID_PAYLOAD' using errcode = '22023';
  end if;

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
    raise exception 'MAINTENANCE_STOCK_ITEM_ARCHIVED' using errcode = '22023';
  end if;

  if v_old_item.unit <> v_unit
    and exists (
      select 1
      from public.maintenance_stock_movements movement
      where movement.stock_item_id = v_old_item.id
    )
  then
    raise exception 'MAINTENANCE_STOCK_UNIT_LOCKED' using errcode = '22023';
  end if;

  update public.maintenance_stock_items
  set
    item_name = v_item_name,
    category = v_category,
    unit = v_unit,
    sku = v_sku,
    minimum_quantity = p_minimum_quantity,
    updated_by = v_actor_id
  where id = v_old_item.id
  returning * into v_item;

  perform public.insert_maintenance_activity_log(
    v_actor_id,
    v_item.organization_id,
    'maintenance_stock_item_updated',
    'maintenance_stock_item',
    v_item.id,
    to_jsonb(v_old_item),
    to_jsonb(v_item),
    jsonb_build_object('provider_id', v_item.provider_id)
  );

  return jsonb_build_object('id', v_item.id, 'status', 'updated');
exception
  when unique_violation then
    raise exception 'MAINTENANCE_STOCK_ITEM_DUPLICATE' using errcode = '23505';
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
  v_existing public.maintenance_stock_movements%rowtype;
  v_movement public.maintenance_stock_movements%rowtype;
  v_movement_type text := btrim(coalesce(p_movement_type, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payload_hash text;
  v_quantity_delta numeric(12,3);
  v_quantity_before numeric(12,3);
  v_quantity_after numeric(12,3);
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
      'quantity_delta', v_movement.quantity_delta
    )
  );

  return jsonb_build_object(
    'id', v_movement.id,
    'stock_item_id', v_item.id,
    'status', 'created',
    'quantity_after', v_quantity_after
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'maintenance_stock_items'
    ) then
      alter publication supabase_realtime add table public.maintenance_stock_items;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'maintenance_stock_movements'
    ) then
      alter publication supabase_realtime add table public.maintenance_stock_movements;
    end if;
  end if;
end;
$$;

revoke all on function public.validate_maintenance_stock_admin_actor(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.validate_maintenance_stock_provider_org(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_stock_item(uuid, uuid, text, text, text, text, numeric)
  from public, anon, authenticated;
revoke all on function public.update_maintenance_stock_item(uuid, text, text, text, text, numeric)
  from public, anon, authenticated;
revoke all on function public.create_maintenance_stock_movement(uuid, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.archive_maintenance_stock_item(uuid)
  from public, anon, authenticated;

grant execute on function public.validate_maintenance_stock_admin_actor(uuid, uuid)
  to service_role;
grant execute on function public.validate_maintenance_stock_provider_org(uuid, uuid)
  to service_role;
grant execute on function public.create_maintenance_stock_item(uuid, uuid, text, text, text, text, numeric)
  to authenticated, service_role;
grant execute on function public.update_maintenance_stock_item(uuid, text, text, text, text, numeric)
  to authenticated, service_role;
grant execute on function public.create_maintenance_stock_movement(uuid, text, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.archive_maintenance_stock_item(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
