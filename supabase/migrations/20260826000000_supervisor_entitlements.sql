-- Supervisor Entitlements Module

-- 1. Create Table
create table if not exists public.supervisor_entitlement_transactions (
    id uuid primary key default gen_random_uuid(),
    supervisor_id uuid not null references public.profiles(id) on delete restrict,
    transaction_type text not null,
    amount numeric(12, 2) not null,
    effective_date date not null,
    reason text null,
    notes text null,
    payment_method text not null,
    reversed_at timestamptz null,
    reversed_by uuid null references public.profiles(id) on delete restrict,
    reversal_reason text null,
    replaced_by_id uuid null references public.supervisor_entitlement_transactions(id) on delete restrict,
    created_by uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    
    constraint supervisor_entitlement_transactions_amount_check check (amount > 0),
    constraint supervisor_entitlement_transactions_type_check check (
      transaction_type in ('salary', 'bonus', 'deduction', 'advance', 'mudad')
    ),
    constraint supervisor_entitlement_transactions_payment_method_check check (
      payment_method in ('cash', 'bank_transfer')
    ),
    constraint supervisor_entitlement_transactions_reversal_consistency check (
      (reversed_at is null and reversed_by is null and reversal_reason is null) or 
      (reversed_at is not null and reversed_by is not null and reversal_reason is not null)
    )
);

-- 2. Update Global Permissions Check Constraint
alter table public.user_global_permissions
  drop constraint if exists user_global_permissions_permission_key_check,
  add constraint user_global_permissions_permission_key_check check (
    permission_key in (
      'fleet.view',
      'fleet.create',
      'fleet.update',
      'fleet.technical_status',
      'fleet.operational_status',
      'fleet.archive',
      'fleet.operating_card.download',
      'fleet.activity.view',
      'housing.view',
      'housing.create',
      'housing.update',
      'housing.archive',
      'housing.assign_organizations',
      'housing.assign_drivers',
      'housing.activity.view',
      'supervisor_shifts.view',
      'supervisor_shifts.manage',
      'supervisor_shifts.manage_leave',
      'supervisor_entitlements.view',
      'supervisor_entitlements.create_transaction',
      'supervisor_entitlements.reverse_transaction',
      'supervisor_entitlements.manage'
    )
  );

-- 3. RLS and Grants
alter table public.supervisor_entitlement_transactions enable row level security;

grant select, insert, update on public.supervisor_entitlement_transactions to authenticated;
grant select, insert, update on public.supervisor_entitlement_transactions to service_role;

create policy "Users with view permission can view supervisor entitlement transactions"
  on public.supervisor_entitlement_transactions for select
  to authenticated
  using (
    public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.view')
    or public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage')
  );

-- Note: INSERT and UPDATE are handled strictly through SECURITY DEFINER RPCs.
-- However, we can add policies just in case or rely solely on RPCs. 
-- The user requested explicit Policies, so we add basic ones that deny all direct inserts/updates 
-- since we use RPCs for atomicity and validation.
create policy "Insert restricted to RPCs"
  on public.supervisor_entitlement_transactions for insert
  to authenticated
  with check (false);

create policy "Update restricted to RPCs"
  on public.supervisor_entitlement_transactions for update
  to authenticated
  using (false)
  with check (false);


-- 4. RPCs

-- A. Create Transaction
create or replace function public.create_supervisor_entitlement_transaction(
  p_supervisor_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_effective_date date,
  p_reason text,
  p_notes text,
  p_payment_method text
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

  insert into public.supervisor_entitlement_transactions (
    supervisor_id,
    transaction_type,
    amount,
    effective_date,
    reason,
    notes,
    payment_method,
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
    auth.uid()
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
end;
$$;

revoke all on function public.create_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text) from public, anon;
grant execute on function public.create_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text) to authenticated, service_role;


-- B. Reverse Transaction
create or replace function public.reverse_supervisor_entitlement_transaction(
  p_transaction_id uuid,
  p_reversal_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.supervisor_entitlement_transactions;
begin
  if not (
    public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.reverse_transaction')
    or public.actor_has_global_permission(auth.uid(), 'supervisor_entitlements.manage')
  ) then
    raise exception 'SUPERVISOR_ENTITLEMENTS_PERMISSION_DENIED';
  end if;

  select *
  into v_transaction
  from public.supervisor_entitlement_transactions
  where id = p_transaction_id
  for update;

  if v_transaction.id is null then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if v_transaction.reversed_at is not null then
    raise exception 'TRANSACTION_ALREADY_REVERSED';
  end if;

  update public.supervisor_entitlement_transactions
  set reversed_at = timezone('utc', now()),
      reversed_by = auth.uid(),
      reversal_reason = p_reversal_reason,
      updated_at = timezone('utc', now())
  where id = p_transaction_id;
end;
$$;

revoke all on function public.reverse_supervisor_entitlement_transaction(uuid, text) from public, anon;
grant execute on function public.reverse_supervisor_entitlement_transaction(uuid, text) to authenticated, service_role;


-- C. Edit Transaction
create or replace function public.edit_supervisor_entitlement_transaction(
  p_transaction_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_effective_date date,
  p_reason text,
  p_notes text,
  p_payment_method text,
  p_reversal_reason text
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

  -- 1. Insert new replacement transaction
  insert into public.supervisor_entitlement_transactions (
    supervisor_id,
    transaction_type,
    amount,
    effective_date,
    reason,
    notes,
    payment_method,
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
    auth.uid()
  )
  returning id into v_new_transaction_id;

  -- 2. Reverse old transaction and set replaced_by_id
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

revoke all on function public.edit_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, text) from public, anon;
grant execute on function public.edit_supervisor_entitlement_transaction(uuid, text, numeric, date, text, text, text, text) to authenticated, service_role;
