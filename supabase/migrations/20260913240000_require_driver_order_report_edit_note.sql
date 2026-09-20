-- Require a correction note for every manual Order Report row edit.
revoke all on function public.update_driver_order_daily_report_row(
  uuid, uuid, uuid, uuid, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated, service_role;

drop function public.update_driver_order_daily_report_row(
  uuid, uuid, uuid, uuid, timestamptz, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
);

create function public.update_driver_order_daily_report_row(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_report_id uuid,
  p_row_id uuid,
  p_expected_updated_at timestamptz,
  p_edit_note text,
  p_valid_online_duration text,
  p_peak_online_duration text,
  p_accepted_tasks numeric,
  p_restaurant_tasks numeric,
  p_delivered_tasks numeric,
  p_large_completed_tasks numeric,
  p_rejected_tasks numeric,
  p_driver_rejected_tasks numeric,
  p_automatic_rejected_tasks numeric,
  p_delivery_cancellation_rate numeric,
  p_non_delivery_completion_rate numeric,
  p_on_time_delivery_rate numeric,
  p_large_order_on_time_rate numeric,
  p_average_delivery_duration numeric,
  p_over_55_minutes_rate numeric,
  p_late_tasks numeric,
  p_very_late_tasks numeric
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.driver_order_daily_report_rows%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_changed_fields jsonb;
  v_edit_note text := btrim(coalesce(p_edit_note, ''));
  v_updated_at timestamptz;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  if not public.has_organization_permission(
    p_actor_user_id,
    p_organization_id,
    'driver_order_reports.edit'
  ) then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_UNAUTHORIZED' using errcode = '42501';
  end if;

  if char_length(v_edit_note) < 3 then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_NOTE_REQUIRED' using errcode = '22023';
  end if;

  if char_length(v_edit_note) > 500 then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  if p_report_id is null or p_row_id is null or p_expected_updated_at is null then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_INVALID_CONTEXT' using errcode = '22023';
  end if;

  select r.* into v_row
  from public.driver_order_daily_report_rows r
  join public.driver_order_daily_reports report on report.id = r.report_id
  where r.id = p_row_id
    and r.report_id = p_report_id
    and r.organization_id = p_organization_id
    and report.organization_id = p_organization_id
  for update of r;

  if not found then
    raise exception 'DRIVER_ORDER_REPORT_ROW_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = v_row.driver_id and d.organization_id = p_organization_id
  ) then
    raise exception 'DRIVER_ORDER_REPORT_DRIVER_MISMATCH' using errcode = '23503';
  end if;

  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'DRIVER_ORDER_REPORT_ROW_STALE' using errcode = '40001';
  end if;

  if num_nonnulls(
    p_accepted_tasks, p_restaurant_tasks, p_delivered_tasks,
    p_large_completed_tasks, p_rejected_tasks, p_driver_rejected_tasks,
    p_automatic_rejected_tasks, p_late_tasks, p_very_late_tasks
  ) <> 9 or least(
    p_accepted_tasks, p_restaurant_tasks, p_delivered_tasks,
    p_large_completed_tasks, p_rejected_tasks, p_driver_rejected_tasks,
    p_automatic_rejected_tasks, p_late_tasks, p_very_late_tasks
  ) < 0 then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_INVALID_COUNT' using errcode = '22023';
  end if;

  if p_delivery_cancellation_rate < 0
    or p_non_delivery_completion_rate < 0
    or p_on_time_delivery_rate < 0
    or p_large_order_on_time_rate < 0
    or p_average_delivery_duration < 0
    or p_over_55_minutes_rate < 0 then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_INVALID_METRIC' using errcode = '22023';
  end if;

  if length(coalesce(p_valid_online_duration, '')) > 200
    or length(coalesce(p_peak_online_duration, '')) > 200 then
    raise exception 'DRIVER_ORDER_REPORT_EDIT_INVALID_DURATION' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'valid_online_duration', v_row.valid_online_duration,
    'peak_online_duration', v_row.peak_online_duration,
    'accepted_tasks', v_row.accepted_tasks,
    'restaurant_tasks', v_row.restaurant_tasks,
    'delivered_tasks', v_row.delivered_tasks,
    'large_completed_tasks', v_row.large_completed_tasks,
    'rejected_tasks', v_row.rejected_tasks,
    'driver_rejected_tasks', v_row.driver_rejected_tasks,
    'automatic_rejected_tasks', v_row.automatic_rejected_tasks,
    'delivery_cancellation_rate', v_row.delivery_cancellation_rate,
    'non_delivery_completion_rate', v_row.non_delivery_completion_rate,
    'on_time_delivery_rate', v_row.on_time_delivery_rate,
    'large_order_on_time_rate', v_row.large_order_on_time_rate,
    'average_delivery_duration', v_row.average_delivery_duration,
    'over_55_minutes_rate', v_row.over_55_minutes_rate,
    'late_tasks', v_row.late_tasks,
    'very_late_tasks', v_row.very_late_tasks
  );

  update public.driver_order_daily_report_rows
  set valid_online_duration = nullif(btrim(p_valid_online_duration), ''),
      peak_online_duration = nullif(btrim(p_peak_online_duration), ''),
      accepted_tasks = p_accepted_tasks,
      restaurant_tasks = p_restaurant_tasks,
      delivered_tasks = p_delivered_tasks,
      large_completed_tasks = p_large_completed_tasks,
      rejected_tasks = p_rejected_tasks,
      driver_rejected_tasks = p_driver_rejected_tasks,
      automatic_rejected_tasks = p_automatic_rejected_tasks,
      delivery_cancellation_rate = p_delivery_cancellation_rate,
      non_delivery_completion_rate = p_non_delivery_completion_rate,
      on_time_delivery_rate = p_on_time_delivery_rate,
      large_order_on_time_rate = p_large_order_on_time_rate,
      average_delivery_duration = p_average_delivery_duration,
      over_55_minutes_rate = p_over_55_minutes_rate,
      late_tasks = p_late_tasks,
      very_late_tasks = p_very_late_tasks
  where id = p_row_id
  returning updated_at into v_updated_at;

  select to_jsonb(r) - array[
    'id', 'report_id', 'organization_id', 'report_date', 'driver_id',
    'driver_full_name', 'keeta_driver_id', 'supervisor', 'vehicle_type',
    'courier_type', 'attendance_summary', 'on_shift', 'eligible_partner',
    'driver_connection_duration', 'source_data', 'created_at', 'updated_at'
  ]::text[] into v_after
  from public.driver_order_daily_report_rows r
  where r.id = p_row_id;

  select coalesce(jsonb_agg(item.key order by item.key), '[]'::jsonb)
  into v_changed_fields
  from jsonb_each(v_after) item
  where v_before -> item.key is distinct from item.value;

  insert into public.activity_logs(
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    p_actor_user_id, p_organization_id,
    'driver_order_report_row_corrected', 'driver_order_daily_report_row', p_row_id,
    v_before, v_after,
    jsonb_build_object(
      'actor_user_id', p_actor_user_id,
      'organization_id', p_organization_id,
      'report_id', p_report_id,
      'report_row_id', p_row_id,
      'driver_id', v_row.driver_id,
      'report_date', v_row.report_date,
      'changed_fields', v_changed_fields,
      'before_values', v_before,
      'after_values', v_after,
      'edit_note', v_edit_note,
      'corrected_at', statement_timestamp()
    )
  );

  return v_updated_at;
end;
$$;

revoke all on function public.update_driver_order_daily_report_row(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated, service_role;

grant execute on function public.update_driver_order_daily_report_row(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to service_role;
