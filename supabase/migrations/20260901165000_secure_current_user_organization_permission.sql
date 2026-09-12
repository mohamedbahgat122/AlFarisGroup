create or replace function public.has_current_user_organization_permission(
  target_organization_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else public.has_organization_permission(
      auth.uid(),
      target_organization_id,
      target_permission_key
    )
  end;
$$;

revoke all on function public.has_current_user_organization_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_current_user_organization_permission(uuid, text)
  to authenticated, service_role;

drop policy if exists driver_app_requests_select_dashboard
  on public.driver_app_requests;
create policy driver_app_requests_select_dashboard
  on public.driver_app_requests
  for select
  to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'app_requests.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or public.has_current_user_organization_permission(organization_id, 'odometer.manage')
  );

drop policy if exists driver_debts_select_scoped
  on public.driver_debts;
create policy driver_debts_select_scoped
  on public.driver_debts
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'entitlements.view')
    or public.has_current_user_organization_permission(organization_id, 'entitlements.view_transactions')
  );

drop policy if exists driver_entitlement_statement_items_select_scoped
  on public.driver_entitlement_statement_items;
create policy driver_entitlement_statement_items_select_scoped
  on public.driver_entitlement_statement_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.driver_entitlement_statements s
      where s.id = driver_entitlement_statement_items.statement_id
        and (
          public.is_system_owner_user(auth.uid())
          or public.has_current_user_organization_permission(s.organization_id, 'entitlements.view')
        )
    )
  );

drop policy if exists driver_entitlement_statements_select_scoped
  on public.driver_entitlement_statements;
create policy driver_entitlement_statements_select_scoped
  on public.driver_entitlement_statements
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'entitlements.view')
  );

drop policy if exists driver_entitlement_transactions_insert_scoped
  on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_insert_scoped
  on public.driver_entitlement_transactions
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_system_owner_user(auth.uid())
      or public.has_current_user_organization_permission(organization_id, 'entitlements.create_transaction')
    )
    and exists (
      select 1
      from public.drivers d
      where d.id = driver_entitlement_transactions.driver_id
        and d.organization_id = d.organization_id
        and d.deleted_at is null
    )
  );

drop policy if exists driver_entitlement_transactions_select_scoped
  on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_select_scoped
  on public.driver_entitlement_transactions
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'entitlements.view')
    or public.has_current_user_organization_permission(organization_id, 'entitlements.view_transactions')
  );

drop policy if exists driver_entitlement_transactions_update_scoped
  on public.driver_entitlement_transactions;
create policy driver_entitlement_transactions_update_scoped
  on public.driver_entitlement_transactions
  for update
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'entitlements.reverse_transaction')
  )
  with check (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'entitlements.reverse_transaction')
  );

drop policy if exists "Org users can update shift change requests"
  on public.driver_shift_change_requests;
create policy "Org users can update shift change requests"
  on public.driver_shift_change_requests
  for update
  to public
  using (
    public.has_current_user_organization_permission(organization_id, 'app_requests.review')
  );

drop policy if exists "Org users can view their shift change requests"
  on public.driver_shift_change_requests;
create policy "Org users can view their shift change requests"
  on public.driver_shift_change_requests
  for select
  to public
  using (
    public.has_current_user_organization_permission(organization_id, 'app_requests.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.review')
  );

drop policy if exists driver_shifts_select_org_odometer_manage
  on public.driver_shifts;
create policy driver_shifts_select_org_odometer_manage
  on public.driver_shifts
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.has_current_user_organization_permission(organization_id, 'odometer.manage')
  );

drop policy if exists driver_warnings_select_admins
  on public.driver_warnings;
create policy driver_warnings_select_admins
  on public.driver_warnings
  for select
  to authenticated
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'driver_warnings.view')
  );

drop policy if exists "Organization owners can manage their fleet vehicle odometer res"
  on public.fleet_vehicle_odometer_resets;
create policy "Organization owners can manage their fleet vehicle odometer res"
  on public.fleet_vehicle_odometer_resets
  for all
  to public
  using (
    public.is_system_owner_user(auth.uid())
    or public.has_current_user_organization_permission(organization_id, 'odometer.manage')
  );

drop policy if exists fleet_vehicle_oil_change_events_select_viewable_organization
  on public.fleet_vehicle_oil_change_events;
create policy fleet_vehicle_oil_change_events_select_viewable_organization
  on public.fleet_vehicle_oil_change_events
  for select
  to authenticated
  using (
    public.can_manage_organization(organization_id)
    or public.has_current_user_organization_permission(organization_id, 'app_requests.view')
    or public.has_current_user_organization_permission(organization_id, 'app_requests.review')
    or exists (
      select 1
      from public.drivers d
      where d.id = fleet_vehicle_oil_change_events.driver_id
        and d.auth_user_id = auth.uid()
        and d.organization_id = fleet_vehicle_oil_change_events.organization_id
        and d.deleted_at is null
    )
  );

drop policy if exists fuel_requests_select_dashboard_or_own_driver
  on public.fuel_increase_requests;
create policy fuel_requests_select_dashboard_or_own_driver
  on public.fuel_increase_requests
  for select
  to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'fuel.manage')
    or public.has_current_user_organization_permission(organization_id, 'fuel.increase.review')
    or public.has_current_user_organization_permission(organization_id, 'fuel.reports.view')
    or exists (
      select 1
      from public.drivers d
      where d.id = fuel_increase_requests.driver_id
        and d.auth_user_id = auth.uid()
    )
  );

drop policy if exists fuel_transactions_select_dashboard_or_own_driver
  on public.fuel_transactions;
create policy fuel_transactions_select_dashboard_or_own_driver
  on public.fuel_transactions
  for select
  to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'fuel.manage')
    or public.has_current_user_organization_permission(organization_id, 'fuel.reports.view')
    or exists (
      select 1
      from public.drivers d
      where d.id = fuel_transactions.driver_id
        and d.auth_user_id = auth.uid()
    )
  );

drop policy if exists maintenance_jobs_select_authorized
  on public.maintenance_jobs;
create policy maintenance_jobs_select_authorized
  on public.maintenance_jobs
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(provider_id)
    or public.has_current_user_organization_permission(organization_id, 'maintenance_jobs.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_jobs.assign')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_jobs.cancel')
  );

drop policy if exists maintenance_provider_organizations_select_authorized
  on public.maintenance_provider_organizations;
create policy maintenance_provider_organizations_select_authorized
  on public.maintenance_provider_organizations
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(provider_id)
    or public.has_current_user_organization_permission(organization_id, 'maintenance_providers.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_providers.manage')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_jobs.view')
    or public.has_current_user_organization_permission(organization_id, 'maintenance_jobs.assign')
  );

drop policy if exists maintenance_provider_users_select_authorized
  on public.maintenance_provider_users;
create policy maintenance_provider_users_select_authorized
  on public.maintenance_provider_users
  for select
  to authenticated
  using (
    public.is_system_owner()
    or user_id = auth.uid()
    or public.has_organization_permission_for_provider(
      auth.uid(),
      provider_id,
      'maintenance_providers.manage'
    )
  );

drop policy if exists maintenance_providers_select_authorized
  on public.maintenance_providers;
create policy maintenance_providers_select_authorized
  on public.maintenance_providers
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.maintenance_partner_has_provider_access(id)
    or exists (
      select 1
      from public.maintenance_provider_organizations mpo
      where mpo.provider_id = maintenance_providers.id
        and (
          public.has_current_user_organization_permission(mpo.organization_id, 'maintenance_providers.view')
          or public.has_current_user_organization_permission(mpo.organization_id, 'maintenance_providers.manage')
          or public.has_current_user_organization_permission(mpo.organization_id, 'maintenance_jobs.view')
          or public.has_current_user_organization_permission(mpo.organization_id, 'maintenance_jobs.assign')
        )
    )
  );

drop policy if exists organization_shift_assignments_select_scoped
  on public.organization_shift_assignments;
create policy organization_shift_assignments_select_scoped
  on public.organization_shift_assignments
  for select
  to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'shifts.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      join public.organization_shift_templates ost
        on ost.id = organization_shift_assignments.shift_template_id
       and ost.organization_id = organization_shift_assignments.organization_id
       and ost.published_at is not null
       and ost.is_active = true
       and ost.archived_at is null
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.id = organization_shift_assignments.driver_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );

drop policy if exists organization_shift_templates_select_scoped
  on public.organization_shift_templates;
create policy organization_shift_templates_select_scoped
  on public.organization_shift_templates
  for select
  to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'shifts.view')
    or (
      published_at is not null
      and is_active = true
      and archived_at is null
      and exists (
        select 1
        from public.drivers d
        join public.profiles p on p.id = d.auth_user_id
        where p.id = auth.uid()
          and d.organization_id = organization_shift_templates.organization_id
          and p.role = 'driver'::public.app_role
          and p.status = 'active'::public.account_status
          and p.deleted_at is null
          and p.must_change_password = false
          and d.status = 'active'::public.driver_status
          and d.deleted_at is null
      )
    )
  );

revoke all on function public.has_organization_permission(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_organization_permission(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
