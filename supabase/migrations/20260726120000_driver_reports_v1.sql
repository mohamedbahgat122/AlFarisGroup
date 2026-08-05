-- Drivers Reports V1: daily Keeta report snapshots.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_report_attendance_status'
  ) then
    create type public.driver_report_attendance_status as enum ('present', 'absent');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_report_eligibility_status'
  ) then
    create type public.driver_report_eligibility_status as enum ('eligible', 'not_eligible');
  end if;
end;
$$;

create table if not exists public.driver_daily_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  report_date date not null,
  imported_by_user_id uuid null
    references public.profiles(id)
    on delete set null,
  imported_at timestamptz not null default now(),
  registered_active_drivers integer not null,
  present_drivers integer not null,
  absent_drivers integer not null,
  matched_ranking_rows integer not null,
  unmatched_performance_ids text[] not null default '{}'::text[],
  unmatched_ranking_ids text[] not null default '{}'::text[],
  drivers_missing_keeta_id integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_daily_reports_organization_date_key unique (organization_id, report_date),
  constraint driver_daily_reports_counts_non_negative check (
    registered_active_drivers >= 0
    and present_drivers >= 0
    and absent_drivers >= 0
    and matched_ranking_rows >= 0
    and drivers_missing_keeta_id >= 0
  ),
  constraint driver_daily_reports_attendance_count check (
    present_drivers + absent_drivers = registered_active_drivers
  )
);

create table if not exists public.driver_daily_report_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null
    references public.driver_daily_reports(id)
    on delete cascade,
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  report_date date not null,
  driver_id uuid not null
    references public.drivers(id)
    on delete restrict,
  driver_full_name text not null,
  keeta_driver_id text null,
  attendance_status public.driver_report_attendance_status not null,
  accepted_tasks integer not null default 0,
  delivered_tasks integer not null default 0,
  rejected_tasks integer not null default 0,
  valid_online_seconds integer not null default 0,
  delivery_rate numeric(7,6) null,
  level text null,
  city_ranking integer null,
  on_time_rate numeric(7,6) null,
  incomplete_orders integer not null default 0,
  eligibility_status public.driver_report_eligibility_status null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_daily_report_rows_report_driver_key unique (report_id, driver_id),
  constraint driver_daily_report_rows_name_not_blank check (length(btrim(driver_full_name)) between 1 and 160),
  constraint driver_daily_report_rows_keeta_id_not_blank check (
    keeta_driver_id is null or length(btrim(keeta_driver_id)) between 1 and 120
  ),
  constraint driver_daily_report_rows_level_value check (
    level is null or level in ('A', 'B', 'C', 'D')
  ),
  constraint driver_daily_report_rows_counts_non_negative check (
    accepted_tasks >= 0
    and delivered_tasks >= 0
    and rejected_tasks >= 0
    and valid_online_seconds >= 0
    and incomplete_orders >= 0
  ),
  constraint driver_daily_report_rows_ratios_valid check (
    (delivery_rate is null or (delivery_rate >= 0 and delivery_rate <= 1))
    and (on_time_rate is null or (on_time_rate >= 0 and on_time_rate <= 1))
  ),
  constraint driver_daily_report_rows_city_ranking_positive check (
    city_ranking is null or city_ranking > 0
  )
);

create index if not exists driver_daily_reports_organization_date_idx
  on public.driver_daily_reports (organization_id, report_date desc);

create index if not exists driver_daily_report_rows_report_idx
  on public.driver_daily_report_rows (report_id, driver_full_name);

create index if not exists driver_daily_report_rows_organization_date_idx
  on public.driver_daily_report_rows (organization_id, report_date, driver_full_name);

create or replace function public.set_driver_reports_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_driver_daily_reports_updated_at on public.driver_daily_reports;
create trigger set_driver_daily_reports_updated_at
  before update on public.driver_daily_reports
  for each row
  execute function public.set_driver_reports_updated_at();

drop trigger if exists set_driver_daily_report_rows_updated_at on public.driver_daily_report_rows;
create trigger set_driver_daily_report_rows_updated_at
  before update on public.driver_daily_report_rows
  for each row
  execute function public.set_driver_reports_updated_at();

alter table public.driver_daily_reports enable row level security;
alter table public.driver_daily_report_rows enable row level security;

revoke all on public.driver_daily_reports from anon, authenticated;
revoke all on public.driver_daily_report_rows from anon, authenticated;
grant select on public.driver_daily_reports to authenticated;
grant select on public.driver_daily_report_rows to authenticated;

drop policy if exists driver_daily_reports_select_viewable_organization
  on public.driver_daily_reports;
create policy driver_daily_reports_select_viewable_organization
  on public.driver_daily_reports
  for select
  to authenticated
  using (public.can_view_organization(organization_id));

drop policy if exists driver_daily_report_rows_select_viewable_organization
  on public.driver_daily_report_rows;
create policy driver_daily_report_rows_select_viewable_organization
  on public.driver_daily_report_rows
  for select
  to authenticated
  using (public.can_view_organization(organization_id));

create or replace function public.import_driver_daily_report(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_report_date date,
  p_summary jsonb,
  p_rows jsonb,
  p_replace_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
  v_existing_report_id uuid;
  v_row jsonb;
  v_attendance_status public.driver_report_attendance_status;
  v_eligibility_status public.driver_report_eligibility_status;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  if p_report_date is null then
    raise exception 'Driver report import failed: report date is required.';
  end if;

  if jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'Driver report import failed: summary must be an object.';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Driver report import failed: rows must be an array.';
  end if;

  select id into v_existing_report_id
  from public.driver_daily_reports
  where organization_id = p_organization_id
    and report_date = p_report_date
  for update;

  if v_existing_report_id is not null and not p_replace_existing then
    raise exception 'Driver report import failed: duplicate saved report.';
  end if;

  if v_existing_report_id is not null then
    delete from public.driver_daily_reports
    where id = v_existing_report_id;
  end if;

  insert into public.driver_daily_reports (
    organization_id,
    report_date,
    imported_by_user_id,
    registered_active_drivers,
    present_drivers,
    absent_drivers,
    matched_ranking_rows,
    unmatched_performance_ids,
    unmatched_ranking_ids,
    drivers_missing_keeta_id
  )
  values (
    p_organization_id,
    p_report_date,
    p_actor_user_id,
    coalesce((p_summary ->> 'registeredActiveDrivers')::integer, 0),
    coalesce((p_summary ->> 'presentDrivers')::integer, 0),
    coalesce((p_summary ->> 'absentDrivers')::integer, 0),
    coalesce((p_summary ->> 'matchedRankingRows')::integer, 0),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(p_summary -> 'unmatchedPerformanceIds', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(coalesce(p_summary -> 'unmatchedRankingIds', '[]'::jsonb))),
      '{}'::text[]
    ),
    coalesce((p_summary ->> 'driversMissingKeetaId')::integer, 0)
  )
  returning id into v_report_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_attendance_status := (v_row ->> 'attendanceStatus')::public.driver_report_attendance_status;
    v_eligibility_status := nullif(v_row ->> 'eligibilityStatus', '')::public.driver_report_eligibility_status;

    insert into public.driver_daily_report_rows (
      report_id,
      organization_id,
      report_date,
      driver_id,
      driver_full_name,
      keeta_driver_id,
      attendance_status,
      accepted_tasks,
      delivered_tasks,
      rejected_tasks,
      valid_online_seconds,
      delivery_rate,
      level,
      city_ranking,
      on_time_rate,
      incomplete_orders,
      eligibility_status
    )
    values (
      v_report_id,
      p_organization_id,
      p_report_date,
      (v_row ->> 'driverId')::uuid,
      btrim(v_row ->> 'driverFullName'),
      nullif(btrim(coalesce(v_row ->> 'keetaDriverId', '')), ''),
      v_attendance_status,
      coalesce((v_row ->> 'acceptedTasks')::integer, 0),
      coalesce((v_row ->> 'deliveredTasks')::integer, 0),
      coalesce((v_row ->> 'rejectedTasks')::integer, 0),
      coalesce((v_row ->> 'validOnlineSeconds')::integer, 0),
      nullif(v_row ->> 'deliveryRate', '')::numeric,
      nullif(btrim(coalesce(v_row ->> 'level', '')), ''),
      nullif(v_row ->> 'cityRanking', '')::integer,
      nullif(v_row ->> 'onTimeRate', '')::numeric,
      coalesce((v_row ->> 'incompleteOrders')::integer, 0),
      v_eligibility_status
    );
  end loop;

  insert into public.activity_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_actor_user_id,
    p_organization_id,
    'driver_report_imported',
    'driver_daily_report',
    v_report_id,
    jsonb_build_object(
      'report_date', p_report_date,
      'registered_active_drivers', coalesce((p_summary ->> 'registeredActiveDrivers')::integer, 0),
      'present_drivers', coalesce((p_summary ->> 'presentDrivers')::integer, 0),
      'absent_drivers', coalesce((p_summary ->> 'absentDrivers')::integer, 0),
      'replaced_existing', p_replace_existing
    )
  );

  return v_report_id;
end;
$$;

revoke all on function public.import_driver_daily_report(uuid, uuid, date, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.import_driver_daily_report(uuid, uuid, date, jsonb, jsonb, boolean)
  to service_role;

grant select on table public.drivers to service_role;
grant select on table public.profiles to service_role;
