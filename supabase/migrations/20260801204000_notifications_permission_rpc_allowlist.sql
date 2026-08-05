-- Keep the existing managed-user permission RPC in sync with notifications.view.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'replace_managed_user_organization_permissions'
  limit 1;

  if v_definition is null then
    raise exception 'replace_managed_user_organization_permissions is missing';
  end if;

  if position('notifications.view' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''odometer.manage''',
      '''odometer.manage'', ''notifications.view'''
    );

    execute v_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
