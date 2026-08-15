-- Allow authenticated drivers to read their own published entitlement statements.

drop policy if exists driver_entitlement_statements_select_driver_self on public.driver_entitlement_statements;
create policy driver_entitlement_statements_select_driver_self
  on public.driver_entitlement_statements
  for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and d.auth_user_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'driver'::public.app_role
            and p.status = 'active'::public.account_status
            and p.deleted_at is null
        )
    )
  );

drop policy if exists driver_entitlement_statement_items_select_driver_self on public.driver_entitlement_statement_items;
create policy driver_entitlement_statement_items_select_driver_self
  on public.driver_entitlement_statement_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.driver_entitlement_statements s
      where s.id = statement_id
        and s.status = 'published'
        and exists (
          select 1
          from public.drivers d
          where d.id = s.driver_id
            and d.auth_user_id = auth.uid()
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and p.role = 'driver'::public.app_role
                and p.status = 'active'::public.account_status
                and p.deleted_at is null
            )
        )
    )
  );
