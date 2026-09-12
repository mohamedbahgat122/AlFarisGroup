begin;

create or replace function public.get_my_shift_change_request_window()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_driver_id uuid;
  v_organization_id uuid;
  v_today_riyadh date;
  v_weekday_riyadh smallint;
  v_allowed_weekdays smallint[];
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'DRIVER_SHIFT_CHANGE_WINDOW_AUTH_REQUIRED'
    );
  end if;

  select d.id, d.organization_id
    into v_driver_id, v_organization_id
  from public.drivers d
  where d.auth_user_id = v_actor_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
  limit 1;

  if v_driver_id is null or v_organization_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'DRIVER_SHIFT_CHANGE_WINDOW_DRIVER_NOT_FOUND'
    );
  end if;

  v_today_riyadh := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday_riyadh := extract(
    dow from (now() at time zone 'Asia/Riyadh')
  )::smallint;
  v_allowed_weekdays := public.get_shift_change_request_days_internal(
    v_organization_id
  );

  return jsonb_build_object(
    'success', true,
    'today_riyadh', v_today_riyadh,
    'weekday_riyadh', v_weekday_riyadh,
    'allowed_weekdays', v_allowed_weekdays,
    'can_submit_today', v_weekday_riyadh = any(v_allowed_weekdays)
  );
end;
$$;

revoke all on function public.get_my_shift_change_request_window()
  from public, anon;
grant execute on function public.get_my_shift_change_request_window()
  to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
