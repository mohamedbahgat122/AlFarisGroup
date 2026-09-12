-- Fix Order Work Shift admin SELECT policies to use the hardened
-- current-user permission helper. No data or write policy changes.

drop policy if exists organization_order_period_templates_select_scoped
  on public.organization_order_period_templates;
create policy organization_order_period_templates_select_scoped
  on public.organization_order_period_templates
  for select to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'order_periods.view')
    or exists (
      select 1
      from public.organization_order_period_assignments a
      join public.drivers d on d.id = a.driver_id
      join public.profiles p on p.id = d.auth_user_id
      where a.order_period_template_id = organization_order_period_templates.id
        and a.is_active = true
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
  );

drop policy if exists organization_order_period_assignments_select_scoped
  on public.organization_order_period_assignments;
create policy organization_order_period_assignments_select_scoped
  on public.organization_order_period_assignments
  for select to authenticated
  using (
    public.has_current_user_organization_permission(organization_id, 'order_periods.view')
    or exists (
      select 1
      from public.drivers d
      join public.profiles p on p.id = d.auth_user_id
      where d.id = organization_order_period_assignments.driver_id
        and p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.organization_id = organization_order_period_assignments.organization_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
        and d.settlement_type = 'per_order'::public.driver_settlement_type
    )
  );
