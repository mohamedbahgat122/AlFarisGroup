-- Informational break metadata for Order Shift templates.
-- Break values do not participate in attendance, policies, or duration logic.

alter table public.organization_order_period_templates
  add column if not exists has_break boolean not null default false,
  add column if not exists break_start_time time null,
  add column if not exists break_end_time time null;

create or replace function public.is_valid_order_period_break(
  p_shift_start time,
  p_shift_end time,
  p_crosses_midnight boolean,
  p_break_start time,
  p_break_end time
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_gross integer;
  v_break_start integer;
  v_break_end integer;
begin
  if p_break_start is null and p_break_end is null then
    return true;
  end if;
  if p_break_start is null or p_break_end is null
     or p_shift_start is null or p_shift_end is null
     or p_shift_start = p_shift_end then
    return false;
  end if;

  v_gross := extract(epoch from (p_shift_end - p_shift_start))::integer / 60;
  if p_crosses_midnight then
    v_gross := v_gross + 1440;
  end if;
  if v_gross <= 0 then
    return false;
  end if;

  v_break_start := extract(epoch from (p_break_start - p_shift_start))::integer / 60;
  if v_break_start < 0 then v_break_start := v_break_start + 1440; end if;
  v_break_end := extract(epoch from (p_break_end - p_shift_start))::integer / 60;
  if v_break_end <= 0 then v_break_end := v_break_end + 1440; end if;

  return v_break_start < v_break_end and v_break_end <= v_gross;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_order_period_templates_break_shape'
      and conrelid = 'public.organization_order_period_templates'::regclass
  ) then
    alter table public.organization_order_period_templates
      add constraint organization_order_period_templates_break_shape
      check (
        (has_break = false and break_start_time is null and break_end_time is null)
        or (
          has_break = true
          and break_start_time is not null
          and break_end_time is not null
          and public.is_valid_order_period_break(
            start_time, end_time, crosses_midnight, break_start_time, break_end_time
          )
        )
      );
  end if;
end;
$$;

drop function if exists public.create_order_period_template(uuid, text, time, time, boolean);
drop function if exists public.update_order_period_template(uuid, uuid, text, time, time, boolean);

create or replace function public.create_order_period_template(
  p_organization_id uuid,
  p_name text,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean,
  p_has_break boolean,
  p_break_start_time time,
  p_break_end_time time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template_id uuid;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160
     or p_start_time is null or p_end_time is null or p_crosses_midnight is null
     or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time)
     or not p_has_break
        and (p_break_start_time is not null or p_break_end_time is not null)
     or p_has_break and not public.is_valid_order_period_break(
          p_start_time, p_end_time, p_crosses_midnight, p_break_start_time, p_break_end_time
        ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;

  insert into public.organization_order_period_templates (
    organization_id, name, start_time, end_time, crosses_midnight,
    has_break, break_start_time, break_end_time, created_by, updated_by
  ) values (
    p_organization_id, btrim(p_name), p_start_time, p_end_time, p_crosses_midnight,
    p_has_break, case when p_has_break then p_break_start_time end,
    case when p_has_break then p_break_end_time end, v_actor_id, v_actor_id
  ) returning id into v_template_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_template_created',
    'organization_order_period_template', v_template_id,
    jsonb_build_object('name', btrim(p_name), 'start_time', p_start_time,
      'end_time', p_end_time, 'crosses_midnight', p_crosses_midnight,
      'has_break', p_has_break, 'break_start_time', p_break_start_time,
      'break_end_time', p_break_end_time),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'template_id', v_template_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

create or replace function public.update_order_period_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_name text,
  p_start_time time,
  p_end_time time,
  p_crosses_midnight boolean,
  p_has_break boolean,
  p_break_start_time time,
  p_break_end_time time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor_id is null or not public.has_organization_permission(v_actor_id, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160
     or p_start_time is null or p_end_time is null or p_crosses_midnight is null
     or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time)
     or not p_has_break
        and (p_break_start_time is not null or p_break_end_time is not null)
     or p_has_break and not public.is_valid_order_period_break(
          p_start_time, p_end_time, p_crosses_midnight, p_break_start_time, p_break_end_time
        ) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_template_id and organization_id = p_organization_id
  for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND'); end if;
  if not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ARCHIVED');
  end if;

  update public.organization_order_period_templates
  set name = btrim(p_name), start_time = p_start_time, end_time = p_end_time,
      crosses_midnight = p_crosses_midnight, has_break = p_has_break,
      break_start_time = case when p_has_break then p_break_start_time end,
      break_end_time = case when p_has_break then p_break_end_time end,
      updated_by = v_actor_id
  where id = p_template_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor_id, p_organization_id, 'order_period_template_updated',
    'organization_order_period_template', p_template_id,
    jsonb_build_object('name', v_template.name, 'start_time', v_template.start_time,
      'end_time', v_template.end_time, 'crosses_midnight', v_template.crosses_midnight,
      'has_break', v_template.has_break, 'break_start_time', v_template.break_start_time,
      'break_end_time', v_template.break_end_time),
    jsonb_build_object('name', btrim(p_name), 'start_time', p_start_time,
      'end_time', p_end_time, 'crosses_midnight', p_crosses_midnight,
      'has_break', p_has_break, 'break_start_time', p_break_start_time,
      'break_end_time', p_break_end_time),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'template_id', p_template_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

revoke all on function public.create_order_period_template(uuid, text, time, time, boolean, boolean, time, time) from public, anon;
revoke all on function public.update_order_period_template(uuid, uuid, text, time, time, boolean, boolean, time, time) from public, anon;
grant execute on function public.create_order_period_template(uuid, text, time, time, boolean, boolean, time, time) to authenticated, service_role;
grant execute on function public.update_order_period_template(uuid, uuid, text, time, time, boolean, boolean, time, time) to authenticated, service_role;

notify pgrst, 'reload schema';
