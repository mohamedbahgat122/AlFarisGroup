-- Shift-based attendance control foundation.
-- This migration establishes the database contract for Phase 2. The current
-- Driver PWA route still writes through its existing service-role path.

alter table public.organization_shift_templates
  add constraint organization_shift_templates_id_organization_key
  unique (id, organization_id);

create table if not exists public.organization_shift_attendance_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shift_template_id uuid not null,
  start_open_before_minutes integer null,
  minimum_work_minutes integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_shift_attendance_policies_shift_org_fk
    foreign key (shift_template_id, organization_id)
    references public.organization_shift_templates(id, organization_id)
    on delete restrict,
  constraint organization_shift_attendance_policies_start_open_bounds
    check (
      start_open_before_minutes is null
      or start_open_before_minutes between 0 and 1440
    ),
  constraint organization_shift_attendance_policies_minimum_work_bounds
    check (
      minimum_work_minutes is null
      or minimum_work_minutes between 1 and 1440
    ),
  constraint organization_shift_attendance_policies_unique_shift
    unique (organization_id, shift_template_id)
);

create index if not exists organization_shift_attendance_policies_org_idx
  on public.organization_shift_attendance_policies (organization_id, shift_template_id);

alter table public.driver_shifts
  add column if not exists shift_template_id uuid null,
  add column if not exists scheduled_business_date date null,
  add column if not exists applied_start_open_before_minutes integer null,
  add column if not exists applied_minimum_work_minutes integer null,
  add column if not exists attendance_control_version integer null;

alter table public.driver_shifts
  add constraint driver_shifts_shift_template_org_fk
    foreign key (shift_template_id, organization_id)
    references public.organization_shift_templates(id, organization_id)
    on delete restrict,
  add constraint driver_shifts_attendance_snapshot_shape
    check (
      (
        attendance_control_version is null
        and
        shift_template_id is null
        and scheduled_business_date is null
        and applied_start_open_before_minutes is null
        and applied_minimum_work_minutes is null
      )
      or (
        attendance_control_version = 1
        and
        shift_template_id is not null
        and scheduled_business_date is not null
        and applied_start_open_before_minutes is not null
        and applied_minimum_work_minutes is not null
      )
    ),
  add constraint driver_shifts_attendance_control_version_check
    check (attendance_control_version is null or attendance_control_version = 1),
  add constraint driver_shifts_applied_start_open_bounds
    check (
      applied_start_open_before_minutes is null
      or applied_start_open_before_minutes between 0 and 1440
    ),
  add constraint driver_shifts_applied_minimum_work_bounds
    check (
      applied_minimum_work_minutes is null
      or applied_minimum_work_minutes between 1 and 1440
    );

create index if not exists driver_shifts_template_business_date_idx
  on public.driver_shifts (organization_id, shift_template_id, scheduled_business_date);

create table if not exists public.organization_shift_attendance_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shift_template_id uuid not null,
  scheduled_business_date date not null,
  override_opened_at timestamptz not null,
  override_expires_at timestamptz not null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint organization_shift_attendance_overrides_shift_org_fk
    foreign key (shift_template_id, organization_id)
    references public.organization_shift_templates(id, organization_id)
    on delete restrict,
  constraint organization_shift_attendance_overrides_expiry_check
    check (override_expires_at > override_opened_at),
  constraint organization_shift_attendance_overrides_unique_date
    unique (organization_id, shift_template_id, scheduled_business_date)
);

create index if not exists organization_shift_attendance_overrides_active_idx
  on public.organization_shift_attendance_overrides (
    organization_id,
    shift_template_id,
    scheduled_business_date,
    override_expires_at
  );

alter table public.organization_shift_attendance_policies enable row level security;
alter table public.organization_shift_attendance_overrides enable row level security;

revoke all on public.organization_shift_attendance_policies from public, anon, authenticated;
revoke all on public.organization_shift_attendance_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.organization_shift_attendance_policies to service_role;
grant select, insert, update, delete on public.organization_shift_attendance_overrides to service_role;

-- Resolve the occurrence by scheduled start date, not by the calendar date
-- alone. This is shared by Admin Open Now, Driver context, and Driver Start.
create or replace function public.resolve_shift_attendance_occurrence(
  p_organization_id uuid,
  p_shift_template_id uuid,
  p_driver_id uuid default null
)
returns table (
  scheduled_business_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  assignment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.organization_shift_templates%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_candidate_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_assignment_id uuid;
begin
  select t.*
    into v_template
  from public.organization_shift_templates t
  where t.id = p_shift_template_id
    and t.organization_id = p_organization_id
    and t.is_active = true
    and t.archived_at is null;

  if not found then
    return;
  end if;

  -- Prefer an occurrence currently in progress. Yesterday is considered
  -- only for an overnight template, so an expired overnight occurrence
  -- cannot mask today's upcoming occurrence.
  for v_candidate_date in
    select v_today
    union all
    select v_today - 1
  loop
    if v_candidate_date = v_today - 1 and not v_template.crosses_midnight then
      continue;
    end if;

    v_start_at :=
      (v_candidate_date + v_template.start_time) at time zone 'Asia/Riyadh';
    v_end_at :=
      (
        v_candidate_date
        + case when v_template.crosses_midnight then 1 else 0 end
        + v_template.end_time
      ) at time zone 'Asia/Riyadh';

    if v_now >= v_start_at
       and v_now < v_end_at then
      select a.id
        into v_assignment_id
      from public.organization_shift_assignments a
      where a.organization_id = p_organization_id
        and a.shift_template_id = p_shift_template_id
        and (p_driver_id is null or a.driver_id = p_driver_id)
        and a.is_active = true
        and (a.assignment_start_date is null or a.assignment_start_date <= v_candidate_date)
        and (a.assignment_end_date is null or a.assignment_end_date >= v_candidate_date)
      order by a.assignment_start_date desc nulls last, a.created_at asc
      limit 1;

      if found then
        return query select v_candidate_date, v_start_at, v_end_at, v_assignment_id;
        return;
      end if;
    end if;
  end loop;

  -- If no occurrence is active, select today's upcoming occurrence. The
  -- opening window may be on the previous Riyadh date, but ownership remains
  -- the date of the scheduled shift start.
  v_candidate_date := v_today;
  v_start_at :=
    (v_candidate_date + v_template.start_time) at time zone 'Asia/Riyadh';
  v_end_at :=
    (
      v_candidate_date
      + case when v_template.crosses_midnight then 1 else 0 end
      + v_template.end_time
    ) at time zone 'Asia/Riyadh';

  if v_now < v_start_at then
    select a.id
      into v_assignment_id
    from public.organization_shift_assignments a
    where a.organization_id = p_organization_id
      and a.shift_template_id = p_shift_template_id
      and (p_driver_id is null or a.driver_id = p_driver_id)
      and a.is_active = true
      and (a.assignment_start_date is null or a.assignment_start_date <= v_candidate_date)
      and (a.assignment_end_date is null or a.assignment_end_date >= v_candidate_date)
    order by a.assignment_start_date desc nulls last, a.created_at asc
    limit 1;

    if found then
      return query select v_candidate_date, v_start_at, v_end_at, v_assignment_id;
    end if;
  end if;
end;
$$;

create or replace function public.set_organization_shift_attendance_policy(
  p_organization_id uuid,
  p_shift_template_id uuid,
  p_start_open_before_minutes integer,
  p_minimum_work_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template public.organization_shift_templates%rowtype;
  v_before public.organization_shift_attendance_policies%rowtype;
  v_after public.organization_shift_attendance_policies%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    raise exception 'SHIFT_POLICY_FORBIDDEN' using errcode = '42501';
  end if;

  if p_start_open_before_minutes is not null
     and p_start_open_before_minutes not between 0 and 1440 then
    raise exception 'SHIFT_POLICY_INVALID_START_WINDOW' using errcode = '22023';
  end if;

  if p_minimum_work_minutes is not null
     and p_minimum_work_minutes not between 1 and 1440 then
    raise exception 'SHIFT_POLICY_INVALID_MINIMUM_DURATION' using errcode = '22023';
  end if;

  -- All policy writes lock the template before the policy row. Start uses
  -- the same order, so a policy edit cannot race its snapshot decision.
  select t.*
    into v_template
  from public.organization_shift_templates t
  where t.id = p_shift_template_id
    and t.organization_id = p_organization_id
    and t.is_active = true
    and t.archived_at is null
  for update;

  if not found then
    raise exception 'SHIFT_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select p.*
    into v_before
  from public.organization_shift_attendance_policies p
  where p.organization_id = p_organization_id
    and p.shift_template_id = p_shift_template_id
  for update;

  insert into public.organization_shift_attendance_policies (
    organization_id,
    shift_template_id,
    start_open_before_minutes,
    minimum_work_minutes,
    updated_by
  ) values (
    p_organization_id,
    p_shift_template_id,
    p_start_open_before_minutes,
    p_minimum_work_minutes,
    v_actor_id
  )
  on conflict (organization_id, shift_template_id) do update
  set start_open_before_minutes = excluded.start_open_before_minutes,
      minimum_work_minutes = excluded.minimum_work_minutes,
      updated_at = now(),
      updated_by = excluded.updated_by
  returning * into v_after;

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
    'shift_attendance_policy_updated',
    'organization_shift_attendance_policy',
    v_after.id,
    case when v_before.id is null then null else jsonb_build_object(
      'organization_id', v_before.organization_id,
      'shift_template_id', v_before.shift_template_id,
      'start_open_before_minutes', v_before.start_open_before_minutes,
      'minimum_work_minutes', v_before.minimum_work_minutes
    ) end,
    jsonb_build_object(
      'organization_id', v_after.organization_id,
      'shift_template_id', v_after.shift_template_id,
      'start_open_before_minutes', v_after.start_open_before_minutes,
      'minimum_work_minutes', v_after.minimum_work_minutes
    ),
    jsonb_build_object('source', 'shift_attendance_control')
  );

  return jsonb_build_object(
    'id', v_after.id,
    'organization_id', v_after.organization_id,
    'shift_template_id', v_after.shift_template_id,
    'start_open_before_minutes', v_after.start_open_before_minutes,
    'minimum_work_minutes', v_after.minimum_work_minutes,
    'policy_configured',
      v_after.start_open_before_minutes is not null
      and v_after.minimum_work_minutes is not null
  );
end;
$$;

create or replace function public.open_shift_attendance_start_now(
  p_organization_id uuid,
  p_shift_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_template public.organization_shift_templates%rowtype;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_occurrence record;
  v_now timestamptz := now();
  v_override public.organization_shift_attendance_overrides%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not public.has_organization_permission(v_actor_id, p_organization_id, 'shifts.update') then
    raise exception 'SHIFT_OVERRIDE_FORBIDDEN' using errcode = '42501';
  end if;

  -- The date is deliberately derived from database time in Riyadh. This RPC
  -- has no browser-supplied date parameter.
  select t.*
    into v_template
  from public.organization_shift_templates t
  where t.id = p_shift_template_id
    and t.organization_id = p_organization_id
    and t.is_active = true
    and t.archived_at is null
  for update;

  if not found then
    raise exception 'SHIFT_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_occurrence
  from public.resolve_shift_attendance_occurrence(
    p_organization_id,
    p_shift_template_id,
    null
  );

  if not found then
    raise exception 'SHIFT_NO_CURRENT_ASSIGNMENT' using errcode = '22023';
  end if;

  select p.*
    into v_policy
  from public.organization_shift_attendance_policies p
  where p.organization_id = p_organization_id
    and p.shift_template_id = p_shift_template_id
  for update;

  if not found
     or v_policy.start_open_before_minutes is null
     or v_policy.minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  if v_now >= v_occurrence.scheduled_start_at then
    return jsonb_build_object(
      'status', 'already_in_window',
      'server_now', v_now,
      'scheduled_business_date', v_occurrence.scheduled_business_date,
      'scheduled_start_at', v_occurrence.scheduled_start_at,
      'override_created', false
    );
  end if;

  insert into public.organization_shift_attendance_overrides (
    organization_id,
    shift_template_id,
    scheduled_business_date,
    override_opened_at,
    override_expires_at,
    opened_by
  ) values (
    p_organization_id,
    p_shift_template_id,
    v_occurrence.scheduled_business_date,
    v_now,
    v_occurrence.scheduled_start_at,
    v_actor_id
  )
  on conflict (organization_id, shift_template_id, scheduled_business_date) do update
  set override_opened_at = excluded.override_opened_at,
      override_expires_at = excluded.override_expires_at,
      opened_by = excluded.opened_by;

  select o.*
    into v_override
  from public.organization_shift_attendance_overrides o
  where o.organization_id = p_organization_id
    and o.shift_template_id = p_shift_template_id
    and o.scheduled_business_date = v_occurrence.scheduled_business_date;

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
    'shift_attendance_start_opened_manually',
    'organization_shift_attendance_override',
    v_override.id,
    jsonb_build_object(
      'shift_template_id', v_override.shift_template_id,
      'scheduled_business_date', v_override.scheduled_business_date,
      'override_opened_at', v_override.override_opened_at,
      'override_expires_at', v_override.override_expires_at
    ),
    jsonb_build_object('source', 'shift_attendance_control')
  );

  return jsonb_build_object(
    'status', 'opened',
    'server_now', v_now,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'override_opened_at', v_override.override_opened_at,
    'override_expires_at', v_override.override_expires_at,
    'override_created', true
  );
end;
$$;

create or replace function public.get_driver_shift_attendance_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_template public.organization_shift_templates%rowtype;
  v_assignment public.organization_shift_assignments%rowtype;
  v_occurrence record;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_open_shift public.driver_shifts%rowtype;
  v_now timestamptz := now();
  v_start_available_at timestamptz;
  v_end_available_at timestamptz;
  v_override_active boolean := false;
  v_policy_configured boolean := false;
  v_has_occurrence boolean := false;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;

  for v_assignment in
    select a.*
    from public.organization_shift_assignments a
    where a.organization_id = v_driver.organization_id
      and a.driver_id = v_driver.id
      and a.is_active = true
    order by a.assignment_start_date desc nulls last, a.created_at asc
  loop
    select t.*
      into v_template
    from public.organization_shift_templates t
    where t.id = v_assignment.shift_template_id
      and t.organization_id = v_assignment.organization_id
      and t.is_active = true
      and t.archived_at is null;

    if found then
      select *
        into v_occurrence
      from public.resolve_shift_attendance_occurrence(
        v_driver.organization_id,
        v_template.id,
        v_driver.id
      );

      if found then
        v_has_occurrence := true;
        exit;
      end if;
    end if;
  end loop;

  if not v_has_occurrence then
    return jsonb_build_object(
      'success', true,
      'server_now', v_now,
      'policy_configured', false,
      'state', 'no_current_assignment',
      'reason_code', 'SHIFT_NO_CURRENT_ASSIGNMENT'
    );
  end if;

  select p.*
    into v_policy
  from public.organization_shift_attendance_policies p
  where p.organization_id = v_driver.organization_id
    and p.shift_template_id = v_template.id;

  v_policy_configured := found
    and v_policy.start_open_before_minutes is not null
    and v_policy.minimum_work_minutes is not null;

  if v_policy_configured then
    v_start_available_at := v_occurrence.scheduled_start_at
      - make_interval(mins => v_policy.start_open_before_minutes);
  end if;

  select o.*
    into v_override
  from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id
    and o.shift_template_id = v_template.id
    and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now
    and o.override_expires_at > v_now;

  v_override_active := found;

  select ds.*
    into v_open_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open'
  order by ds.started_at desc
  limit 1;

  if found and v_open_shift.applied_minimum_work_minutes is not null then
    v_end_available_at := v_open_shift.started_at
      + make_interval(mins => v_open_shift.applied_minimum_work_minutes);
  end if;

  return jsonb_build_object(
    'success', true,
    'server_now', v_now,
    'shift_template_id', v_template.id,
    'scheduled_business_date', v_occurrence.scheduled_business_date,
    'scheduled_start_at', v_occurrence.scheduled_start_at,
    'scheduled_end_at', v_occurrence.scheduled_end_at,
    'policy_configured', v_policy_configured,
    'start_open_before_minutes', case when v_policy_configured then v_policy.start_open_before_minutes else null end,
    'start_available_at', v_start_available_at,
    'start_override_active', v_override_active,
    'can_start_now',
      v_policy_configured
      and v_open_shift.id is null
      and (v_override_active or v_now >= v_start_available_at),
    'actual_started_at', case when v_open_shift.id is null then null else v_open_shift.started_at end,
    'minimum_work_minutes', case when v_policy_configured then v_policy.minimum_work_minutes else null end,
    'end_available_at', v_end_available_at,
    'can_end_now',
      v_open_shift.id is not null
      and (
        (
          v_open_shift.attendance_control_version is null
          and v_open_shift.shift_template_id is null
          and v_open_shift.scheduled_business_date is null
          and v_open_shift.applied_start_open_before_minutes is null
          and v_open_shift.applied_minimum_work_minutes is null
        )
        or (v_end_available_at is not null and v_now >= v_end_available_at)
      ),
    'state', case
      when v_open_shift.id is not null
        and v_open_shift.attendance_control_version is null
        and v_open_shift.shift_template_id is null
        and v_open_shift.scheduled_business_date is null
        and v_open_shift.applied_start_open_before_minutes is null
        and v_open_shift.applied_minimum_work_minutes is null then 'legacy_open'
      when v_open_shift.id is not null then 'open'
      when not v_policy_configured then 'unconfigured'
      when v_override_active or v_now >= v_start_available_at then 'start_available'
      else 'waiting_for_start_window'
    end,
    'reason_code', case
      when v_open_shift.id is not null
        and v_open_shift.attendance_control_version is null
        and v_open_shift.shift_template_id is null
        and v_open_shift.scheduled_business_date is null
        and v_open_shift.applied_start_open_before_minutes is null
        and v_open_shift.applied_minimum_work_minutes is null then 'SHIFT_LEGACY_OPEN_SESSION'
      when not v_policy_configured then 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED'
      when v_open_shift.id is null and not (v_override_active or v_now >= v_start_available_at) then 'SHIFT_START_WINDOW_NOT_OPEN'
      else null
    end
  );
end;
$$;

create or replace function public.start_driver_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_vehicle public.fleet_vehicles%rowtype;
  v_template public.organization_shift_templates%rowtype;
  v_assignment public.organization_shift_assignments%rowtype;
  v_policy public.organization_shift_attendance_policies%rowtype;
  v_override public.organization_shift_attendance_overrides%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_occurrence record;
  v_selected_template_id uuid;
  v_now timestamptz := now();
  v_start_available_at timestamptz;
  v_plate text;
  v_has_occurrence boolean := false;
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  if p_photo_captured_at is null
     or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;

  -- Lock order is template -> policy -> override. Admin policy/override RPCs
  -- use the same order before making an attendance decision.
  for v_assignment in
    select a.*
    from public.organization_shift_assignments a
    where a.organization_id = v_driver.organization_id
      and a.driver_id = v_driver.id
      and a.is_active = true
    order by a.assignment_start_date desc nulls last, a.created_at asc
  loop
    select t.*
      into v_template
    from public.organization_shift_templates t
    where t.id = v_assignment.shift_template_id
      and t.organization_id = v_assignment.organization_id
      and t.is_active = true
      and t.archived_at is null;

    if found then
      select *
        into v_occurrence
      from public.resolve_shift_attendance_occurrence(
        v_driver.organization_id,
        v_template.id,
        v_driver.id
      );

      if found then
        v_has_occurrence := true;
        v_selected_template_id := v_template.id;
        exit;
      end if;
    end if;
  end loop;

  if not v_has_occurrence then
    raise exception 'SHIFT_NO_CURRENT_ASSIGNMENT' using errcode = '22023';
  end if;

  select t.*
    into v_template
  from public.organization_shift_templates t
  where t.id = v_selected_template_id
    and t.organization_id = v_driver.organization_id
    and t.is_active = true
    and t.archived_at is null
  for update;

  if not found then
    raise exception 'SHIFT_TEMPLATE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select *
    into v_occurrence
  from public.resolve_shift_attendance_occurrence(
    v_driver.organization_id,
    v_template.id,
    v_driver.id
  );

  if not found then
    raise exception 'SHIFT_NO_CURRENT_ASSIGNMENT' using errcode = '22023';
  end if;

  select p.*
    into v_policy
  from public.organization_shift_attendance_policies p
  where p.organization_id = v_driver.organization_id
    and p.shift_template_id = v_template.id
  for update;

  if not found
     or v_policy.start_open_before_minutes is null
     or v_policy.minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNCONFIGURED' using errcode = '22023';
  end if;

  v_start_available_at := v_occurrence.scheduled_start_at
    - make_interval(mins => v_policy.start_open_before_minutes);

  select o.*
    into v_override
  from public.organization_shift_attendance_overrides o
  where o.organization_id = v_driver.organization_id
    and o.shift_template_id = v_template.id
    and o.scheduled_business_date = v_occurrence.scheduled_business_date
    and o.override_opened_at <= v_now
    and o.override_expires_at > v_now
  for update;

  if v_now < v_start_available_at and not found then
    raise exception 'SHIFT_START_WINDOW_NOT_OPEN' using errcode = '42501';
  end if;

  select fv.*
    into v_vehicle
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and fv.archived_at is null
    and (fv.assigned_driver_id = v_driver.id or fv.authorized_driver_id = v_driver.id)
  order by case when fv.assigned_driver_id = v_driver.id then 0 else 1 end, fv.created_at desc
  limit 1;

  v_plate := coalesce(
    nullif(v_vehicle.plate_number, ''),
    nullif(v_driver.keeta_vehicle_plate_number, ''),
    nullif(v_driver.vehicle_number, '')
  );

  if v_plate is null then
    raise exception 'SHIFT_VEHICLE_UNAVAILABLE' using errcode = '22023';
  end if;

  insert into public.driver_shifts (
    driver_id,
    organization_id,
    vehicle_id,
    vehicle_plate_snapshot,
    status,
    attendance_control_version,
    shift_template_id,
    scheduled_business_date,
    applied_start_open_before_minutes,
    applied_minimum_work_minutes,
    started_at,
    start_odometer_reading,
    start_photo_path,
    start_photo_captured_at
  ) values (
    v_driver.id,
    v_driver.organization_id,
    v_vehicle.id,
    v_plate,
    'open',
    1,
    v_template.id,
    v_occurrence.scheduled_business_date,
    v_policy.start_open_before_minutes,
    v_policy.minimum_work_minutes,
    v_now,
    p_odometer_reading,
    p_photo_path,
    p_photo_captured_at
  )
  returning * into v_shift;

  return jsonb_build_object(
    'id', v_shift.id,
    'status', v_shift.status,
    'started_at', v_shift.started_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot,
    'shift_template_id', v_shift.shift_template_id,
    'scheduled_business_date', v_shift.scheduled_business_date,
    'applied_minimum_work_minutes', v_shift.applied_minimum_work_minutes
  );
exception
  when unique_violation then
    raise exception 'SHIFT_OPEN_EXISTS' using errcode = '23505';
end;
$$;

create or replace function public.end_driver_shift(
  p_odometer_reading bigint,
  p_photo_path text,
  p_photo_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_shift public.driver_shifts%rowtype;
  v_now timestamptz := now();
  v_end_available_at timestamptz;
  v_legacy_session boolean := false;
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING' using errcode = '22023';
  end if;

  if p_photo_captured_at is null
     or not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
  ) then
    raise exception 'SHIFT_PROFILE_UNAVAILABLE' using errcode = '42501';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE' using errcode = '42501';
  end if;

  select ds.*
    into v_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open'
  order by ds.started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'SHIFT_NO_OPEN_SHIFT' using errcode = 'P0002';
  end if;

  v_legacy_session :=
    v_shift.attendance_control_version is null
    and v_shift.shift_template_id is null
    and v_shift.scheduled_business_date is null
    and v_shift.applied_start_open_before_minutes is null
    and v_shift.applied_minimum_work_minutes is null;

  if not v_legacy_session and v_shift.applied_minimum_work_minutes is null then
    raise exception 'SHIFT_ATTENDANCE_POLICY_UNAVAILABLE' using errcode = '22023';
  end if;

  if not v_legacy_session then
    v_end_available_at := v_shift.started_at
      + make_interval(mins => v_shift.applied_minimum_work_minutes);
  end if;

  if not v_legacy_session and v_now < v_end_available_at then
    raise exception 'SHIFT_END_TOO_EARLY' using errcode = '42501';
  end if;

  if p_odometer_reading < v_shift.start_odometer_reading then
    raise exception 'SHIFT_END_BELOW_START' using errcode = '22023';
  end if;

  update public.driver_shifts
  set status = 'completed',
      ended_at = v_now,
      end_odometer_reading = p_odometer_reading,
      end_photo_path = p_photo_path,
      end_photo_captured_at = p_photo_captured_at
  where id = v_shift.id
    and status = 'open'
  returning * into v_shift;

  if not found then
    raise exception 'SHIFT_ALREADY_ENDED' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'id', v_shift.id,
    'status', v_shift.status,
    'started_at', v_shift.started_at,
    'ended_at', v_shift.ended_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'end_odometer_reading', v_shift.end_odometer_reading,
    'distance', v_shift.end_odometer_reading - v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot,
    'end_available_at', v_end_available_at
  );
end;
$$;

revoke all on function public.resolve_shift_attendance_occurrence(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.set_organization_shift_attendance_policy(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function public.set_organization_shift_attendance_policy(uuid, uuid, integer, integer)
  to authenticated;

revoke all on function public.open_shift_attendance_start_now(uuid, uuid)
  from public, anon;
grant execute on function public.open_shift_attendance_start_now(uuid, uuid)
  to authenticated;

revoke all on function public.get_driver_shift_attendance_context()
  from public, anon;
grant execute on function public.get_driver_shift_attendance_context()
  to authenticated;

revoke all on function public.start_driver_shift(bigint, text, timestamptz)
  from public, anon;
grant execute on function public.start_driver_shift(bigint, text, timestamptz)
  to authenticated;

revoke all on function public.end_driver_shift(bigint, text, timestamptz)
  from public, anon;
grant execute on function public.end_driver_shift(bigint, text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
