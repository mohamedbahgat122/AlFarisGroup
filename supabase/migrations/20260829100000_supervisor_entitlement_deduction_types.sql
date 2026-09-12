alter table public.supervisor_entitlement_transactions
  drop constraint if exists supervisor_entitlement_transactions_type_check,
  add constraint supervisor_entitlement_transactions_type_check check (
    transaction_type in (
      'salary',
      'bonus',
      'deduction',
      'advance',
      'salary_receipt',
      'debt_installment',
      'mudad'
    )
  );
