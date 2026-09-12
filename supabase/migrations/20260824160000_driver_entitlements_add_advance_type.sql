-- Add advance to driver entitlement transaction types

alter table public.driver_entitlement_transactions
  drop constraint if exists driver_entitlement_transactions_type_check;

alter table public.driver_entitlement_transactions
  add constraint driver_entitlement_transactions_type_check check (
    transaction_type in (
      'salary',
      'bonus',
      'admin_deduction',
      'keeta_deduction',
      'violation',
      'absence',
      'advance'
    )
  );
