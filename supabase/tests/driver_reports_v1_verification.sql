-- Read-only verification for Drivers Reports V1.

select
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in ('driver_daily_reports', 'driver_daily_report_rows')
order by table_name;

select
  typname as enum_name,
  array_agg(enumlabel order by enumsortorder) as enum_values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and typname in (
    'driver_report_attendance_status',
    'driver_report_eligibility_status'
  )
group by typname
order by typname;

select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.driver_daily_reports'::regclass,
    'public.driver_daily_report_rows'::regclass
  )
order by table_name, conname;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('driver_daily_reports', 'driver_daily_report_rows')
order by tablename, indexname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('driver_daily_reports', 'driver_daily_report_rows')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('driver_daily_reports', 'driver_daily_report_rows')
order by tablename, policyname;

select
  p.proname,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('import_driver_daily_report', 'set_driver_reports_updated_at')
order by p.proname;

select
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('driver_daily_reports', 'driver_daily_report_rows')
order by event_object_table, trigger_name;

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'import_driver_daily_report'
order by grantee, privilege_type;

select
  table_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'driver_daily_reports',
    'driver_daily_report_rows',
    'drivers',
    'profiles'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_name, grantee, privilege_type;

select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('driver_daily_reports', 'driver_daily_report_rows')
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
order by tablename, policyname;

select
  count(*) as report_count
from public.driver_daily_reports;

select
  count(*) as report_row_count
from public.driver_daily_report_rows;

select
  count(*) as active_driver_count_after_report_migration
from public.drivers
where status = 'active'::public.driver_status
  and deleted_at is null;
