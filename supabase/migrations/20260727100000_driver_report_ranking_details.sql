-- Drivers Reports: extended Keeta Ranking Report metrics per driver row.

alter table public.driver_daily_report_rows
  add column if not exists ranking_percentage numeric null,
  add column if not exists mandatory_assignment_score numeric null,
  add column if not exists estimated_reward_amount numeric null,
  add column if not exists evaluation_on_time_rate numeric null,
  add column if not exists evaluation_completion_rate numeric null,
  add column if not exists not_early_delivery_confirmation_rate numeric null,
  add column if not exists evaluation_total_orders integer null;

alter table public.driver_daily_report_rows
  drop constraint if exists driver_daily_report_rows_ranking_percentage_valid,
  add constraint driver_daily_report_rows_ranking_percentage_valid check (
    ranking_percentage is null
    or (ranking_percentage >= 0 and ranking_percentage <= 1)
  ),
  drop constraint if exists driver_daily_report_rows_mandatory_assignment_score_valid,
  add constraint driver_daily_report_rows_mandatory_assignment_score_valid check (
    mandatory_assignment_score is null or mandatory_assignment_score >= 0
  ),
  drop constraint if exists driver_daily_report_rows_estimated_reward_amount_valid,
  add constraint driver_daily_report_rows_estimated_reward_amount_valid check (
    estimated_reward_amount is null or estimated_reward_amount >= 0
  ),
  drop constraint if exists driver_daily_report_rows_evaluation_on_time_rate_valid,
  add constraint driver_daily_report_rows_evaluation_on_time_rate_valid check (
    evaluation_on_time_rate is null
    or (evaluation_on_time_rate >= 0 and evaluation_on_time_rate <= 1)
  ),
  drop constraint if exists driver_daily_report_rows_evaluation_completion_rate_valid,
  add constraint driver_daily_report_rows_evaluation_completion_rate_valid check (
    evaluation_completion_rate is null
    or (evaluation_completion_rate >= 0 and evaluation_completion_rate <= 1)
  ),
  drop constraint if exists driver_daily_report_rows_not_early_delivery_confirmation_rate_valid,
  add constraint driver_daily_report_rows_not_early_delivery_confirmation_rate_valid check (
    not_early_delivery_confirmation_rate is null
    or (
      not_early_delivery_confirmation_rate >= 0
      and not_early_delivery_confirmation_rate <= 1
    )
  ),
  drop constraint if exists driver_daily_report_rows_evaluation_total_orders_valid,
  add constraint driver_daily_report_rows_evaluation_total_orders_valid check (
    evaluation_total_orders is null or evaluation_total_orders >= 0
  );

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
  v_driver_id uuid;
  v_seen_driver_ids uuid[] := '{}'::uuid[];
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

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_driver_id := (v_row ->> 'driver_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Driver report import failed: row driver_id is invalid.';
    end;

    if v_driver_id is null then
      raise exception 'Driver report import failed: row driver_id is required.';
    end if;

    if array_position(v_seen_driver_ids, v_driver_id) is not null then
      raise exception 'Driver report import failed: duplicate driver row.';
    end if;

    if not exists (
      select 1
      from public.drivers d
      where d.id = v_driver_id
        and d.organization_id = p_organization_id
        and d.status = 'active'
        and d.deleted_at is null
    ) then
      raise exception 'Driver report import failed: row driver_id is not active for this organization.';
    end if;

    v_seen_driver_ids := array_append(v_seen_driver_ids, v_driver_id);
  end loop;

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
    v_attendance_status := (v_row ->> 'attendance_status')::public.driver_report_attendance_status;
    v_eligibility_status := nullif(v_row ->> 'eligibility_status', '')::public.driver_report_eligibility_status;

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
    values (
      v_report_id,
      p_organization_id,
      p_report_date,
      (v_row ->> 'driver_id')::uuid,
      btrim(v_row ->> 'driver_full_name'),
      nullif(btrim(coalesce(v_row ->> 'keeta_driver_id', '')), ''),
      v_attendance_status,
      coalesce((v_row ->> 'accepted_tasks')::integer, 0),
      coalesce((v_row ->> 'delivered_tasks')::integer, 0),
      coalesce((v_row ->> 'rejected_tasks')::integer, 0),
      coalesce((v_row ->> 'valid_online_seconds')::integer, 0),
      nullif(v_row ->> 'delivery_rate', '')::numeric,
      nullif(btrim(coalesce(v_row ->> 'level', '')), ''),
      nullif(v_row ->> 'city_ranking', '')::integer,
      nullif(v_row ->> 'ranking_percentage', '')::numeric,
      nullif(v_row ->> 'mandatory_assignment_score', '')::numeric,
      nullif(v_row ->> 'estimated_reward_amount', '')::numeric,
      nullif(v_row ->> 'evaluation_on_time_rate', '')::numeric,
      nullif(v_row ->> 'evaluation_completion_rate', '')::numeric,
      nullif(v_row ->> 'not_early_delivery_confirmation_rate', '')::numeric,
      nullif(v_row ->> 'evaluation_total_orders', '')::integer,
      nullif(v_row ->> 'on_time_rate', '')::numeric,
      coalesce((v_row ->> 'incomplete_orders')::integer, 0),
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
