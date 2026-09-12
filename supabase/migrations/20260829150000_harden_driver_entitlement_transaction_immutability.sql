create or replace function public.protect_driver_entitlement_transaction_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id is distinct from new.id
    or old.organization_id is distinct from new.organization_id
    or old.driver_id is distinct from new.driver_id
    or old.transaction_type is distinct from new.transaction_type
    or old.amount is distinct from new.amount
    or old.reason is distinct from new.reason
    or old.notes is distinct from new.notes
    or old.order_count is distinct from new.order_count
    or old.effective_date is distinct from new.effective_date
    or old.payment_method is distinct from new.payment_method
    or old.driver_debt_id is distinct from new.driver_debt_id
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
