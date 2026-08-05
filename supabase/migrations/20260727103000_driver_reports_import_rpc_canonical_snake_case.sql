-- Drivers Reports: replace the callable import RPC with one canonical snake_case JSON payload parser.

drop function if exists public.import_driver_daily_report(
  uuid,
  uuid,
  date,
  jsonb,
  jsonb,
  boolean
);

create function public.import_driver_daily_report(
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

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      driver_id uuid,
      driver_full_name text,
      keeta_driver_id text,
      attendance_status text,
      accepted_tasks integer,
      delivered_tasks integer,
      rejected_tasks integer,
      valid_online_seconds integer,
      delivery_rate numeric,
      level text,
      city_ranking integer,
      ranking_percentage numeric,
      mandatory_assignment_score numeric,
      estimated_reward_amount numeric,
      evaluation_on_time_rate numeric,
      evaluation_completion_rate numeric,
      not_early_delivery_confirmation_rate numeric,
      evaluation_total_orders integer,
      on_time_rate numeric,
      incomplete_orders integer,
      eligibility_status text
    )
    where row_data.driver_id is null
  ) then
    raise exception 'Driver report import failed: row driver_id is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      driver_id uuid,
      driver_full_name text,
      keeta_driver_id text,
      attendance_status text,
      accepted_tasks integer,
      delivered_tasks integer,
      rejected_tasks integer,
      valid_online_seconds integer,
      delivery_rate numeric,
      level text,
      city_ranking integer,
      ranking_percentage numeric,
      mandatory_assignment_score numeric,
      estimated_reward_amount numeric,
      evaluation_on_time_rate numeric,
      evaluation_completion_rate numeric,
      not_early_delivery_confirmation_rate numeric,
      evaluation_total_orders integer,
      on_time_rate numeric,
      incomplete_orders integer,
      eligibility_status text
    )
    group by row_data.driver_id
    having count(*) > 1
  ) then
    raise exception 'Driver report import failed: duplicate driver row.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      driver_id uuid,
      driver_full_name text,
      keeta_driver_id text,
      attendance_status text,
      accepted_tasks integer,
      delivered_tasks integer,
      rejected_tasks integer,
      valid_online_seconds integer,
      delivery_rate numeric,
      level text,
      city_ranking integer,
      ranking_percentage numeric,
      mandatory_assignment_score numeric,
      estimated_reward_amount numeric,
      evaluation_on_time_rate numeric,
      evaluation_completion_rate numeric,
      not_early_delivery_confirmation_rate numeric,
      evaluation_total_orders integer,
      on_time_rate numeric,
      incomplete_orders integer,
      eligibility_status text
    )
    left join public.drivers d
      on d.id = row_data.driver_id
      and d.organization_id = p_organization_id
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
    where d.id is null
  ) then
    raise exception 'Driver report import failed: row driver_id is not active for this organization.';
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
    ranking_percentage,
    mandatory_assignment_score,
    estimated_reward_amount,
    evaluation_on_time_rate,
    evaluation_completion_rate,
    not_early_delivery_confirmation_rate,
    evaluation_total_orders,
    on_time_rate,
    incomplete_orders,
    eligibility_status
  )
  select
    v_report_id,
    p_organization_id,
    p_report_date,
    row_data.driver_id,
    btrim(row_data.driver_full_name),
    nullif(btrim(coalesce(row_data.keeta_driver_id, '')), ''),
    row_data.attendance_status::public.driver_report_attendance_status,
    coalesce(row_data.accepted_tasks, 0),
    coalesce(row_data.delivered_tasks, 0),
    coalesce(row_data.rejected_tasks, 0),
    coalesce(row_data.valid_online_seconds, 0),
    row_data.delivery_rate,
    nullif(btrim(coalesce(row_data.level, '')), ''),
    row_data.city_ranking,
    row_data.ranking_percentage,
    row_data.mandatory_assignment_score,
    row_data.estimated_reward_amount,
    row_data.evaluation_on_time_rate,
    row_data.evaluation_completion_rate,
    row_data.not_early_delivery_confirmation_rate,
    row_data.evaluation_total_orders,
    row_data.on_time_rate,
    coalesce(row_data.incomplete_orders, 0),
    nullif(row_data.eligibility_status, '')::public.driver_report_eligibility_status
  from jsonb_to_recordset(p_rows) as row_data(
    driver_id uuid,
    driver_full_name text,
    keeta_driver_id text,
    attendance_status text,
    accepted_tasks integer,
    delivered_tasks integer,
    rejected_tasks integer,
    valid_online_seconds integer,
    delivery_rate numeric,
    level text,
    city_ranking integer,
    ranking_percentage numeric,
    mandatory_assignment_score numeric,
    estimated_reward_amount numeric,
    evaluation_on_time_rate numeric,
    evaluation_completion_rate numeric,
    not_early_delivery_confirmation_rate numeric,
    evaluation_total_orders integer,
    on_time_rate numeric,
    incomplete_orders integer,
    eligibility_status text
  );

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
      'replaced_existing', p_replace_existing,
      'extended_ranking_metrics_imported', true
    )
  );

  return v_report_id;
end;
$$;

revoke all on function public.import_driver_daily_report(uuid, uuid, date, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.import_driver_daily_report(uuid, uuid, date, jsonb, jsonb, boolean)
  to service_role;
