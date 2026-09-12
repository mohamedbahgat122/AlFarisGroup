begin;

create or replace function public.normalize_shift_change_weekdays(p_days smallint[])
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct day order by day),
    '{}'::smallint[]
  )
  from unnest(coalesce(p_days, '{}'::smallint[])) as values(day);
$$;

create table if not exists public.organization_shift_change_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  allowed_weekdays smallint[] not null default array[0, 1, 6]::smallint[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint organization_shift_change_settings_weekdays_range
    check (allowed_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint organization_shift_change_settings_weekdays_normalized
    check (allowed_weekdays = public.normalize_shift_change_weekdays(allowed_weekdays))
);

alter table public.organization_shift_change_settings enable row level security;
revoke all on public.organization_shift_change_settings from public, anon, authenticated;
grant select on public.organization_shift_change_settings to service_role;
grant select, insert, update on public.organization_shift_change_settings to service_role;

create or replace function public.get_shift_change_request_days_internal(
  p_organization_id uuid
)
returns smallint[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_days smallint[];
begin
  if p_organization_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_organization_id::text, 0)
    );
  end if;

  select allowed_weekdays
    into v_days
  from public.organization_shift_change_settings
  where organization_id = p_organization_id;

  return coalesce(v_days, array[0, 1, 6]::smallint[]);
end;
$$;

create or replace function public.is_shift_change_request_submission_day(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.drivers
    where auth_user_id = auth.uid()
      and organization_id = p_organization_id
      and status = 'active'::public.driver_status
      and deleted_at is null
  )
  and extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint = any(
    public.get_shift_change_request_days_internal(p_organization_id)
  );
$$;

revoke all on function public.normalize_shift_change_weekdays(smallint[])
  from public, anon, authenticated;
revoke all on function public.get_shift_change_request_days_internal(uuid)
  from public, anon, authenticated;
revoke all on function public.is_shift_change_request_submission_day(uuid)
  from public, anon;
grant execute on function public.is_shift_change_request_submission_day(uuid)
  to authenticated, service_role;

create or replace function public.get_effective_shift_change_request_days(
  p_organization_id uuid
)
returns smallint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null
     or not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    raise exception 'SHIFT_CHANGE_DAYS_UNAUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and is_active
  ) then
    raise exception 'SHIFT_CHANGE_DAYS_ORGANIZATION_NOT_FOUND';
  end if;

  return public.get_shift_change_request_days_internal(p_organization_id);
end;
$$;

create or replace function public.set_shift_change_request_days(
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
  v_days smallint[];
begin
  if v_actor_id is null
     or not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    return jsonb_build_object('success', false, 'error', 'SHIFT_CHANGE_DAYS_UNAUTHORIZED');
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and is_active
  ) then
    return jsonb_build_object('success', false, 'error', 'SHIFT_CHANGE_DAYS_ORGANIZATION_NOT_FOUND');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text, 0)
  );
  v_days := public.normalize_shift_change_weekdays(p_allowed_weekdays);

  if exists (
    select 1 from unnest(v_days) as values(day) where day < 0 or day > 6
  ) then
    return jsonb_build_object('success', false, 'error', 'SHIFT_CHANGE_DAYS_INVALID');
  end if;

  insert into public.organization_shift_change_settings (
    organization_id,
    allowed_weekdays,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    v_days,
    v_actor_id,
    v_actor_id
  )
  on conflict (organization_id) do update
  set allowed_weekdays = excluded.allowed_weekdays,
      updated_at = now(),
      updated_by = v_actor_id;

  insert into public.activity_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_actor_id,
    p_organization_id,
    'shift_change_request_days_updated',
    'organization_shift_change_settings',
    p_organization_id,
    jsonb_build_object('allowed_weekdays', v_days),
    jsonb_build_object('organization_id', p_organization_id)
  );

  return jsonb_build_object('success', true, 'allowed_weekdays', v_days);
end;
$$;

revoke all on function public.get_effective_shift_change_request_days(uuid)
  from public, anon;
grant execute on function public.get_effective_shift_change_request_days(uuid)
  to authenticated, service_role;
revoke all on function public.set_shift_change_request_days(uuid, smallint[])
  from public, anon;
grant execute on function public.set_shift_change_request_days(uuid, smallint[])
  to authenticated, service_role;

drop policy if exists "Drivers can create shift change requests"
  on public.driver_shift_change_requests;
create policy "Drivers can create shift change requests"
  on public.driver_shift_change_requests
  for insert
  with check (
    driver_id in (
      select d.id
      from public.drivers d
      where d.auth_user_id = auth.uid()
        and d.organization_id = driver_shift_change_requests.organization_id
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
    and public.is_shift_change_request_submission_day(
      driver_shift_change_requests.organization_id
    )
    and exists (
      select 1
      from public.organization_shift_templates current_shift
      where current_shift.id = driver_shift_change_requests.current_shift_id
        and current_shift.organization_id = driver_shift_change_requests.organization_id
        and current_shift.published_at is not null
        and current_shift.is_active = true
        and current_shift.archived_at is null
    )
    and exists (
      select 1
      from public.organization_shift_templates requested_shift
      where requested_shift.id = driver_shift_change_requests.requested_shift_id
        and requested_shift.organization_id = driver_shift_change_requests.organization_id
        and requested_shift.published_at is not null
        and requested_shift.is_active = true
        and requested_shift.archived_at is null
    )
  );

create or replace function public.approve_shift_change_request(
    p_request_id uuid,
    p_user_id uuid,
    p_review_note text default null
) returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor_id uuid;
    v_request public.driver_shift_change_requests%rowtype;
    v_target_assignment public.organization_shift_assignments%rowtype;
    v_anchor_assignment public.organization_shift_assignments%rowtype;
    v_conflicting_assignment public.organization_shift_assignments%rowtype;
    v_previous_end_date date;
    v_created_riyadh_date date;
    v_created_dow integer;
    v_expected_execution_date date;
begin
    v_actor_id := auth.uid();

    if v_actor_id is null then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_APPROVAL_AUTH_REQUIRED'
        );
    end if;

    if p_user_id is distinct from v_actor_id then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_APPROVAL_ACTOR_MISMATCH'
        );
    end if;

    select *
      into v_request
    from public.driver_shift_change_requests
    where id = p_request_id
      and status = 'pending'
    for update;

    if not found then
        return json_build_object('success', false, 'error', 'Request not found or already processed');
    end if;

    if not public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review') then
        return json_build_object('success', false, 'error', 'Permission denied. Must have app_requests.review permission.');
    end if;

    v_created_riyadh_date := timezone('Asia/Riyadh', v_request.created_at)::date;
    v_created_dow := extract(dow from v_created_riyadh_date)::integer;
    v_expected_execution_date := v_created_riyadh_date +
      case when v_created_dow = 0 then 7 else 7 - v_created_dow end;

    if v_request.requested_week_start_date <> v_expected_execution_date then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_INVALID_EXECUTION_WEEK'
        );
    end if;

    if exists (
      select 1
      from public.driver_shift_change_requests other_request
      where other_request.driver_id = v_request.driver_id
        and other_request.organization_id = v_request.organization_id
        and other_request.requested_week_start_date = v_request.requested_week_start_date
        and other_request.status in ('pending', 'approved')
        and other_request.id <> v_request.id
    ) then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_DUPLICATE_TARGET_WEEK'
        );
    end if;

    if not exists (
      select 1
      from public.organization_shift_templates current_shift
      where current_shift.id = v_request.current_shift_id
        and current_shift.organization_id = v_request.organization_id
        and current_shift.published_at is not null
        and current_shift.is_active = true
        and current_shift.archived_at is null
    ) then
        return json_build_object('success', false, 'error', 'Current shift is not published.');
    end if;

    if not exists (
      select 1
      from public.organization_shift_templates requested_shift
      where requested_shift.id = v_request.requested_shift_id
        and requested_shift.organization_id = v_request.organization_id
        and requested_shift.published_at is not null
        and requested_shift.is_active = true
        and requested_shift.archived_at is null
    ) then
        return json_build_object('success', false, 'error', 'Requested shift is not published.');
    end if;

    select *
      into v_target_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and assignment_start_date = v_request.requested_week_start_date
      and (
        assignment_end_date is null
        or assignment_end_date >= v_request.requested_week_start_date
      )
    order by created_at desc
    limit 1
    for update;

    if found then
        update public.organization_shift_assignments
        set shift_template_id = v_request.requested_shift_id,
            updated_at = timezone('utc', now()),
            updated_by = v_actor_id
        where id = v_target_assignment.id;

        update public.driver_shift_change_requests
        set status = 'approved',
            reviewed_by = v_actor_id,
            reviewed_at = timezone('utc', now()),
            review_note = p_review_note,
            updated_at = timezone('utc', now())
        where id = p_request_id;

        return json_build_object('success', true);
    end if;

    v_previous_end_date := (v_request.requested_week_start_date - interval '1 day')::date;

    select *
      into v_anchor_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and (
        assignment_start_date is null
        or assignment_start_date <= v_previous_end_date
      )
      and (
        assignment_end_date is null
        or assignment_end_date >= v_previous_end_date
      )
    order by assignment_start_date desc nulls last, created_at desc
    limit 1
    for update;

    if not found then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_NO_ACTIVE_ASSIGNMENT'
        );
    end if;

    if v_anchor_assignment.shift_template_id <> v_request.current_shift_id then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED'
        );
    end if;

    select *
      into v_conflicting_assignment
    from public.organization_shift_assignments
    where driver_id = v_request.driver_id
      and organization_id = v_request.organization_id
      and is_active = true
      and id <> v_anchor_assignment.id
      and (
        assignment_end_date is null
        or assignment_end_date >= v_request.requested_week_start_date
      )
      and (
        assignment_start_date is null
        or assignment_start_date >= v_request.requested_week_start_date
      )
    order by assignment_start_date asc nulls last, created_at asc
    limit 1
    for update;

    if found then
        return json_build_object(
            'success', false,
            'error', 'SHIFT_CHANGE_FUTURE_ASSIGNMENT_CONFLICT'
        );
    end if;

    update public.organization_shift_assignments
    set assignment_end_date = v_previous_end_date,
        updated_at = timezone('utc', now()),
        updated_by = v_actor_id
    where id = v_anchor_assignment.id;

    insert into public.organization_shift_assignments (
        driver_id,
        organization_id,
        shift_template_id,
        assignment_start_date,
        is_active,
        created_at,
        created_by,
        updated_at
    ) values (
        v_request.driver_id,
        v_request.organization_id,
        v_request.requested_shift_id,
        v_request.requested_week_start_date,
        true,
        timezone('utc', now()),
        v_actor_id,
        timezone('utc', now())
    );

    update public.driver_shift_change_requests
    set status = 'approved',
        reviewed_by = v_actor_id,
        reviewed_at = timezone('utc', now()),
        review_note = p_review_note,
        updated_at = timezone('utc', now())
    where id = p_request_id;

    return json_build_object('success', true);
end;
$$;

revoke all on function public.approve_shift_change_request(uuid, uuid, text)
  from public;
revoke all on function public.approve_shift_change_request(uuid, uuid, text)
  from anon;
grant execute on function public.approve_shift_change_request(uuid, uuid, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
