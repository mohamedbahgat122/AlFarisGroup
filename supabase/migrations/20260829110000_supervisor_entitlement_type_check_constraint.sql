alter table public.supervisor_entitlement_transactions
  drop constraint if exists supervisor_entitlement_transactions_type_check;

alter table public.supervisor_entitlement_transactions
  add constraint supervisor_entitlement_transactions_type_check check (
    transaction_type in (
      'salary',
      'bonus',
      'deduction',
      'advance',
      'mudad',
      'salary_receipt',
      'debt_installment'
    )
  );
