begin;

create or replace function public.move_organization_shift_driver(
  p_organization_id uuid,
  p_source_shift_id uuid,
  p_target_shift_id uuid,
  p_driver_id uuid,
  p_assignment_start_date date,
  p_assignment_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_source_shift public.organization_shift_templates%rowtype;
  v_target_shift public.organization_shift_templates%rowtype;
  v_driver public.drivers%rowtype;
  v_source_assignment public.organization_shift_assignments%rowtype;
  v_conflict_id uuid;
  v_target_assignment_id uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_current_week_start date;
  v_current_week_end date;
  v_next_week_start date;
  v_next_week_end date;
  v_original_start date;
  v_original_end date;
  v_has_before boolean;
  v_has_after boolean;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MOVE_UNAUTHORIZED');
  end if;

  if p_source_shift_id = p_target_shift_id
     or p_assignment_start_date is null
     or p_assignment_end_date is null
     or p_assignment_start_date > p_assignment_end_date then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MOVE_INVALID');
  end if;

  v_current_week_start := v_today - extract(dow from v_today)::integer;
  v_current_week_end := v_current_week_start + 6;
  v_next_week_start := v_current_week_start + 7;
  v_next_week_end := v_next_week_start + 6;

  if not (
    (p_assignment_start_date = v_current_week_start and p_assignment_end_date = v_current_week_end)
    or (p_assignment_start_date = v_next_week_start and p_assignment_end_date = v_next_week_end)
  ) then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MOVE_INVALID_RANGE');
  end if;

  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.assign') then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MOVE_UNAUTHORIZED');
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and organization_id = p_organization_id
    and status = 'active'
    and deleted_at is null
  for update;

  if v_driver.id is null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_ASSIGNMENT_NOT_FOUND');
  end if;

  select * into v_source_shift
  from public.organization_shift_templates
  where id = p_source_shift_id
    and organization_id = p_organization_id
    and is_active
    and archived_at is null
  for update;

  select * into v_target_shift
  from public.organization_shift_templates
  where id = p_target_shift_id
    and organization_id = p_organization_id
    and is_active
    and archived_at is null
  for update;

  if v_source_shift.id is null or v_target_shift.id is null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_ASSIGNMENT_NOT_FOUND');
  end if;

  select * into v_source_assignment
  from public.organization_shift_assignments
  where organization_id = p_organization_id
    and shift_template_id = p_source_shift_id
    and driver_id = p_driver_id
    and is_active
    and (assignment_start_date is null or assignment_start_date <= p_assignment_end_date)
    and (assignment_end_date is null or assignment_end_date >= p_assignment_start_date)
  order by created_at desc
  limit 1
  for update;

  if v_source_assignment.id is null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_ASSIGNMENT_NOT_FOUND');
  end if;

  if (v_source_assignment.assignment_start_date is not null
      and v_source_assignment.assignment_start_date > p_assignment_start_date)
     or (v_source_assignment.assignment_end_date is not null
         and v_source_assignment.assignment_end_date < p_assignment_end_date) then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MOVE_INVALID_RANGE');
  end if;

  select id into v_conflict_id
  from public.organization_shift_assignments
  where organization_id = p_organization_id
    and driver_id = p_driver_id
    and is_active
    and id <> v_source_assignment.id
    and (assignment_start_date is null or assignment_start_date <= p_assignment_end_date)
    and (assignment_end_date is null or assignment_end_date >= p_assignment_start_date)
  limit 1
  for update;

  if v_conflict_id is not null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_ASSIGNMENT_OVERLAP');
  end if;

  v_original_start := v_source_assignment.assignment_start_date;
  v_original_end := v_source_assignment.assignment_end_date;
  v_has_before := v_original_start is null or v_original_start < p_assignment_start_date;
  v_has_after := v_original_end is null or v_original_end > p_assignment_end_date;

  if v_has_before then
    update public.organization_shift_assignments
    set assignment_end_date = p_assignment_start_date - 1,
        updated_at = now(),
        updated_by = v_actor_id
    where id = v_source_assignment.id;

    insert into public.organization_shift_assignments (
      organization_id,
      shift_template_id,
      driver_id,
      assignment_start_date,
      assignment_end_date,
      is_active,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      p_target_shift_id,
      p_driver_id,
      p_assignment_start_date,
      p_assignment_end_date,
      true,
      v_actor_id,
      v_actor_id
    ) returning id into v_target_assignment_id;

    if v_has_after then
      insert into public.organization_shift_assignments (
        organization_id,
        shift_template_id,
        driver_id,
        assignment_start_date,
        assignment_end_date,
        is_active,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        p_source_shift_id,
        p_driver_id,
        p_assignment_end_date + 1,
        v_original_end,
        true,
        v_actor_id,
        v_actor_id
      );
    end if;
  elsif v_has_after then
    update public.organization_shift_assignments
    set shift_template_id = p_target_shift_id,
        assignment_start_date = p_assignment_start_date,
        assignment_end_date = p_assignment_end_date,
        updated_at = now(),
        updated_by = v_actor_id
    where id = v_source_assignment.id;

    insert into public.organization_shift_assignments (
      organization_id,
      shift_template_id,
      driver_id,
      assignment_start_date,
      assignment_end_date,
      is_active,
      created_by,
      updated_by
    ) values (
      p_organization_id,
      p_source_shift_id,
      p_driver_id,
      p_assignment_end_date + 1,
      v_original_end,
      true,
      v_actor_id,
      v_actor_id
    );
  else
    update public.organization_shift_assignments
    set shift_template_id = p_target_shift_id,
        assignment_start_date = p_assignment_start_date,
        assignment_end_date = p_assignment_end_date,
        updated_at = now(),
        updated_by = v_actor_id
    where id = v_source_assignment.id;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  ) values (
    v_actor_id,
    p_organization_id,
    'driver_shift_moved',
    'organization_shift_assignment',
    coalesce(v_target_assignment_id, v_source_assignment.id),
    jsonb_build_object(
      'shift_template_id', p_source_shift_id,
      'assignment_start_date', v_original_start,
      'assignment_end_date', v_original_end
    ),
    jsonb_build_object(
      'shift_template_id', p_target_shift_id,
      'assignment_start_date', p_assignment_start_date,
      'assignment_end_date', p_assignment_end_date
    ),
    jsonb_build_object('driver_id', p_driver_id)
  );

  return jsonb_build_object(
    'success', true,
    'assignment_id', coalesce(v_target_assignment_id, v_source_assignment.id),
    'source_shift_id', p_source_shift_id,
    'target_shift_id', p_target_shift_id,
    'driver_id', p_driver_id
  );
end;
$$;

drop index if exists public.organization_shift_assignments_active_driver_shift_key;
create unique index organization_shift_assignments_active_driver_shift_range_key
  on public.organization_shift_assignments (
    shift_template_id,
    driver_id,
    coalesce(assignment_start_date, date '0001-01-01'),
    coalesce(assignment_end_date, date '9999-12-31')
  )
  where is_active = true;

revoke all on function public.move_organization_shift_driver(uuid, uuid, uuid, uuid, date, date)
  from public, anon;
grant execute on function public.move_organization_shift_driver(uuid, uuid, uuid, uuid, date, date)
  to authenticated, service_role;

commit;
