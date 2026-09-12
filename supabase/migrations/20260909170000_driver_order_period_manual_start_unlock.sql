-- Admin Open Now is an explicit per-driver override. It may unlock Start
-- before or after the automatic window, without changing automatic timing.
-- No business rows are mutated while applying this migration.

begin;

create or replace function public.open_driver_order_period_now(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
  v_now timestamptz := now();
  v_override_expires_at timestamptz :=
    (((v_now at time zone 'Asia/Riyadh')::date + 1) at time zone 'Asia/Riyadh');
  v_existing uuid;
begin
  if v_actor is null or not public.has_organization_permission(v_actor, p_organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id
  for update;
  if not found or not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_TEMPLATE_INVALID');
  end if;
  if not v_template.is_published then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNPUBLISHED');
  end if;

  select * into v_policy
  from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id
  for update;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;

  select d.id into v_existing
  from public.drivers d
  where d.id = p_driver_id and d.organization_id = p_organization_id
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_INVALID');
  end if;

  perform 1
  from public.organization_order_period_assignments a
  where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
    and a.driver_id = p_driver_id and a.is_active
    and a.assignment_start_date <= (v_now at time zone 'Asia/Riyadh')::date
    and (a.assignment_end_date is null or a.assignment_end_date >= (v_now at time zone 'Asia/Riyadh')::date)
  order by a.id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED');
  end if;

  select * into v_occ
  from public.resolve_order_period_occurrence(p_organization_id, p_order_period_template_id, p_driver_id);
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE');
  end if;

  -- Automatic opening remains unchanged. Outside that window, continue to
  -- the override write, including after closes_at.
  if v_now >= v_occ.opens_at and v_now < v_occ.closes_at then
    return jsonb_build_object('success', true, 'status', 'already_open',
      'scheduled_business_date', v_occ.scheduled_business_date);
  end if;

  insert into public.organization_order_period_open_overrides (
    organization_id, order_period_template_id, driver_id, scheduled_business_date,
    opened_at, expires_at, opened_by
  ) values (
    p_organization_id, p_order_period_template_id, p_driver_id, v_occ.scheduled_business_date,
    v_now, v_override_expires_at, v_actor
  )
  on conflict (organization_id, order_period_template_id, driver_id, scheduled_business_date)
  do update set opened_at = excluded.opened_at, expires_at = excluded.expires_at,
    opened_by = excluded.opened_by, updated_at = timezone('utc', now());

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor, p_organization_id, 'order_shift_driver_opened_now',
    'organization_order_period_open_override',
    (select id from public.organization_order_period_open_overrides
      where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id
        and driver_id = p_driver_id and scheduled_business_date = v_occ.scheduled_business_date),
    jsonb_build_object('driver_id', p_driver_id, 'scheduled_business_date', v_occ.scheduled_business_date,
      'opened_at', v_now, 'expires_at', v_override_expires_at),
    jsonb_build_object('order_period_template_id', p_order_period_template_id,
      'override_lifetime', 'riyadh_calendar_day_end')
  );

  return jsonb_build_object('success', true, 'status', 'opened',
    'scheduled_business_date', v_occ.scheduled_business_date, 'expires_at', v_override_expires_at);
end;
$$;

revoke all on function public.open_driver_order_period_now(uuid, uuid, uuid) from public, anon;
grant execute on function public.open_driver_order_period_now(uuid, uuid, uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
