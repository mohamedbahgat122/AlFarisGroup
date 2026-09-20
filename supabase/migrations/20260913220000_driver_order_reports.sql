-- Dedicated daily Order Reports storage and transactional import.
create table if not exists public.driver_order_daily_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_date date not null,
  imported_by_user_id uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unmatched_driver_ids text[] not null default '{}',
  invalid_row_count integer not null default 0 check (invalid_row_count >= 0),
  unique (organization_id, report_date)
);

create table if not exists public.driver_order_daily_report_rows (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.driver_order_daily_reports(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade, report_date date not null,
  driver_id uuid not null references public.drivers(id) on delete restrict, driver_full_name text not null, keeta_driver_id text not null,
  supervisor text, vehicle_type text, courier_type text, attendance_summary text, on_shift text, eligible_partner text,
  driver_connection_duration text, valid_online_duration text, peak_online_duration text,
  accepted_tasks numeric not null default 0, restaurant_tasks numeric not null default 0, delivered_tasks numeric not null default 0,
  large_completed_tasks numeric not null default 0, rejected_tasks numeric not null default 0, driver_rejected_tasks numeric not null default 0,
  automatic_rejected_tasks numeric not null default 0, delivery_cancellation_rate numeric, non_delivery_completion_rate numeric,
  on_time_delivery_rate numeric, large_order_on_time_rate numeric, average_delivery_duration numeric, over_55_minutes_rate numeric,
  late_tasks numeric not null default 0, very_late_tasks numeric not null default 0, source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (report_id, driver_id)
);
create index if not exists driver_order_daily_reports_org_date_idx on public.driver_order_daily_reports(organization_id, report_date desc);
create index if not exists driver_order_daily_report_rows_report_idx on public.driver_order_daily_report_rows(report_id, driver_full_name);
alter table public.driver_order_daily_reports enable row level security;
alter table public.driver_order_daily_report_rows enable row level security;
revoke all on public.driver_order_daily_reports, public.driver_order_daily_report_rows from anon, authenticated;
grant select on public.driver_order_daily_reports, public.driver_order_daily_report_rows to authenticated;
create policy driver_order_daily_reports_select on public.driver_order_daily_reports for select to authenticated using (public.can_view_organization(organization_id));
create policy driver_order_daily_report_rows_select on public.driver_order_daily_report_rows for select to authenticated using (public.can_view_organization(organization_id));

create or replace function public.set_driver_order_reports_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger driver_order_daily_reports_updated_at before update on public.driver_order_daily_reports for each row execute function public.set_driver_order_reports_updated_at();
create trigger driver_order_daily_report_rows_updated_at before update on public.driver_order_daily_report_rows for each row execute function public.set_driver_order_reports_updated_at();
revoke all on function public.set_driver_order_reports_updated_at() from public, anon, authenticated;

create or replace function public.import_driver_order_daily_report(
  p_actor_user_id uuid, p_organization_id uuid, p_report_date date, p_rows jsonb,
  p_unmatched_driver_ids text[] default '{}', p_invalid_row_count integer default 0, p_replace_existing boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_report_id uuid;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);
  if p_report_date is null or jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Invalid order report payload'; end if;
  if p_invalid_row_count is null or p_invalid_row_count < 0 then raise exception 'Invalid order report row count'; end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) x(driver_id uuid)
    left join public.drivers d on d.id = x.driver_id and d.organization_id = p_organization_id and d.status = 'active' and d.deleted_at is null
    where x.driver_id is null or d.id is null
  ) then raise exception 'Order report contains an invalid driver'; end if;
  select id into v_report_id from public.driver_order_daily_reports where organization_id = p_organization_id and report_date = p_report_date for update;
  if v_report_id is not null and not p_replace_existing then raise exception 'Duplicate saved order report'; end if;
  if v_report_id is not null then delete from public.driver_order_daily_reports where id = v_report_id; end if;
  insert into public.driver_order_daily_reports(organization_id, report_date, imported_by_user_id, unmatched_driver_ids, invalid_row_count)
  values(p_organization_id, p_report_date, p_actor_user_id, coalesce(p_unmatched_driver_ids, '{}'), coalesce(p_invalid_row_count, 0)) returning id into v_report_id;
  insert into public.driver_order_daily_report_rows(report_id, organization_id, report_date, driver_id, driver_full_name, keeta_driver_id, supervisor, vehicle_type, courier_type, attendance_summary, on_shift, eligible_partner, driver_connection_duration, valid_online_duration, peak_online_duration, accepted_tasks, restaurant_tasks, delivered_tasks, large_completed_tasks, rejected_tasks, driver_rejected_tasks, automatic_rejected_tasks, delivery_cancellation_rate, non_delivery_completion_rate, on_time_delivery_rate, large_order_on_time_rate, average_delivery_duration, over_55_minutes_rate, late_tasks, very_late_tasks, source_data)
  select v_report_id, p_organization_id, p_report_date, x.driver_id, x.driver_full_name, x.keeta_driver_id, x.supervisor, x.vehicle_type, x.courier_type, x.attendance_summary, x.on_shift, x.eligible_partner, x.driver_connection_duration, x.valid_online_duration, x.peak_online_duration, x.accepted_tasks, x.restaurant_tasks, x.delivered_tasks, x.large_completed_tasks, x.rejected_tasks, x.driver_rejected_tasks, x.automatic_rejected_tasks, x.delivery_cancellation_rate, x.non_delivery_completion_rate, x.on_time_delivery_rate, x.large_order_on_time_rate, x.average_delivery_duration, x.over_55_minutes_rate, x.late_tasks, x.very_late_tasks, x.source_data
  from jsonb_to_recordset(p_rows) x(driver_id uuid, driver_full_name text, keeta_driver_id text, supervisor text, vehicle_type text, courier_type text, attendance_summary text, on_shift text, eligible_partner text, driver_connection_duration text, valid_online_duration text, peak_online_duration text, accepted_tasks numeric, restaurant_tasks numeric, delivered_tasks numeric, large_completed_tasks numeric, rejected_tasks numeric, driver_rejected_tasks numeric, automatic_rejected_tasks numeric, delivery_cancellation_rate numeric, non_delivery_completion_rate numeric, on_time_delivery_rate numeric, large_order_on_time_rate numeric, average_delivery_duration numeric, over_55_minutes_rate numeric, late_tasks numeric, very_late_tasks numeric, source_data jsonb);
  insert into public.activity_logs(actor_user_id, organization_id, action, entity_type, entity_id, metadata) values(p_actor_user_id, p_organization_id, 'driver_order_report_imported', 'driver_order_daily_report', v_report_id, jsonb_build_object('report_date', p_report_date, 'replaced_existing', p_replace_existing));
  return v_report_id;
end; $$;
revoke all on function public.import_driver_order_daily_report(uuid, uuid, date, jsonb, text[], integer, boolean) from public, anon, authenticated;
grant execute on function public.import_driver_order_daily_report(uuid, uuid, date, jsonb, text[], integer, boolean) to service_role;
