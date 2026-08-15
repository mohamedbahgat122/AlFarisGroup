-- Allow authenticated drivers to read their own rows from driver_daily_report_rows
drop policy if exists driver_daily_report_rows_select_driver_self on public.driver_daily_report_rows;
create policy driver_daily_report_rows_select_driver_self
  on public.driver_daily_report_rows
  for select
  to authenticated
  using (
    exists (
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

-- Allow authenticated drivers to read their own rows from fuel_transactions
drop policy if exists fuel_transactions_select_driver_self on public.fuel_transactions;
create policy fuel_transactions_select_driver_self
  on public.fuel_transactions
  for select
  to authenticated
  using (
    exists (
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
