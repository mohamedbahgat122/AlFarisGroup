-- 1. Add payment_method to transactions
alter table public.driver_entitlement_transactions
  add column payment_method text null;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_payment_check 
  check (payment_method in ('cash', 'bank_transfer') or payment_method is null);

-- Update transaction type check to include mudad
alter table public.driver_entitlement_transactions
  drop constraint if exists driver_entitlement_transactions_type_check;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_type_check check (
    transaction_type in ('mudad', 'salary', 'bonus', 'admin_deduction', 'keeta_deduction', 'violation', 'absence', 'advance')
  );

-- 2. Add payment_method to statement items
alter table public.driver_entitlement_statement_items
  add column payment_method text null;

alter table public.driver_entitlement_statement_items
  add constraint driver_entitlement_statement_items_payment_check 
  check (payment_method in ('cash', 'bank_transfer') or payment_method is null);

-- Update statement items type check to include mudad
alter table public.driver_entitlement_statement_items
  drop constraint if exists driver_entitlement_statement_items_type_check;

alter table public.driver_entitlement_statement_items
  add constraint driver_entitlement_statement_items_type_check check (
    transaction_type in ('mudad', 'salary', 'bonus', 'admin_deduction', 'keeta_deduction', 'violation', 'absence', 'advance')
  );

-- 3. Add mudad_total and advance_total to statements
alter table public.driver_entitlement_statements
  add column mudad_total numeric(12,2) not null default 0,
  add column advance_total numeric(12,2) not null default 0;

-- Update statements totals check
alter table public.driver_entitlement_statements
  drop constraint if exists driver_entitlement_statements_totals_check;

alter table public.driver_entitlement_statements
  add constraint driver_entitlement_statements_totals_check check (
    salary_total >= 0
    and mudad_total >= 0
    and bonus_total >= 0
    and admin_deduction_total >= 0
    and keeta_deduction_total >= 0
    and violation_total >= 0
    and absence_total >= 0
    and advance_total >= 0
    and deduction_total >= 0
    and transaction_count >= 0
  );

-- 4. Update edit_driver_entitlement_transaction RPC
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
  p_new_payment_method text
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
    raise exception 'Not authorized to edit entitlement transactions.';
  end if;

  select *
  into v_old_transaction
  from public.driver_entitlement_transactions
  where id = p_transaction_id
    and organization_id = p_organization_id
  for update;

  if v_old_transaction.id is null then
    raise exception 'Transaction not found.';
  end if;

  if v_old_transaction.reversed_at is not null then
    raise exception 'Cannot edit an already reversed transaction.';
  end if;

  -- 1. Reverse the old transaction
  update public.driver_entitlement_transactions
  set reversed_at = timezone('utc', now()),
      reversed_by = auth.uid(),
      reversal_reason = p_reversal_reason
  where id = p_transaction_id;

  -- 2. Create the new transaction
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
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text
) from public, anon;

grant execute on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text
) to authenticated, service_role;

-- 5. Update publish_driver_entitlement_statement RPC
create or replace function public.publish_driver_entitlement_statement(
  p_organization_id uuid,
  p_driver_id uuid,
  p_period_start date,
  p_period_end date,
  p_salary_total numeric,
  p_mudad_total numeric,
  p_bonus_total numeric,
  p_admin_deduction_total numeric,
  p_keeta_deduction_total numeric,
  p_violation_total numeric,
  p_absence_total numeric,
  p_advance_total numeric,
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
    mudad_total,
    bonus_total,
    admin_deduction_total,
    keeta_deduction_total,
    violation_total,
    absence_total,
    advance_total,
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
    p_mudad_total,
    p_bonus_total,
    p_admin_deduction_total,
    p_keeta_deduction_total,
    p_violation_total,
    p_absence_total,
    p_advance_total,
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
      effective_date,
      payment_method
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
      (v_item->>'effectiveDate')::date,
      nullif(v_item->>'paymentMethod', '')
    );
  end loop;

  return v_statement_id;
end;
$$;

revoke all on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) from public, anon;

grant execute on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) to authenticated, service_role;
