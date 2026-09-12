-- Retire direct mutation access for the removed entitlement features.
-- Historical tables, rows, constraints, policies, and functions remain intact.

revoke execute on function public.create_driver_debt(
  uuid, uuid, numeric, date, text, text, uuid
) from public, anon, authenticated;

revoke execute on function public.create_driver_entitlement_transaction(
  uuid, uuid, text, numeric, text, text, integer, date, text, uuid, uuid
) from public, anon, authenticated;

revoke execute on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date
) from public, anon, authenticated;

revoke execute on function public.edit_driver_entitlement_transaction(
  uuid, uuid, text, text, numeric, text, text, integer, date, text, uuid
) from public, anon, authenticated;

revoke execute on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) from public, anon, authenticated;

revoke execute on function public.publish_driver_entitlement_statement(
  uuid, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, jsonb
) from public, anon, authenticated;

revoke execute on function public.validate_driver_debt_installment(
  uuid, uuid, text, numeric, uuid, uuid
) from public, anon, authenticated;

revoke execute on function public.create_supervisor_debt(
  uuid, uuid, numeric, date, text, text, uuid
) from public, anon, authenticated;

revoke execute on function public.create_supervisor_entitlement_transaction(
  uuid, text, numeric, date, text, text, text, uuid, uuid
) from public, anon, authenticated;

revoke execute on function public.edit_supervisor_entitlement_transaction(
  uuid, text, numeric, date, text, text, text, text, uuid
) from public, anon, authenticated;

revoke execute on function public.reverse_supervisor_entitlement_transaction(
  uuid, text
) from public, anon, authenticated;

revoke execute on function public.validate_supervisor_debt_installment(
  uuid, text, numeric, uuid, uuid
) from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_entitlement_transactions'
  ) then
    alter publication supabase_realtime drop table public.driver_entitlement_transactions;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_entitlement_statements'
  ) then
    alter publication supabase_realtime drop table public.driver_entitlement_statements;
  end if;
end $$;
