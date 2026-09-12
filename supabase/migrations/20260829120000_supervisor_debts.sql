create table if not exists public.supervisor_debts (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
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
  constraint supervisor_debts_original_amount_check check (original_amount > 0),
  constraint supervisor_debts_reason_check check (btrim(reason) <> ''),
  constraint supervisor_debts_cancellation_consistency check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or
    (cancelled_at is not null and cancelled_by is not null and cancellation_reason is not null)
  )
);

alter table public.supervisor_debts enable row level security;

grant select, insert, update on public.supervisor_debts to authenticated;
grant select, insert, update on public.supervisor_debts to service_role;

create index if not exists supervisor_debts_supervisor_organization_idx
  on public.supervisor_debts(supervisor_id, organization_id);

create index if not exists supervisor_debts_active_idx
  on public.supervisor_debts(supervisor_id, organization_id)
  where cancelled_at is null;

create policy "Users with view permission can view supervisor debts"
  on public.supervisor_debts for select
  to authenticated
  using (
    public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.view')
    or public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage')
  );

create policy "Insert supervisor debts restricted to RPCs"
  on public.supervisor_debts for insert
  to authenticated
  with check (false);

create policy "Update supervisor debts restricted to RPCs"
  on public.supervisor_debts for update
  to authenticated
  using (false)
  with check (false);

alter table public.supervisor_entitlement_transactions
  add column if not exists supervisor_debt_id uuid null references public.supervisor_debts(id) on delete restrict;

create index if not exists supervisor_entitlement_transactions_supervisor_debt_id_idx
  on public.supervisor_entitlement_transactions(supervisor_debt_id);

alter table public.supervisor_entitlement_transactions
  drop constraint if exists supervisor_entitlement_transactions_debt_link_check;

alter table public.supervisor_entitlement_transactions
  add constraint supervisor_entitlement_transactions_debt_link_check check (
    (
      transaction_type = 'debt_installment'
      and supervisor_debt_id is not null
    )
    or
    (
      transaction_type <> 'debt_installment'
      and supervisor_debt_id is null
    )
  ) not valid;

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

  select coalesce(sum(set.amount), 0)
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

create or replace function public.create_supervisor_debt(
  p_supervisor_id uuid,
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
  if not public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage') then
    raise exception 'SUPERVISOR_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  if p_original_amount <= 0 then
    raise exception 'INVALID_DEBT_AMOUNT';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'DEBT_REASON_REQUIRED';
  end if;

  if not exists (select 1 from public.profiles where id = p_supervisor_id and role = 'supervisor') then
    raise exception 'INVALID_SUPERVISOR';
  end if;

  if not exists (
    select 1
    from public.supervisor_organization_assignments soa
    where soa.supervisor_id = p_supervisor_id
      and soa.organization_id = p_organization_id
      and soa.end_date is null
  ) then
    raise exception 'SUPERVISOR_ORGANIZATION_ASSIGNMENT_NOT_FOUND';
  end if;

  insert into public.supervisor_debts (
    supervisor_id,
    organization_id,
    original_amount,
    debt_date,
    reason,
    notes,
    created_by
  )
  values (
    p_supervisor_id,
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

revoke all on function public.create_supervisor_debt(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.create_supervisor_debt(uuid, uuid, numeric, date, text, text) to authenticated, service_role;

drop function if exists public.create_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text);

create or replace function public.create_supervisor_entitlement_transaction(
  p_supervisor_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_effective_date date,
  p_reason text,
  p_notes text,
  p_payment_method text,
  p_supervisor_debt_id uuid default null
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
    public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.create_transaction')
    or public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage')
  ) then
    raise exception 'SUPERVISOR_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  if not exists (select 1 from public.profiles where id = p_supervisor_id and role = 'supervisor') then
    raise exception 'INVALID_SUPERVISOR';
  end if;

  perform public.validate_supervisor_debt_installment(
    p_supervisor_id,
    p_transaction_type,
    p_amount,
    p_supervisor_debt_id,
    null
  );

  insert into public.supervisor_entitlement_transactions (
    supervisor_id,
    transaction_type,
    amount,
    effective_date,
    reason,
    notes,
    payment_method,
    supervisor_debt_id,
    created_by
  )
  values (
    p_supervisor_id,
    p_transaction_type,
    p_amount,
    p_effective_date,
    p_reason,
    p_notes,
    p_payment_method,
    p_supervisor_debt_id,
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.create_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, uuid) from public, anon;
grant execute on function public.create_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, uuid) to authenticated, service_role;

drop function if exists public.edit_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, text);

create or replace function public.edit_supervisor_entitlement_transaction(
  p_transaction_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_effective_date date,
  p_reason text,
  p_notes text,
  p_payment_method text,
  p_reversal_reason text,
  p_supervisor_debt_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_transaction public.supervisor_entitlement_transactions;
  v_new_transaction_id uuid;
begin
  if not (
    (
      public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.create_transaction')
      and public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.reverse_transaction')
    )
    or public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage')
  ) then
    raise exception 'SUPERVISOR_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  select *
  into v_old_transaction
  from public.supervisor_entitlement_transactions
  where id = p_transaction_id
  for update;

  if v_old_transaction.id is null then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if v_old_transaction.reversed_at is not null then
    raise exception 'TRANSACTION_ALREADY_REVERSED';
  end if;

  perform public.validate_supervisor_debt_installment(
    v_old_transaction.supervisor_id,
    p_transaction_type,
    p_amount,
    p_supervisor_debt_id,
    p_transaction_id
  );

  insert into public.supervisor_entitlement_transactions (
    supervisor_id,
    transaction_type,
    amount,
    effective_date,
    reason,
    notes,
    payment_method,
    supervisor_debt_id,
    created_by
  )
  values (
    v_old_transaction.supervisor_id,
    p_transaction_type,
    p_amount,
    p_effective_date,
    p_reason,
    p_notes,
    p_payment_method,
    p_supervisor_debt_id,
    auth.uid()
  )
  returning id into v_new_transaction_id;

  update public.supervisor_entitlement_transactions
  set reversed_at = timezone('utc', now()),
      reversed_by = auth.uid(),
      reversal_reason = p_reversal_reason,
      replaced_by_id = v_new_transaction_id,
      updated_at = timezone('utc', now())
  where id = p_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.edit_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, text, uuid) from public, anon;
grant execute on function public.edit_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, text, uuid) to authenticated, service_role;
