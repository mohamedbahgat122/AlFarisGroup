create or replace function public.get_dashboard_driver_report_summary(
  p_organization_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  driver_id uuid,
  driver_full_name text,
  organization_id uuid,
  delivered_tasks bigint,
  accepted_tasks bigint,
  report_days bigint,
  attendance_days bigint,
  delivery_rate numeric,
  evaluation_completion_rate numeric,
  score numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'anon' then
    raise exception 'Unauthorized';
  end if;

  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    return;
  end if;

  if current_setting('role', true) != 'service_role' then
    if not (
      select bool_and(public.can_view_organization(org_id))
      from unnest(p_organization_ids) as org_id
    ) then
      raise exception 'Unauthorized organization access';
    end if;
  end if;

  return query
  select 
    d.driver_id,
    (array_agg(d.driver_full_name order by d.report_date desc, d.created_at desc))[1] as driver_full_name,
    (array_agg(d.organization_id order by d.report_date desc, d.created_at desc))[1] as organization_id,
    coalesce(sum(d.delivered_tasks), 0) as delivered_tasks,
    coalesce(sum(d.accepted_tasks), 0) as accepted_tasks,
    count(distinct d.report_date) as report_days,
    count(d.attendance_status) filter (where d.attendance_status = 'present') as attendance_days,
    round(avg(d.delivery_rate)::numeric) as delivery_rate,
    round(avg(d.evaluation_completion_rate)::numeric) as evaluation_completion_rate,
    round(
      (
        coalesce(sum(d.delivery_rate), 0) +
        coalesce(sum(d.evaluation_completion_rate), 0) +
        coalesce(sum(d.mandatory_assignment_score), 0) +
        coalesce(sum(d.not_early_delivery_confirmation_rate), 0)
      )::numeric
      /
      nullif(
        count(d.delivery_rate) +
        count(d.evaluation_completion_rate) +
        count(d.mandatory_assignment_score) +
        count(d.not_early_delivery_confirmation_rate),
        0
      )
    ) as score
  from public.driver_daily_report_rows d
  where d.organization_id = any(p_organization_ids)
    and d.report_date >= p_from
    and d.report_date <= p_to
  group by d.driver_id;
end;
$$;
