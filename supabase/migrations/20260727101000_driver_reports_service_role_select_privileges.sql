-- Drivers Reports: allow service-role import preflight reads.

grant select on table public.driver_daily_reports to service_role;

do $$
begin
  if to_regclass('public.driver_report_imports') is not null then
    grant select on table public.driver_report_imports to service_role;
  end if;
end;
$$;
