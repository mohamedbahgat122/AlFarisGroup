-- Allow authorized Admin reads of persisted Order Shift operational policies.
-- The 09140000 RPC writes through SECURITY DEFINER, but the Admin query uses
-- the authenticated client and therefore needs an explicit SELECT policy.

drop policy if exists order_period_operational_policies_select_viewable_organization
  on public.organization_order_period_operational_policies;

create policy order_period_operational_policies_select_viewable_organization
  on public.organization_order_period_operational_policies
  for select
  to authenticated
  using (public.can_view_organization(organization_id));
