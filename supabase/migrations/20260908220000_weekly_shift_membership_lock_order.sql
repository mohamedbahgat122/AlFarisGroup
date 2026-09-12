begin;

create or replace function public.replace_organization_shift_week_members(
  p_organization_id uuid,
  p_shift_template_id uuid,
  p_week_start date,
  p_week_end date,
  p_driver_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_current_week_start date;
  v_current_week_end date;
  v_next_week_start date;
  v_next_week_end date;
  v_selected_driver_ids uuid[] := coalesce(
    (select array_agg(distinct driver_id order by driver_id)
     from unnest(coalesce(p_driver_ids, '{}'::uuid[])) as selected(driver_id)
     where driver_id is not null),
    '{}'::uuid[]
  );
  v_relevant_driver_ids uuid[];
  v_selected_count integer := cardinality(v_selected_driver_ids);
  v_driver_count integer;
  v_added_count integer := 0;
  v_removed_count integer := 0;
  v_driver_id uuid;
  v_assignment public.organization_shift_assignments%rowtype;
  v_has_before boolean;
  v_has_after boolean;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MEMBERSHIP_UNAUTHORIZED');
  end if;

  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.assign') then
    return jsonb_build_object('success', false, 'error', 'SHIFT_MEMBERSHIP_UNAUTHORIZED');
  end if;

  if p_week_start is null or p_week_end is null or p_week_start > p_week_end then
    return jsonb_build_object('success', false, 'error', 'INVALID_WEEK_RANGE');
  end if;

  v_current_week_start := v_today - extract(dow from v_today)::integer;
  v_current_week_end := v_current_week_start + 6;
  v_next_week_start := v_current_week_start + 7;
  v_next_week_end := v_next_week_start + 6;

  if not (
    (p_week_start = v_current_week_start and p_week_end = v_current_week_end)
    or (p_week_start = v_next_week_start and p_week_end = v_next_week_end)
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_WEEK_RANGE');
  end if;

  select coalesce(array_agg(distinct driver_id order by driver_id), '{}'::uuid[])
    into v_relevant_driver_ids
  from public.organization_shift_assignments
  where organization_id = p_organization_id
    and shift_template_id = p_shift_template_id
    and is_active
    and (assignment_start_date is null or assignment_start_date <= p_week_end)
    and (assignment_end_date is null or assignment_end_date >= p_week_start);

  v_relevant_driver_ids := v_relevant_driver_ids || v_selected_driver_ids;

  select coalesce(array_agg(distinct driver_id order by driver_id), '{}'::uuid[])
    into v_relevant_driver_ids
  from unnest(v_relevant_driver_ids) as relevant(driver_id);

  -- Match move_organization_shift_driver: driver rows are locked before shift rows.
  perform 1
  from public.drivers
  where organization_id = p_organization_id
    and id = any(v_relevant_driver_ids)
  order by id
  for update;

  select count(*) into v_driver_count
  from public.drivers
  where organization_id = p_organization_id
    and id = any(v_selected_driver_ids)
    and status = 'active'
    and deleted_at is null;

  if v_driver_count <> v_selected_count then
    return jsonb_build_object('success', false, 'error', 'DRIVER_NOT_IN_ORGANIZATION');
  end if;

  perform 1
  from public.organization_shift_templates
  where id = p_shift_template_id
    and organization_id = p_organization_id
    and is_active
    and archived_at is null
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'SHIFT_NOT_FOUND');
  end if;

  perform 1
  from public.organization_shift_assignments
  where organization_id = p_organization_id
    and driver_id = any(v_relevant_driver_ids)
    and is_active
  order by driver_id, id
  for update;

  if exists (
    select 1
    from public.organization_shift_assignments
    where organization_id = p_organization_id
      and driver_id = any(v_selected_driver_ids)
      and shift_template_id <> p_shift_template_id
      and is_active
      and (assignment_start_date is null or assignment_start_date <= p_week_end)
      and (assignment_end_date is null or assignment_end_date >= p_week_start)
  ) then
    return jsonb_build_object('success', false, 'error', 'DRIVER_ALREADY_ASSIGNED_THIS_WEEK');
  end if;

  for v_assignment in
    select *
    from public.organization_shift_assignments
    where organization_id = p_organization_id
      and shift_template_id = p_shift_template_id
      and is_active
      and (assignment_start_date is null or assignment_start_date <= p_week_end)
      and (assignment_end_date is null or assignment_end_date >= p_week_start)
    order by driver_id, id
    for update
  loop
    if not (v_assignment.driver_id = any(v_selected_driver_ids)) then
      v_has_before := v_assignment.assignment_start_date is null
        or v_assignment.assignment_start_date < p_week_start;
      v_has_after := v_assignment.assignment_end_date is null
        or v_assignment.assignment_end_date > p_week_end;

      if v_has_before then
        update public.organization_shift_assignments
        set assignment_end_date = p_week_start - 1,
            updated_at = now(),
            updated_by = v_actor_id
        where id = v_assignment.id;

        if v_has_after then
          insert into public.organization_shift_assignments (
            organization_id, shift_template_id, driver_id,
            assignment_start_date, assignment_end_date, is_active,
            created_by, updated_by
          ) values (
            p_organization_id, p_shift_template_id, v_assignment.driver_id,
            p_week_end + 1, v_assignment.assignment_end_date, true,
            v_actor_id, v_actor_id
          );
        end if;
      elsif v_has_after then
        update public.organization_shift_assignments
        set assignment_start_date = p_week_end + 1,
            updated_at = now(),
            updated_by = v_actor_id
        where id = v_assignment.id;
      else
        update public.organization_shift_assignments
        set is_active = false,
            updated_at = now(),
            updated_by = v_actor_id
        where id = v_assignment.id;
      end if;

      v_removed_count := v_removed_count + 1;
    end if;
  end loop;

  for v_driver_id in
    select d.id
    from public.drivers d
    where d.organization_id = p_organization_id
      and d.id = any(v_selected_driver_ids)
      and not exists (
        select 1
        from public.organization_shift_assignments a
        where a.organization_id = p_organization_id
          and a.driver_id = d.id
          and a.shift_template_id = p_shift_template_id
          and a.is_active
          and (a.assignment_start_date is null or a.assignment_start_date <= p_week_end)
          and (a.assignment_end_date is null or a.assignment_end_date >= p_week_start)
      )
  loop
    insert into public.organization_shift_assignments (
      organization_id, shift_template_id, driver_id,
      assignment_start_date, assignment_end_date, is_active,
      created_by, updated_by
    ) values (
      p_organization_id, p_shift_template_id, v_driver_id,
      p_week_start, p_week_end, true, v_actor_id, v_actor_id
    );
    v_added_count := v_added_count + 1;
  end loop;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata
  ) values (
    v_actor_id,
    p_organization_id,
    'shift_week_membership_replaced',
    'organization_shift_template',
    p_shift_template_id,
    jsonb_build_object(
      'week_start', p_week_start,
      'week_end', p_week_end,
      'added_count', v_added_count,
      'removed_count', v_removed_count
    ),
    jsonb_build_object(
      'organization_id', p_organization_id,
      'shift_template_id', p_shift_template_id,
      'week_start', p_week_start,
      'week_end', p_week_end
    )
  );

  return jsonb_build_object(
    'success', true,
    'added_count', v_added_count,
    'removed_count', v_removed_count
  );
end;
$$;

revoke all on function public.replace_organization_shift_week_members(uuid, uuid, date, date, uuid[])
  from public, anon;
grant execute on function public.replace_organization_shift_week_members(uuid, uuid, date, date, uuid[])
  to authenticated, service_role;

commit;
