-- Allow an authenticated Driver to read only their own Order Reports rows.
drop policy if exists driver_order_daily_report_rows_select_driver_self
  on public.driver_order_daily_report_rows;

create policy driver_order_daily_report_rows_select_driver_self
  on public.driver_order_daily_report_rows
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_order_daily_report_rows.driver_id
        and d.organization_id = driver_order_daily_report_rows.organization_id
        and d.auth_user_id = auth.uid()
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
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
