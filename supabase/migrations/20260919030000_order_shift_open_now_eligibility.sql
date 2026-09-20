begin;

create or replace function public.get_order_period_open_now_eligibility(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if v_actor is null or not public.has_order_period_permission(v_actor, p_organization_id, 'order_periods.open_now') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED', 'items', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success', true,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'template_id', a.order_period_template_id,
          'driver_id', a.driver_id,
          'scheduled_business_date', occurrence.scheduled_business_date,
          'scheduled_start_at', occurrence.scheduled_start_at,
          'scheduled_end_at', occurrence.scheduled_end_at,
          'attendance_exists', case when occurrence.scheduled_business_date is null then false else exists (
            select 1
            from public.driver_shifts ds
            where ds.organization_id = p_organization_id
              and ds.driver_id = a.driver_id
              and ds.shift_template_id is null
              and ds.order_period_template_id = a.order_period_template_id
              and ds.scheduled_business_date = occurrence.scheduled_business_date
          ) end,
          'open_now_eligible', (
            t.is_active
            and t.archived_at is null
            and t.is_published
            and occurrence.scheduled_end_at is not null
            and now() < occurrence.scheduled_end_at
            and not exists (
              select 1
              from public.driver_shifts ds
              where ds.organization_id = p_organization_id
                and ds.driver_id = a.driver_id
                and ds.shift_template_id is null
                and ds.order_period_template_id = a.order_period_template_id
                and ds.scheduled_business_date = occurrence.scheduled_business_date
            )
          ),
          'reason_code', case
            when not t.is_active or t.archived_at is not null or not t.is_published then 'template_unavailable'
            when occurrence.scheduled_business_date is null then 'no_current_occurrence'
            when exists (
              select 1
              from public.driver_shifts ds
              where ds.organization_id = p_organization_id
                and ds.driver_id = a.driver_id
                and ds.shift_template_id is null
                and ds.order_period_template_id = a.order_period_template_id
                and ds.scheduled_business_date = occurrence.scheduled_business_date
            ) then 'attendance_exists'
            when now() >= occurrence.scheduled_end_at then 'occurrence_expired'
            else null
          end
        ) order by a.order_period_template_id, a.driver_id
      )
      from public.organization_order_period_assignments a
      join public.organization_order_period_templates t
        on t.id = a.order_period_template_id
       and t.organization_id = a.organization_id
      left join lateral public.resolve_order_period_occurrence(
        p_organization_id,
        a.order_period_template_id,
        a.driver_id
      ) occurrence on true
      where a.organization_id = p_organization_id
        and a.is_active
        and a.assignment_start_date <= v_today
        and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_order_period_open_now_eligibility(uuid) from public, anon;
grant execute on function public.get_order_period_open_now_eligibility(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
