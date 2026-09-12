-- Durable idempotency for financial creation RPCs.
-- Local-only migration; do not backfill historical rows.

alter table public.driver_debts
  add column if not exists client_submission_id uuid null;

alter table public.driver_entitlement_transactions
  add column if not exists client_submission_id uuid null;

alter table public.supervisor_debts
  add column if not exists client_submission_id uuid null;

alter table public.supervisor_entitlement_transactions
  add column if not exists client_submission_id uuid null;

create unique index if not exists driver_debts_created_by_submission_key
  on public.driver_debts (created_by, client_submission_id)
  where client_submission_id is not null;

create unique index if not exists driver_entitlement_transactions_created_by_submission_key
  on public.driver_entitlement_transactions (created_by, client_submission_id)
  where client_submission_id is not null;

create unique index if not exists supervisor_debts_created_by_submission_key
  on public.supervisor_debts (created_by, client_submission_id)
  where client_submission_id is not null;

create unique index if not exists supervisor_entitlement_transactions_created_by_submission_key
  on public.supervisor_entitlement_transactions (created_by, client_submission_id)
  where client_submission_id is not null;

create or replace function public.create_driver_debt(
  p_driver_id uuid,
  p_organization_id uuid,
  p_original_amount numeric,
  p_debt_date date,
  p_reason text,
  p_notes text,
  p_client_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing public.driver_debts;
  v_new_debt_id uuid;
begin
  if p_client_submission_id is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':driver_debt:' || p_client_submission_id::text, 0)
  );

  select *
  into v_existing
  from public.driver_debts
  where created_by = v_actor_id
    and client_submission_id = p_client_submission_id;

  if v_existing.id is not null then
    if v_existing.driver_id is distinct from p_driver_id
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.original_amount is distinct from p_original_amount
      or v_existing.debt_date is distinct from p_debt_date
      or v_existing.reason is distinct from btrim(p_reason)
      or v_existing.notes is distinct from nullif(btrim(coalesce(p_notes, '')), '')
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, p_organization_id, 'entitlements.create_transaction')
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
    created_by,
    client_submission_id
  )
  values (
    p_driver_id,
    p_organization_id,
    p_original_amount,
    p_debt_date,
    btrim(p_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor_id,
    p_client_submission_id
  )
  returning id into v_new_debt_id;

  return v_new_debt_id;
exception
  when unique_violation then
    select *
    into v_existing
    from public.driver_debts
    where created_by = v_actor_id
      and client_submission_id = p_client_submission_id;

    if v_existing.id is null then
      raise;
    end if;

    if v_existing.driver_id is distinct from p_driver_id
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.original_amount is distinct from p_original_amount
      or v_existing.debt_date is distinct from p_debt_date
      or v_existing.reason is distinct from btrim(p_reason)
      or v_existing.notes is distinct from nullif(btrim(coalesce(p_notes, '')), '')
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
end;
$$;

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
  p_driver_debt_id uuid,
  p_client_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing public.driver_entitlement_transactions;
  v_new_transaction_id uuid;
begin
  if p_client_submission_id is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':driver_entitlement_transaction:' || p_client_submission_id::text, 0)
  );

  select *
  into v_existing
  from public.driver_entitlement_transactions
  where created_by = v_actor_id
    and client_submission_id = p_client_submission_id;

  if v_existing.id is not null then
    if v_existing.organization_id is distinct from p_organization_id
      or v_existing.driver_id is distinct from p_driver_id
      or v_existing.transaction_type is distinct from p_transaction_type
      or v_existing.amount is distinct from p_amount
      or v_existing.reason is distinct from p_reason
      or v_existing.notes is distinct from p_notes
      or v_existing.order_count is distinct from p_order_count
      or v_existing.effective_date is distinct from p_effective_date
      or v_existing.payment_method is distinct from p_payment_method
      or v_existing.driver_debt_id is distinct from p_driver_debt_id
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, p_organization_id, 'entitlements.create_transaction')
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
    created_by,
    client_submission_id
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
    v_actor_id,
    p_client_submission_id
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
exception
  when unique_violation then
    select *
    into v_existing
    from public.driver_entitlement_transactions
    where created_by = v_actor_id
      and client_submission_id = p_client_submission_id;

    if v_existing.id is null then
      raise;
    end if;

    if v_existing.organization_id is distinct from p_organization_id
      or v_existing.driver_id is distinct from p_driver_id
      or v_existing.transaction_type is distinct from p_transaction_type
      or v_existing.amount is distinct from p_amount
      or v_existing.reason is distinct from p_reason
      or v_existing.notes is distinct from p_notes
      or v_existing.order_count is distinct from p_order_count
      or v_existing.effective_date is distinct from p_effective_date
      or v_existing.payment_method is distinct from p_payment_method
      or v_existing.driver_debt_id is distinct from p_driver_debt_id
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
end;
$$;

create or replace function public.create_supervisor_debt(
  p_supervisor_id uuid,
  p_organization_id uuid,
  p_original_amount numeric,
  p_debt_date date,
  p_reason text,
  p_notes text,
  p_client_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing public.supervisor_debts;
  v_new_debt_id uuid;
begin
  if p_client_submission_id is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':supervisor_debt:' || p_client_submission_id::text, 0)
  );

  select *
  into v_existing
  from public.supervisor_debts
  where created_by = v_actor_id
    and client_submission_id = p_client_submission_id;

  if v_existing.id is not null then
    if v_existing.supervisor_id is distinct from p_supervisor_id
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.original_amount is distinct from p_original_amount
      or v_existing.debt_date is distinct from p_debt_date
      or v_existing.reason is distinct from btrim(p_reason)
      or v_existing.notes is distinct from nullif(btrim(coalesce(p_notes, '')), '')
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
  end if;

  if not public.actor_has_global_permission(v_actor_id, 'supervisor_entitlements.manage') then
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
    created_by,
    client_submission_id
  )
  values (
    p_supervisor_id,
    p_organization_id,
    p_original_amount,
    p_debt_date,
    btrim(p_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor_id,
    p_client_submission_id
  )
  returning id into v_new_debt_id;

  return v_new_debt_id;
exception
  when unique_violation then
    select *
    into v_existing
    from public.supervisor_debts
    where created_by = v_actor_id
      and client_submission_id = p_client_submission_id;

    if v_existing.id is null then
      raise;
    end if;

    if v_existing.supervisor_id is distinct from p_supervisor_id
      or v_existing.organization_id is distinct from p_organization_id
      or v_existing.original_amount is distinct from p_original_amount
      or v_existing.debt_date is distinct from p_debt_date
      or v_existing.reason is distinct from btrim(p_reason)
      or v_existing.notes is distinct from nullif(btrim(coalesce(p_notes, '')), '')
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
end;
$$;

create or replace function public.create_supervisor_entitlement_transaction(
  p_supervisor_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_effective_date date,
  p_reason text,
  p_notes text,
  p_payment_method text,
  p_supervisor_debt_id uuid,
  p_client_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing public.supervisor_entitlement_transactions;
  v_new_transaction_id uuid;
begin
  if p_client_submission_id is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || ':supervisor_entitlement_transaction:' || p_client_submission_id::text, 0)
  );

  select *
  into v_existing
  from public.supervisor_entitlement_transactions
  where created_by = v_actor_id
    and client_submission_id = p_client_submission_id;

  if v_existing.id is not null then
    if v_existing.supervisor_id is distinct from p_supervisor_id
      or v_existing.transaction_type is distinct from p_transaction_type
      or v_existing.amount is distinct from p_amount
      or v_existing.effective_date is distinct from p_effective_date
      or v_existing.reason is distinct from p_reason
      or v_existing.notes is distinct from p_notes
      or v_existing.payment_method is distinct from p_payment_method
      or v_existing.supervisor_debt_id is distinct from p_supervisor_debt_id
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
  end if;

  if not (
    public.actor_has_global_permission(v_actor_id, 'supervisor_entitlements.create_transaction')
    or public.actor_has_global_permission(v_actor_id, 'supervisor_entitlements.manage')
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
    created_by,
    client_submission_id
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
    v_actor_id,
    p_client_submission_id
  )
  returning id into v_new_transaction_id;

  return v_new_transaction_id;
exception
  when unique_violation then
    select *
    into v_existing
    from public.supervisor_entitlement_transactions
    where created_by = v_actor_id
      and client_submission_id = p_client_submission_id;

    if v_existing.id is null then
      raise;
    end if;

    if v_existing.supervisor_id is distinct from p_supervisor_id
      or v_existing.transaction_type is distinct from p_transaction_type
      or v_existing.amount is distinct from p_amount
      or v_existing.effective_date is distinct from p_effective_date
      or v_existing.reason is distinct from p_reason
      or v_existing.notes is distinct from p_notes
      or v_existing.payment_method is distinct from p_payment_method
      or v_existing.supervisor_debt_id is distinct from p_supervisor_debt_id
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
    end if;

    return v_existing.id;
end;
$$;

revoke all on function public.create_driver_debt(uuid, uuid, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.create_driver_debt(uuid, uuid, numeric, date, text, text, uuid) to authenticated, service_role;

revoke all on function public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid, uuid
) from public, anon;
grant execute on function public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid, uuid
) to authenticated, service_role;

revoke all on function public.create_supervisor_debt(uuid, uuid, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.create_supervisor_debt(uuid, uuid, numeric, date, text, text, uuid) to authenticated, service_role;

revoke all on function public.create_supervisor_entitlement_transaction(
  uuid, text, numeric, date, text, text, text, uuid, uuid
) from public, anon;
grant execute on function public.create_supervisor_entitlement_transaction(
  uuid, text, numeric, date, text, text, text, uuid, uuid
) to authenticated, service_role;

drop function if exists public.create_driver_debt(uuid, uuid, numeric, date, text, text);

drop function if exists public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid
);

drop function if exists public.create_supervisor_debt(uuid, uuid, numeric, date, text, text);

drop function if exists public.create_supervisor_entitlement_transaction(
  uuid, text, numeric, date, text, text, text, uuid
);
