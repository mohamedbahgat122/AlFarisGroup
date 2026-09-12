create table if not exists public.driver_debts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  original_amount numeric(12, 2) not null,
  debt_date date not null,
  reason text not null,
  notes text null,
  cancelled_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete restrict,
  cancellation_reason text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_debts_original_amount_check check (original_amount > 0),
  constraint driver_debts_reason_check check (btrim(reason) <> ''),
  constraint driver_debts_cancellation_consistency check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or
    (cancelled_at is not null and cancelled_by is not null and cancellation_reason is not null)
  )
);

alter table public.driver_debts enable row level security;

revoke all on public.driver_debts from public, anon;
grant select, insert, update on public.driver_debts to authenticated;
grant select, insert, update on public.driver_debts to service_role;

create index if not exists driver_debts_driver_organization_idx
  on public.driver_debts(driver_id, organization_id);

create index if not exists driver_debts_active_idx
  on public.driver_debts(driver_id, organization_id)
  where cancelled_at is null;

drop policy if exists driver_debts_select_scoped on public.driver_debts;
create policy driver_debts_select_scoped
  on public.driver_debts
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'entitlements.view_transactions')
  );

drop policy if exists driver_debts_insert_restricted_to_rpcs on public.driver_debts;
create policy driver_debts_insert_restricted_to_rpcs
  on public.driver_debts
  for insert
  to authenticated
  with check (false);

drop policy if exists driver_debts_update_restricted_to_rpcs on public.driver_debts;
create policy driver_debts_update_restricted_to_rpcs
  on public.driver_debts
  for update
  to authenticated
  using (false)
  with check (false);

alter table public.driver_entitlement_transactions
  add column if not exists driver_debt_id uuid null references public.driver_debts(id) on delete restrict;

create index if not exists driver_entitlement_transactions_driver_debt_id_idx
  on public.driver_entitlement_transactions(driver_debt_id);

alter table public.driver_entitlement_transactions
  drop constraint if exists driver_entitlement_transactions_type_check;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_type_check check (
    transaction_type in (
      'mudad',
      'salary',
      'bonus',
      'admin_deduction',
      'keeta_deduction',
      'violation',
      'absence',
      'advance',
      'salary_receipt',
      'debt_installment'
    )
  );

alter table public.driver_entitlement_statement_items
  drop constraint if exists driver_entitlement_statement_items_type_check;

alter table public.driver_entitlement_statement_items
  add constraint driver_entitlement_statement_items_type_check check (
    transaction_type in (
      'mudad',
      'salary',
      'bonus',
      'admin_deduction',
      'keeta_deduction',
      'violation',
      'absence',
      'advance',
      'salary_receipt',
      'debt_installment'
    )
  );

alter table public.driver_entitlement_transactions
  drop constraint if exists driver_entitlement_transactions_order_count_shape;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_order_count_shape check (
    order_count is null
    or (
      transaction_type in ('salary', 'mudad')
      and order_count >= 0
    )
  );

alter table public.driver_entitlement_transactions
  drop constraint if exists driver_entitlement_transactions_debt_link_check;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_debt_link_check check (
    (
      transaction_type = 'debt_installment'
      and driver_debt_id is not null
    )
    or
    (
      transaction_type <> 'debt_installment'
      and driver_debt_id is null
    )
  ) not valid;

create or replace function public.validate_driver_debt_installment(
  p_organization_id uuid,
  p_driver_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_driver_debt_id uuid,
  p_excluded_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debt public.driver_debts;
  v_paid_amount numeric(12, 2);
  v_remaining_amount numeric(12, 2);
begin
  if p_transaction_type <> 'debt_installment' then
    if p_driver_debt_id is not null then
      raise exception 'DRIVER_DEBT_LINK_NOT_ALLOWED';
    end if;

    return;
  end if;

  if p_driver_debt_id is null then
    raise exception 'DRIVER_DEBT_REQUIRED';
  end if;

  if p_amount <= 0 then
    raise exception 'INVALID_DEBT_INSTALLMENT_AMOUNT';
  end if;

  select *
  into v_debt
  from public.driver_debts
  where id = p_driver_debt_id
  for update;

  if v_debt.id is null then
    raise exception 'DRIVER_DEBT_NOT_FOUND';
  end if;

  if v_debt.driver_id <> p_driver_id then
    raise exception 'DRIVER_DEBT_DRIVER_MISMATCH';
  end if;

  if v_debt.organization_id <> p_organization_id then
    raise exception 'DRIVER_DEBT_ORGANIZATION_MISMATCH';
  end if;

  if v_debt.cancelled_at is not null then
    raise exception 'DRIVER_DEBT_CANCELLED';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
      and d.deleted_at is null
  ) then
    raise exception 'DRIVER_ORGANIZATION_MISMATCH';
  end if;

  select coalesce(sum(tx.amount), 0)
  into v_paid_amount
  from public.driver_entitlement_transactions tx
  where tx.driver_debt_id = p_driver_debt_id
    and tx.transaction_type = 'debt_installment'
    and tx.reversed_at is null
    and (p_excluded_transaction_id is null or tx.id <> p_excluded_transaction_id);

  v_remaining_amount := v_debt.original_amount - v_paid_amount;

  if v_remaining_amount <= 0 then
    raise exception 'DRIVER_DEBT_ALREADY_PAID';
  end if;

  if p_amount > v_remaining_amount then
    raise exception 'DRIVER_DEBT_INSTALLMENT_EXCEEDS_REMAINING';
  end if;
end;
$$;

revoke all on function public.validate_driver_debt_installment(uuid, uuid, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.validate_driver_debt_installment(uuid, uuid, text, numeric, uuid, uuid) to authenticated, service_role;

create or replace function public.create_driver_debt(
  p_driver_id uuid,
  p_organization_id uuid,
  p_original_amount numeric,
  p_debt_date date,
  p_reason text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_debt_id uuid;
begin
  if not (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), p_organization_id, 'entitlements.create_transaction')
  ) then
    raise exception 'DRIVER_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  if p_original_amount <= 0 then
    raise exception 'INVALID_DEBT_AMOUNT';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'DEBT_REASON_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
      and d.deleted_at is null
  ) then
    raise exception 'DRIVER_ORGANIZATION_MISMATCH';
  end if;

  insert into public.driver_debts (
    driver_id,
    organization_id,
    original_amount,
    debt_date,
    reason,
    notes,
    created_by
  )
  values (
    p_driver_id,
    p_organization_id,
    p_original_amount,
    p_debt_date,
    btrim(p_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_new_debt_id;

  return v_new_debt_id;
end;
$$;

revoke all on function public.create_driver_debt(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.create_driver_debt(uuid, uuid, numeric, date, text, text) to authenticated, service_role;

drop function if exists public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text
);

create or replace function public.create_driver_entitlement_transaction(
  p_organization_id uuid,
  p_driver_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_reason text,
  p_notes text,
  p_order_count integer,
  p_effective_date date,
  p_payment_method text,
  p_driver_debt_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_transaction_id uuid;
begin
  if not (
    public.is_system_owner_user(auth.uid())
    or public.has_organization_permission(auth.uid(), p_organization_id, 'entitlements.create_transaction')
  ) then
    raise exception 'DRIVER_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.id = p_driver_id
      and d.organization_id = p_organization_id
      and d.deleted_at is null
  ) then
    raise exception 'DRIVER_ORGANIZATION_MISMATCH';
  end if;

  perform public.validate_driver_debt_installment(
    p_organization_id,
    p_driver_id,
    p_transaction_type,
    p_amount,
    p_driver_debt_id,
    null
  );

  insert into public.driver_entitlement_transactions (
    organization_id,
    driver_id,
    transaction_type,
    amount,
    reason,
    notes,
    order_count,
    effective_date,
    payment_method,
    driver_debt_id,
    created_by
  )
  values (
    p_organization_id,
    p_driver_id,
    p_transaction_type,
    p_amount,
    p_reason,
    p_notes,
    p_order_count,
    p_effective_date,
    p_payment_method,
    p_driver_debt_id,
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid
) from public, anon;
grant execute on function public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid
) to authenticated, service_role;

drop function if exists public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text
);

create or replace function public.edit_driver_entitlement_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_reversal_reason text,
  p_new_transaction_type text,
  p_new_amount numeric,
  p_new_reason text,
  p_new_notes text,
  p_new_order_count integer,
  p_new_effective_date date,
  p_new_payment_method text,
  p_new_driver_debt_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_transaction public.driver_entitlement_transactions;
  v_new_transaction_id uuid;
begin
  if not (
    public.is_system_owner_user(auth.uid())
    or (
      public.has_organization_permission(auth.uid(), p_organization_id, 'entitlements.reverse_transaction')
      and public.has_organization_permission(auth.uid(), p_organization_id, 'entitlements.create_transaction')
    )
  ) then
    raise exception 'DRIVER_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  select *
  into v_old_transaction
  from public.driver_entitlement_transactions
  where id = p_transaction_id
    and organization_id = p_organization_id
  for update;

  if v_old_transaction.id is null then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if v_old_transaction.reversed_at is not null then
    raise exception 'TRANSACTION_ALREADY_REVERSED';
  end if;

  perform public.validate_driver_debt_installment(
    p_organization_id,
    v_old_transaction.driver_id,
    p_new_transaction_type,
    p_new_amount,
    p_new_driver_debt_id,
    p_transaction_id
  );

  update public.driver_entitlement_transactions
  set reversed_at = timezone('utc', now()),
      reversed_by = auth.uid(),
      reversal_reason = p_reversal_reason
  where id = p_transaction_id;

  insert into public.driver_entitlement_transactions (
    organization_id,
    driver_id,
    transaction_type,
    amount,
    reason,
    notes,
    order_count,
    effective_date,
    payment_method,
    driver_debt_id,
    created_by
  )
  values (
    p_organization_id,
    v_old_transaction.driver_id,
    p_new_transaction_type,
    p_new_amount,
    p_new_reason,
    p_new_notes,
    p_new_order_count,
    p_new_effective_date,
    p_new_payment_method,
    p_new_driver_debt_id,
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text, uuid
) from public, anon;
grant execute on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text, uuid
) to authenticated, service_role;
