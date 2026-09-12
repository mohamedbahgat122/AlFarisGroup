-- Create RPC for Global Fleet KPI summary
create or replace function public.get_global_fleet_summary(p_category text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    jsonb_build_object(
      'total', count(*),
      'healthy', count(*) filter (where archived_at is null and technical_status = 'healthy'),
      'accident', count(*) filter (where archived_at is null and technical_status = 'accident'),
      'maintenance', count(*) filter (where archived_at is null and fault_location = 'in_maintenance'),
      'operationalActive', count(*) filter (where archived_at is null and operational_status = 'active'),
      'operationalSuspended', count(*) filter (where archived_at is null and operational_status = 'suspended'),
      'archived', count(*) filter (where archived_at is not null)
    )
  from public.fleet_vehicles
  where vehicle_category = p_category
    and public.can_view_organization(organization_id);
$$;

revoke all on function public.get_global_fleet_summary(text) from public, anon;
grant execute on function public.get_global_fleet_summary(text) to authenticated;

-- Add justified index for global list query
create index if not exists fleet_vehicles_category_archived_idx
  on public.fleet_vehicles (vehicle_category, archived_at);

-- Configure Replica Identity for Realtime
alter table public.fleet_vehicles replica identity full;

-- Enable Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fleet_vehicles'
    ) then
      alter publication supabase_realtime add table public.fleet_vehicles;
    end if;
  end if;
end
$$;
