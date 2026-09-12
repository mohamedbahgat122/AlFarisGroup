-- Replace authenticated SELECT policy calls to the revoked generic permission helper.
-- No data, table, grant, or RPC changes.

begin;

drop policy if exists organization_order_shift_change_settings_select_scoped
  on public.organization_order_shift_change_settings;
create policy organization_order_shift_change_settings_select_scoped
  on public.organization_order_shift_change_settings
  for select to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
  );

drop policy if exists driver_order_shift_change_requests_select_scoped
  on public.driver_order_shift_change_requests;
create policy driver_order_shift_change_requests_select_scoped
  on public.driver_order_shift_change_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      where d.id = driver_order_shift_change_requests.driver_id
        and d.organization_id = driver_order_shift_change_requests.organization_id
        and d.auth_user_id = auth.uid()
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
    or public.has_current_user_organization_permission(organization_id, 'order_periods.view')
    or public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
    or public.has_current_user_organization_permission(organization_id, 'order_periods.assign')
  );

commit;

notify pgrst, 'reload schema';
