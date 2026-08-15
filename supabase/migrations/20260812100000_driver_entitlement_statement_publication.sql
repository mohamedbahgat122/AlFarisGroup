-- Published driver entitlement statement snapshots.
-- Publication is not payment. It freezes the selected period statement for later Driver App consumption.

create or replace function public.organization_permission_keys()
returns text[]
language sql
immutable
security definer
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
    'shifts.archive'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key = any(public.organization_permission_keys())
  );

create table if not exists public.driver_entitlement_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  salary_total numeric(12,2) not null default 0,
  bonus_total numeric(12,2) not null default 0,
  admin_deduction_total numeric(12,2) not null default 0,
  keeta_deduction_total numeric(12,2) not null default 0,
  violation_total numeric(12,2) not null default 0,
  absence_total numeric(12,2) not null default 0,
  deduction_total numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  transaction_count integer not null default 0,
  published_at timestamptz not null default timezone('utc', now()),
  published_by uuid not null references public.profiles(id) on delete restrict,
  version integer not null default 1,
  status text not null default 'published',
  source_revision text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint driver_entitlement_statements_period_check check (period_end >= period_start),
  constraint driver_entitlement_statements_status_check check (status in ('published', 'superseded')),
  constraint driver_entitlement_statements_totals_check check (
    salary_total >= 0
    and bonus_total >= 0
    and admin_deduction_total >= 0
    and keeta_deduction_total >= 0
    and violation_total >= 0
    and absence_total >= 0
    and deduction_total >= 0
    and transaction_count >= 0
  )
);

create table if not exists public.driver_entitlement_statement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.driver_entitlement_statements(id) on delete restrict,
  source_transaction_id uuid not null references public.driver_entitlement_transactions(id) on delete restrict,
  transaction_type text not null,
  amount numeric(12,2) not null,
  financial_effect numeric(12,2) not null,
  reason text null,
  notes text null,
  order_count integer null,
  effective_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint driver_entitlement_statement_items_type_check check (
    transaction_type in ('salary', 'bonus', 'admin_deduction', 'keeta_deduction', 'violation', 'absence')
  ),
  constraint driver_entitlement_statement_items_amount_check check (amount > 0),
  constraint driver_entitlement_statement_items_order_count_check check (
    order_count is null or order_count >= 0
  )
);

create unique index if not exists driver_entitlement_statements_current_idx
  on public.driver_entitlement_statements (organization_id, driver_id, period_start, period_end)
  where status = 'published';

create unique index if not exists driver_entitlement_statements_version_idx
  on public.driver_entitlement_statements (organization_id, driver_id, period_start, period_end, version);

create index if not exists driver_entitlement_statements_driver_period_idx
  on public.driver_entitlement_statements (driver_id, period_start desc, period_end desc);

create index if not exists driver_entitlement_statement_items_statement_idx
  on public.driver_entitlement_statement_items (statement_id, effective_date, source_transaction_id);

alter table public.driver_entitlement_statements enable row level security;
alter table public.driver_entitlement_statement_items enable row level security;
alter table public.driver_entitlement_statements replica identity full;
alter table public.driver_entitlement_statement_items replica identity full;

revoke all on public.driver_entitlement_statements from public, anon;
revoke all on public.driver_entitlement_statement_items from public, anon;
grant select on public.driver_entitlement_statements to authenticated;
grant select on public.driver_entitlement_statement_items to authenticated;
grant select, insert, update on public.driver_entitlement_statements to service_role;
grant select, insert on public.driver_entitlement_statement_items to service_role;

drop policy if exists driver_entitlement_statements_select_scoped on public.driver_entitlement_statements;
create policy driver_entitlement_statements_select_scoped
  on public.driver_entitlement_statements
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.view')
  );

drop policy if exists driver_entitlement_statement_items_select_scoped on public.driver_entitlement_statement_items;
create policy driver_entitlement_statement_items_select_scoped
  on public.driver_entitlement_statement_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.driver_entitlement_statements s
      where s.id = statement_id
        and (
          public.is_system_owner_user(auth.uid())
          or public.has_organization_permission(auth.uid(), s.organization_id, 'entitlements.view')
        )
    )
  );

create or replace function public.publish_driver_entitlement_statement(
  p_organization_id uuid,
  p_driver_id uuid,
  p_period_start date,
  p_period_end date,
  p_salary_total numeric,
  p_bonus_total numeric,
  p_admin_deduction_total numeric,
  p_keeta_deduction_total numeric,
  p_violation_total numeric,
  p_absence_total numeric,
  p_deduction_total numeric,
  p_net_amount numeric,
  p_transaction_count integer,
  p_source_revision text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.driver_entitlement_statements;
  v_statement_id uuid;
  v_next_version integer;
  v_item jsonb;
begin
  if not (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), p_organization_id, 'entitlements.publish')
  ) then
    raise exception 'Not authorized to publish entitlement statements.';
  end if;

  if p_period_end < p_period_start then
    raise exception 'Invalid entitlement period.';
  end if;

  if p_transaction_count <= 0 or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) <> p_transaction_count then
    raise exception 'Published statement requires matching active line items.';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver does not belong to the organization.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':' || p_driver_id::text || ':' || p_period_start::text || ':' || p_period_end::text)
  );

  select *
  into v_current
  from public.driver_entitlement_statements
  where organization_id = p_organization_id
    and driver_id = p_driver_id
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'published'
  for update;

  if v_current.id is not null and v_current.source_revision = p_source_revision then
    return v_current.id;
  end if;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from public.driver_entitlement_statements
  where organization_id = p_organization_id
    and driver_id = p_driver_id
    and period_start = p_period_start
    and period_end = p_period_end;

  if v_current.id is not null then
    update public.driver_entitlement_statements
    set status = 'superseded'
    where id = v_current.id;
  end if;

  insert into public.driver_entitlement_statements (
    organization_id,
    driver_id,
    period_start,
    period_end,
    salary_total,
    bonus_total,
    admin_deduction_total,
    keeta_deduction_total,
    violation_total,
    absence_total,
    deduction_total,
    net_amount,
    transaction_count,
    published_by,
    version,
    status,
    source_revision
  )
  values (
    p_organization_id,
    p_driver_id,
    p_period_start,
    p_period_end,
    p_salary_total,
    p_bonus_total,
    p_admin_deduction_total,
    p_keeta_deduction_total,
    p_violation_total,
    p_absence_total,
    p_deduction_total,
    p_net_amount,
    p_transaction_count,
    auth.uid(),
    v_next_version,
    'published',
    p_source_revision
  )
  returning id into v_statement_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.driver_entitlement_statement_items (
      statement_id,
      source_transaction_id,
      transaction_type,
      amount,
      financial_effect,
      reason,
      notes,
      order_count,
      effective_date
    )
    values (
      v_statement_id,
      (v_item->>'sourceTransactionId')::uuid,
      v_item->>'transactionType',
      (v_item->>'amount')::numeric,
      (v_item->>'financialEffect')::numeric,
      nullif(v_item->>'reason', ''),
      nullif(v_item->>'notes', ''),
      case when v_item ? 'orderCount' and v_item->>'orderCount' <> '' then (v_item->>'orderCount')::integer else null end,
      (v_item->>'effectiveDate')::date
    );
  end loop;

  return v_statement_id;
end;
$$;

revoke all on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) from public, anon;

grant execute on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_entitlement_statements'
    ) then
      alter publication supabase_realtime add table public.driver_entitlement_statements;
    end if;
  end if;
end $$;

comment on table public.driver_entitlement_statements is
  'Immutable published driver entitlement statement snapshots. Publication is not payment.';

comment on table public.driver_entitlement_statement_items is
  'Immutable published entitlement statement line-item snapshots derived from active ledger transactions.';
