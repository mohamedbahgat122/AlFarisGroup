-- Fix the order shift-change settings RPC audit INSERT value count.
-- The deployed function supplied one extra value for activity_logs.

begin;

create or replace function public.set_organization_order_shift_change_settings(
  p_organization_id uuid,
  p_allowed_weekdays smallint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_allowed smallint[];
  v_previous_allowed smallint[];
  v_previous_exists boolean := false;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_SETTINGS_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_ORGANIZATION_INVALID');
  end if;
  if exists (
    select 1 from unnest(coalesce(p_allowed_weekdays, '{}'::smallint[])) x
    where x < 0 or x > 6
  ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_SHIFT_CHANGE_INVALID_WEEKDAY');
  end if;
  select public.normalize_order_shift_change_weekdays(p_allowed_weekdays) into v_allowed;

  select allowed_weekdays into v_previous_allowed
  from public.organization_order_shift_change_settings
  where organization_id = p_organization_id
  for update;
  v_previous_exists := found;

  insert into public.organization_order_shift_change_settings
    (organization_id, allowed_weekdays, updated_at, updated_by)
  values (p_organization_id, v_allowed, timezone('utc', now()), v_actor_id)
  on conflict (organization_id) do update set
    allowed_weekdays = excluded.allowed_weekdays,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_shift_change_settings_updated',
    'organization_order_shift_change_settings', p_organization_id,
    case when v_previous_exists then
      jsonb_build_object('organization_id', p_organization_id, 'allowed_weekdays', v_previous_allowed)
    else null end,
    jsonb_build_object('organization_id', p_organization_id, 'allowed_weekdays', v_allowed),
    jsonb_build_object('organization_id', p_organization_id)
  );
  return jsonb_build_object('success', true, 'allowed_weekdays', v_allowed);
end;
$$;

commit;

notify pgrst, 'reload schema';
