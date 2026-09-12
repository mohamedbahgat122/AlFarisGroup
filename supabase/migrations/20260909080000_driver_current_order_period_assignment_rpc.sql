-- Provide a server-authoritative current Order Work Shift read for the Driver PWA.
-- The existing date-parameterized RPC remains available for its existing callers.

create or replace function public.get_my_current_order_period_assignment()
returns table (
  assignment_id uuid,
  template_id uuid,
  template_name text,
  start_time time,
  end_time time,
  crosses_midnight boolean,
  assignment_start_date date,
  assignment_end_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_effective_date date := (now() at time zone 'Asia/Riyadh')::date;
  v_driver_id uuid;
  v_organization_id uuid;
  v_driver_count integer;
  v_match_count integer;
begin
  select count(*) into v_driver_count
  from public.drivers d
  join public.organizations o
    on o.id = d.organization_id
   and o.is_active
  where d.auth_user_id = v_auth_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;

  if v_driver_count > 1 then
    raise exception 'DRIVER_DATA_INTEGRITY_MULTIPLE_MATCHES';
  end if;

  select d.id, d.organization_id
    into v_driver_id, v_organization_id
  from public.drivers d
  join public.organizations o
    on o.id = d.organization_id
   and o.is_active
  where d.auth_user_id = v_auth_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;

  if v_driver_id is null then
    return;
  end if;

  select count(*) into v_match_count
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id
   and t.organization_id = a.organization_id
   and t.is_active
   and t.archived_at is null
  where a.organization_id = v_organization_id
    and a.driver_id = v_driver_id
    and a.is_active
    and v_effective_date >= a.assignment_start_date
    and (a.assignment_end_date is null or v_effective_date <= a.assignment_end_date);

  if v_match_count > 1 then
    raise exception 'ORDER_PERIOD_DATA_INTEGRITY_MULTIPLE_MATCHES';
  end if;

  return query
  select a.id, t.id, t.name, t.start_time, t.end_time, t.crosses_midnight,
    a.assignment_start_date, a.assignment_end_date
  from public.organization_order_period_assignments a
  join public.organization_order_period_templates t
    on t.id = a.order_period_template_id
   and t.organization_id = a.organization_id
   and t.is_active
   and t.archived_at is null
  where a.organization_id = v_organization_id
    and a.driver_id = v_driver_id
    and a.is_active
    and v_effective_date >= a.assignment_start_date
    and (a.assignment_end_date is null or v_effective_date <= a.assignment_end_date);
end;
$$;

revoke all on function public.get_my_current_order_period_assignment() from public, anon;
grant execute on function public.get_my_current_order_period_assignment() to authenticated, service_role;

notify pgrst, 'reload schema';
