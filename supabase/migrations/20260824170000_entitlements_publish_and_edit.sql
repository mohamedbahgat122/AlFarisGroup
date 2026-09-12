-- 1. Update statement items constraint to allow 'advance'
alter table public.driver_entitlement_statement_items
  drop constraint if exists driver_entitlement_statement_items_type_check;

alter table public.driver_entitlement_statement_items
  add constraint driver_entitlement_statement_items_type_check check (
    transaction_type in ('salary', 'bonus', 'admin_deduction', 'keeta_deduction', 'violation', 'absence', 'advance')
  );

-- 2. Create atomic edit RPC (Reverse & Replace)
create or replace function public.edit_driver_entitlement_transaction(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_reversal_reason text,
  p_new_transaction_type text,
  p_new_amount numeric,
  p_new_reason text,
  p_new_notes text,
  p_new_order_count integer,
  p_new_effective_date date
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
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date
) from public, anon;

grant execute on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date
) to authenticated, service_role;
