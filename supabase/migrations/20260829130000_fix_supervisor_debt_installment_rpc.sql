create or replace function public.validate_supervisor_debt_installment(
  p_supervisor_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_supervisor_debt_id uuid,
  p_excluded_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debt public.supervisor_debts;
  v_paid_amount numeric(12, 2);
  v_remaining_amount numeric(12, 2);
begin
  if p_transaction_type <> 'debt_installment' then
    if p_supervisor_debt_id is not null then
      raise exception 'SUPERVISOR_DEBT_LINK_NOT_ALLOWED';
    end if;

    return;
  end if;

  if p_supervisor_debt_id is null then
    raise exception 'SUPERVISOR_DEBT_REQUIRED';
  end if;

  select *
  into v_debt
  from public.supervisor_debts
  where id = p_supervisor_debt_id
  for update;

  if v_debt.id is null then
    raise exception 'SUPERVISOR_DEBT_NOT_FOUND';
  end if;

  if v_debt.supervisor_id <> p_supervisor_id then
    raise exception 'SUPERVISOR_DEBT_SUPERVISOR_MISMATCH';
  end if;

  if v_debt.cancelled_at is not null then
    raise exception 'SUPERVISOR_DEBT_CANCELLED';
  end if;

  if not exists (
    select 1
    from public.supervisor_organization_assignments soa
    where soa.supervisor_id = p_supervisor_id
      and soa.organization_id = v_debt.organization_id
      and soa.end_date is null
  ) then
    raise exception 'SUPERVISOR_DEBT_ORGANIZATION_MISMATCH';
  end if;

  select coalesce(sum(tx.amount), 0)
  into v_paid_amount
  from public.supervisor_entitlement_transactions tx
  where tx.supervisor_debt_id = p_supervisor_debt_id
    and tx.transaction_type = 'debt_installment'
    and tx.reversed_at is null
    and (p_excluded_transaction_id is null or tx.id <> p_excluded_transaction_id);

  v_remaining_amount := v_debt.original_amount - v_paid_amount;

  if v_remaining_amount <= 0 then
    raise exception 'SUPERVISOR_DEBT_ALREADY_PAID';
  end if;

  if p_amount > v_remaining_amount then
    raise exception 'SUPERVISOR_DEBT_INSTALLMENT_EXCEEDS_REMAINING';
  end if;
end;
$$;

revoke all on function public.validate_supervisor_debt_installment(uuid, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.validate_supervisor_debt_installment(uuid, text, numeric, uuid, uuid) to authenticated, service_role;
