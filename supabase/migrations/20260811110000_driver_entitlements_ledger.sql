-- Driver entitlements append-only financial ledger.
-- The ledger rows are the financial source of truth. Balances are derived by SUM.

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
    'shifts.view',
    'shifts.create',
    'shifts.update',
    'shifts.assign',
    'shifts.archive'
  ]::text[];
$$;

create or replace function public.view_only_organization_permission_keys()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'organization.dashboard.view',
    'drivers.view',
    'driver_reports.view',
    'fleet.cars.view',
    'fleet.motorcycles.view',
    'fuel.reports.view',
    'app_requests.view',
    'odometer.manage',
    'notifications.view',
    'driver_warnings.view',
    'entitlements.view',
    'entitlements.view_transactions',
    'shifts.view'
  ]::text[];
$$;

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
      'driver_warnings.revoke',
      'shifts.view',
      'shifts.create',
      'shifts.update',
      'shifts.assign',
      'shifts.archive',
      'entitlements.view',
      'entitlements.create_transaction',
      'entitlements.view_transactions',
      'entitlements.reverse_transaction'
    )
  );

create table if not exists public.driver_entitlement_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  transaction_type text not null,
  amount numeric(12, 2) not null,
  reason text null,
  notes text null,
  order_count integer null,
  effective_date date not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  reversed_at timestamptz null,
  reversed_by uuid null references public.profiles(id) on delete restrict,
  reversal_reason text null,
  constraint driver_entitlement_transactions_type_check check (
    transaction_type in (
      'salary',
      'bonus',
      'admin_deduction',
      'keeta_deduction',
      'violation',
      'absence'
    )
  ),
  constraint driver_entitlement_transactions_amount_positive check (amount > 0),
  constraint driver_entitlement_transactions_order_count_shape check (
    order_count is null
    or (
      transaction_type = 'salary'
      and order_count >= 0
    )
  ),
  constraint driver_entitlement_transactions_reason_not_blank check (
    reason is null or length(btrim(reason)) > 0
  ),
  constraint driver_entitlement_transactions_reversal_shape check (
    (
      reversed_at is null
      and reversed_by is null
      and reversal_reason is null
    )
    or (
      reversed_at is not null
      and reversed_by is not null
      and length(btrim(coalesce(reversal_reason, ''))) > 0
    )
  )
);

create index if not exists driver_entitlement_transactions_org_period_driver_idx
  on public.driver_entitlement_transactions (organization_id, effective_date desc, driver_id);

create index if not exists driver_entitlement_transactions_driver_period_idx
  on public.driver_entitlement_transactions (driver_id, effective_date desc);

create index if not exists driver_entitlement_transactions_active_idx
  on public.driver_entitlement_transactions (organization_id, effective_date, transaction_type)
  where reversed_at is null;

alter table public.driver_entitlement_transactions enable row level security;
alter table public.driver_entitlement_transactions replica identity full;

revoke all on public.driver_entitlement_transactions from public, anon;
grant select, insert, update on public.driver_entitlement_transactions to authenticated;
grant select, insert, update, delete on public.driver_entitlement_transactions to service_role;

drop policy if exists driver_entitlement_transactions_select_scoped on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_select_scoped
  on public.driver_entitlement_transactions
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.view_transactions')
  );

drop policy if exists driver_entitlement_transactions_insert_scoped on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_insert_scoped
  on public.driver_entitlement_transactions
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_system_owner_user(auth.uid())
      or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.create_transaction')
    )
    and exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and d.organization_id = organization_id
        and d.deleted_at is null
    )
  );

drop policy if exists driver_entitlement_transactions_update_scoped on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_update_scoped
  on public.driver_entitlement_transactions
  for update
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.reverse_transaction')
  )
  with check (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.reverse_transaction')
  );

create or replace function public.prevent_driver_entitlement_transaction_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Driver entitlement transactions are append-only and cannot be deleted.';
end;
$$;

drop trigger if exists prevent_driver_entitlement_transaction_delete on public.driver_entitlement_transactions;
create trigger prevent_driver_entitlement_transaction_delete
  before delete on public.driver_entitlement_transactions
  for each row
  execute function public.prevent_driver_entitlement_transaction_delete();

create or replace function public.protect_driver_entitlement_transaction_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id
    or old.driver_id is distinct from new.driver_id
    or old.transaction_type is distinct from new.transaction_type
    or old.amount is distinct from new.amount
    or old.reason is distinct from new.reason
    or old.notes is distinct from new.notes
    or old.order_count is distinct from new.order_count
    or old.effective_date is distinct from new.effective_date
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Driver entitlement transaction financial fields are immutable.';
  end if;

  if old.reversed_at is not null then
    raise exception 'A reversed entitlement transaction cannot be changed.';
  end if;

  if new.reversed_at is null
    or new.reversed_by is null
    or length(btrim(coalesce(new.reversal_reason, ''))) = 0
  then
    raise exception 'Reversal requires actor, timestamp, and reason.';
  end if;

  if new.reversed_by <> auth.uid() and not public.is_system_owner_user(auth.uid()) then
    raise exception 'Reversal actor must match the authenticated user.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_driver_entitlement_transaction_immutable_fields on public.driver_entitlement_transactions;
create trigger protect_driver_entitlement_transaction_immutable_fields
  before update on public.driver_entitlement_transactions
  for each row
  execute function public.protect_driver_entitlement_transaction_immutable_fields();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_entitlement_transactions'
  ) then
    alter publication supabase_realtime add table public.driver_entitlement_transactions;
  end if;
end $$;

comment on table public.driver_entitlement_transactions is
  'Append-only driver financial entitlement ledger. Derived balances must be calculated from active transaction rows.';
