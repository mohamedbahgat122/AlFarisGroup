-- Create RPC for Drivers KPI summary
create or replace function public.get_drivers_summary(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with business_dates as (
    select
      (now() at time zone 'Asia/Riyadh')::date as today,
      ((now() + interval '10 days') at time zone 'Asia/Riyadh')::date as threshold_date
  )
  select
    jsonb_build_object(
      'total', count(*),
      'active', count(*) filter (where status = 'active' and deleted_at is null),
      'inactive', count(*) filter (where status != 'active' and deleted_at is null),
      'archived', count(*) filter (where deleted_at is not null),
      'expired', count(*) filter (
        where deleted_at is null and (
          iqama_expiry_date <= (select today from business_dates) or
          driving_license_expiry_date <= (select today from business_dates) or
          driver_card_expiry_date <= (select today from business_dates) or
          vehicle_authorization_expiry_date <= (select today from business_dates) or
          operating_card_expiry_date <= (select today from business_dates)
        )
      ),
      'expiring_soon', count(*) filter (
        where deleted_at is null and (
          iqama_expiry_date <= (select threshold_date from business_dates) or
          driving_license_expiry_date <= (select threshold_date from business_dates) or
          driver_card_expiry_date <= (select threshold_date from business_dates) or
          vehicle_authorization_expiry_date <= (select threshold_date from business_dates) or
          operating_card_expiry_date <= (select threshold_date from business_dates)
        ) and not (
          iqama_expiry_date <= (select today from business_dates) or
          driving_license_expiry_date <= (select today from business_dates) or
          driver_card_expiry_date <= (select today from business_dates) or
          vehicle_authorization_expiry_date <= (select today from business_dates) or
          operating_card_expiry_date <= (select today from business_dates)
        )
      )
    )
  from public.drivers
  where organization_id = p_organization_id
    and public.can_view_organization(organization_id);
$$;

revoke all on function public.get_drivers_summary(uuid) from public, anon;
grant execute on function public.get_drivers_summary(uuid) to authenticated;

-- Configure Replica Identity for Realtime
alter table public.drivers replica identity full;

-- Enable Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'drivers'
    ) then
      alter publication supabase_realtime add table public.drivers;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
