create or replace function public.maintenance_partner_can_read_stock_item(
  p_provider_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.maintenance_partner_has_provider_access(p_provider_id)
    and exists (
      select 1
      from public.maintenance_providers mp
      where mp.id = p_provider_id
        and mp.is_active = true
    )
    and exists (
      select 1
      from public.maintenance_provider_organizations mpo
      where mpo.provider_id = p_provider_id
        and mpo.organization_id = p_organization_id
        and mpo.is_active = true
    );
$$;

drop policy if exists maintenance_stock_items_provider_select_authorized
  on public.maintenance_stock_items;
create policy maintenance_stock_items_provider_select_authorized
  on public.maintenance_stock_items
  for select
  to authenticated
  using (
    is_active = true
    and archived_at is null
    and public.maintenance_partner_can_read_stock_item(provider_id, organization_id)
  );

revoke all on function public.maintenance_partner_can_read_stock_item(uuid, uuid)
  from public, anon;
grant execute on function public.maintenance_partner_can_read_stock_item(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
