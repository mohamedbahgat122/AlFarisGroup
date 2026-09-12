-- Order work-shift operational controls foundation.
-- This migration changes schema/security metadata only; it does not alter
-- existing assignments or request rows.

alter table public.organization_order_period_templates
  add column if not exists is_published boolean not null default true,
  add column if not exists published_at timestamptz null,
  add column if not exists published_by uuid null references public.profiles(id) on delete set null;

create table if not exists public.organization_order_period_operational_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_period_template_id uuid not null,
  open_before_minutes integer null,
  close_after_minutes integer null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint organization_order_period_operational_policies_template_fk
    foreign key (order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id)
    on delete restrict,
  constraint organization_order_period_operational_policies_open_bounds
    check (open_before_minutes is null or open_before_minutes between 0 and 1440),
  constraint organization_order_period_operational_policies_close_bounds
    check (close_after_minutes is null or close_after_minutes between 0 and 1440),
  constraint organization_order_period_operational_policies_unique_template
    unique (organization_id, order_period_template_id)
);

create table if not exists public.organization_order_period_open_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_period_template_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  scheduled_business_date date not null,
  opened_at timestamptz not null,
  expires_at timestamptz not null,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_order_period_open_overrides_template_fk
    foreign key (order_period_template_id, organization_id)
    references public.organization_order_period_templates(id, organization_id)
    on delete restrict,
  constraint organization_order_period_open_overrides_expiry_check
    check (expires_at > opened_at),
  constraint organization_order_period_open_overrides_unique_occurrence
    unique (organization_id, order_period_template_id, driver_id, scheduled_business_date)
);

create index if not exists organization_order_period_open_overrides_active_idx
  on public.organization_order_period_open_overrides
    (organization_id, order_period_template_id, driver_id, scheduled_business_date, expires_at);

alter table public.organization_order_period_operational_policies enable row level security;
alter table public.organization_order_period_open_overrides enable row level security;
revoke all on public.organization_order_period_operational_policies from public, anon, authenticated;
revoke all on public.organization_order_period_open_overrides from public, anon, authenticated;
grant select on public.organization_order_period_operational_policies to authenticated;
grant select on public.organization_order_period_open_overrides to authenticated;
grant select, insert, update, delete on public.organization_order_period_operational_policies to service_role;
grant select, insert, update, delete on public.organization_order_period_open_overrides to service_role;

create or replace function public.set_order_period_operational_policy(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_open_before_minutes integer,
  p_close_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.organization_order_period_templates%rowtype;
  v_before public.organization_order_period_operational_policies%rowtype;
  v_after public.organization_order_period_operational_policies%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor, p_organization_id, 'order_periods.manage') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if p_open_before_minutes is not null and p_open_before_minutes not between 0 and 1440
     or p_close_after_minutes is not null and p_close_after_minutes not between 0 and 1440 then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_INVALID');
  end if;

  select * into v_template
  from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id
  for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND'); end if;

  select * into v_before
  from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id
  for update;

  insert into public.organization_order_period_operational_policies (
    organization_id, order_period_template_id, open_before_minutes, close_after_minutes,
    created_by, updated_by
  ) values (
    p_organization_id, p_order_period_template_id, p_open_before_minutes, p_close_after_minutes,
    v_actor, v_actor
  )
  on conflict (organization_id, order_period_template_id) do update
  set open_before_minutes = excluded.open_before_minutes,
      close_after_minutes = excluded.close_after_minutes,
      updated_at = timezone('utc', now()), updated_by = excluded.updated_by
  returning * into v_after;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    v_actor, p_organization_id, 'order_shift_operational_policy_updated',
    'organization_order_period_operational_policy', v_after.id,
    case when v_before.id is null then null else jsonb_build_object(
      'open_before_minutes', v_before.open_before_minutes,
      'close_after_minutes', v_before.close_after_minutes
    ) end,
    jsonb_build_object(
      'open_before_minutes', v_after.open_before_minutes,
      'close_after_minutes', v_after.close_after_minutes
    ), jsonb_build_object('order_period_template_id', p_order_period_template_id)
  );
  return jsonb_build_object('success', true, 'id', v_after.id,
    'open_before_minutes', v_after.open_before_minutes,
    'close_after_minutes', v_after.close_after_minutes);
end;
$$;

create or replace function public.resolve_order_period_occurrence(
  p_organization_id uuid,
  p_order_period_template_id uuid,
  p_driver_id uuid default null
)
returns table (
  scheduled_business_date date,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  assignment_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_assignment uuid;
begin
  select * into v_template from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id
    and is_active and archived_at is null and is_published;
  if not found then return; end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then return; end if;

  for v_date in select v_today union all select v_today - 1 loop
    if v_date = v_today - 1 and not v_template.crosses_midnight then continue; end if;
    v_start := (v_date + v_template.start_time) at time zone 'Asia/Riyadh';
    v_end := (v_date + case when v_template.crosses_midnight then 1 else 0 end + v_template.end_time) at time zone 'Asia/Riyadh';
    select a.id into v_assignment from public.organization_order_period_assignments a
    where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
      and (p_driver_id is null or a.driver_id = p_driver_id) and a.is_active
      and a.assignment_start_date <= v_date and (a.assignment_end_date is null or a.assignment_end_date >= v_date)
    order by a.assignment_start_date desc, a.created_at asc limit 1;
    if found and now() >= v_start - make_interval(mins => v_policy.open_before_minutes)
       and now() < v_end + make_interval(mins => v_policy.close_after_minutes) then
      return query select v_date, v_start, v_end,
        v_start - make_interval(mins => v_policy.open_before_minutes),
        v_end + make_interval(mins => v_policy.close_after_minutes), v_assignment;
      return;
    end if;
  end loop;

  v_date := v_today;
  v_start := (v_date + v_template.start_time) at time zone 'Asia/Riyadh';
  v_end := (v_date + case when v_template.crosses_midnight then 1 else 0 end + v_template.end_time) at time zone 'Asia/Riyadh';
  select a.id into v_assignment from public.organization_order_period_assignments a
  where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
    and (p_driver_id is null or a.driver_id = p_driver_id) and a.is_active
    and a.assignment_start_date <= v_date and (a.assignment_end_date is null or a.assignment_end_date >= v_date)
  order by a.assignment_start_date desc, a.created_at asc limit 1;
  if found then
    return query select v_date, v_start, v_end,
      v_start - make_interval(mins => v_policy.open_before_minutes),
      v_end + make_interval(mins => v_policy.close_after_minutes), v_assignment;
  end if;
end;
$$;

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
  v_existing uuid;
begin
  if v_actor is null or not public.has_organization_permission(v_actor, p_organization_id, 'order_periods.assign') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  select * into v_template from public.organization_order_period_templates
  where id = p_order_period_template_id and organization_id = p_organization_id for update;
  if not found or not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_TEMPLATE_INVALID');
  end if;
  if not v_template.is_published then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNPUBLISHED'); end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = p_organization_id and order_period_template_id = p_order_period_template_id for update;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;
  select d.id into v_existing from public.drivers d
  where d.id = p_driver_id and d.organization_id = p_organization_id
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_INVALID'); end if;

  perform 1 from public.organization_order_period_assignments a
  where a.organization_id = p_organization_id and a.order_period_template_id = p_order_period_template_id
    and a.driver_id = p_driver_id and a.is_active
    and a.assignment_start_date <= (v_now at time zone 'Asia/Riyadh')::date
    and (a.assignment_end_date is null or a.assignment_end_date >= (v_now at time zone 'Asia/Riyadh')::date)
  order by a.id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_DRIVER_NOT_ASSIGNED'); end if;
  select * into v_occ from public.resolve_order_period_occurrence(p_organization_id, p_order_period_template_id, p_driver_id);
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NO_CURRENT_OCCURRENCE'); end if;
  if v_now >= v_occ.closes_at then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_WINDOW_CLOSED'); end if;
  if v_now >= v_occ.opens_at then
    return jsonb_build_object('success', true, 'status', 'already_open', 'scheduled_business_date', v_occ.scheduled_business_date);
  end if;

  insert into public.organization_order_period_open_overrides (
    organization_id, order_period_template_id, driver_id, scheduled_business_date,
    opened_at, expires_at, opened_by
  ) values (
    p_organization_id, p_order_period_template_id, p_driver_id, v_occ.scheduled_business_date,
    v_now, v_occ.closes_at, v_actor
  ) on conflict (organization_id, order_period_template_id, driver_id, scheduled_business_date) do update
    set opened_at = excluded.opened_at, expires_at = excluded.expires_at,
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
      'opened_at', v_now, 'expires_at', v_occ.closes_at),
    jsonb_build_object('order_period_template_id', p_order_period_template_id)
  );
  return jsonb_build_object('success', true, 'status', 'opened',
    'scheduled_business_date', v_occ.scheduled_business_date, 'expires_at', v_occ.closes_at);
end;
$$;

create or replace function public.get_my_current_order_shift_operational_context()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_driver public.drivers%rowtype;
  v_template public.organization_order_period_templates%rowtype;
  v_policy public.organization_order_period_operational_policies%rowtype;
  v_occ record;
  v_override public.organization_order_period_open_overrides%rowtype;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
  v_opens timestamptz;
  v_closes timestamptz;
  v_date date;
begin
  if v_user is null then return jsonb_build_object('success', false, 'state', 'no_assignment', 'reason_code', 'AUTH_REQUIRED'); end if;
  select d.* into v_driver from public.drivers d join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_user and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type
    and p.role = 'driver'::public.app_role and p.status = 'active'::public.account_status
    and p.deleted_at is null and p.must_change_password = false;
  if not found then return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_DRIVER_NOT_FOUND'); end if;
  select t.* into v_template
  from public.organization_order_period_assignments a join public.organization_order_period_templates t
    on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_driver.organization_id and a.driver_id = v_driver.id and a.is_active
    and a.assignment_start_date <= v_today and (a.assignment_end_date is null or a.assignment_end_date >= v_today)
  order by a.assignment_start_date desc, a.created_at asc limit 1;
  if not found then return jsonb_build_object('success', true, 'state', 'no_assignment', 'reason_code', 'ORDER_PERIOD_NO_CURRENT_ASSIGNMENT'); end if;
  if not v_template.is_active or v_template.archived_at is not null then
    return jsonb_build_object('success', true, 'state', 'disabled', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_TEMPLATE_DISABLED');
  end if;
  if not v_template.is_published then
    return jsonb_build_object('success', true, 'state', 'unpublished', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_UNPUBLISHED');
  end if;
  select * into v_policy from public.organization_order_period_operational_policies
  where organization_id = v_driver.organization_id and order_period_template_id = v_template.id;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then
    return jsonb_build_object('success', true, 'state', 'policy_unconfigured',
      'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED');
  end if;
  select * into v_occ from public.resolve_order_period_occurrence(v_driver.organization_id, v_template.id, v_driver.id);
  if not found then return jsonb_build_object('success', true, 'state', 'closed', 'template_id', v_template.id, 'template_name', v_template.name, 'reason_code', 'ORDER_PERIOD_CLOSED'); end if;
  select * into v_override from public.organization_order_period_open_overrides o
  where o.organization_id = v_driver.organization_id and o.order_period_template_id = v_template.id
    and o.driver_id = v_driver.id and o.scheduled_business_date = v_occ.scheduled_business_date
    and o.opened_at <= v_now and o.expires_at > v_now;
  return jsonb_build_object('success', true,
    'state', case when v_now >= v_occ.opens_at and v_now < v_occ.closes_at then case when found then 'manually_opened' else 'open' end
      when found then 'manually_opened' else 'before_open_window' end,
    'server_now', v_now, 'template_id', v_template.id, 'template_name', v_template.name,
    'scheduled_business_date', v_occ.scheduled_business_date, 'scheduled_start_at', v_occ.scheduled_start_at,
    'scheduled_end_at', v_occ.scheduled_end_at, 'opens_at', v_occ.opens_at, 'closes_at', v_occ.closes_at,
    'is_open_now', (v_now >= v_occ.opens_at and v_now < v_occ.closes_at) or found,
    'manual_override_active', found, 'reason_code', null);
end;
$$;

create or replace function public.order_period_request_target_is_effective()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organization_order_period_templates t
    where t.id = new.requested_order_period_template_id and t.organization_id = new.organization_id
      and t.is_active and t.archived_at is null and t.is_published
  ) then raise exception 'ORDER_SHIFT_CHANGE_TEMPLATE_INVALID'; end if;
  return new;
end;
$$;

drop trigger if exists driver_order_shift_change_request_target_lifecycle_check
  on public.driver_order_shift_change_requests;
create trigger driver_order_shift_change_request_target_lifecycle_check
before insert or update of requested_order_period_template_id, status
on public.driver_order_shift_change_requests
for each row execute function public.order_period_request_target_is_effective();

-- Keep the Driver target list aligned with the same lifecycle gate used by
-- the request trigger. Existing active templates remain effective because
-- is_published defaults to true for legacy rows.
create or replace function public.get_my_order_shift_change_request_window()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver_id uuid;
  v_organization_id uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_weekday smallint := extract(dow from (now() at time zone 'Asia/Riyadh'))::smallint;
  v_target_week date := public.get_order_shift_change_target_week_start(now());
  v_allowed smallint[] := '{}'::smallint[];
  v_current_template_id uuid;
  v_driver_count integer;
  v_current_count integer;
  v_pending boolean := false;
  v_templates jsonb := '[]'::jsonb;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'reason_code', 'ORDER_SHIFT_CHANGE_AUTH_REQUIRED'); end if;
  select count(*) into v_driver_count from public.drivers d
    join public.organizations o on o.id = d.organization_id and o.is_active
    join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor and p.id = v_actor and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if v_driver_count > 1 then raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_DRIVERS'; end if;
  select d.id, d.organization_id into v_driver_id, v_organization_id from public.drivers d
    join public.organizations o on o.id = d.organization_id and o.is_active
    join public.profiles p on p.id = d.auth_user_id
  where d.auth_user_id = v_actor and p.id = v_actor and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status and p.deleted_at is null and p.must_change_password = false
    and d.status = 'active'::public.driver_status and d.deleted_at is null
    and d.settlement_type = 'per_order'::public.driver_settlement_type;
  if v_driver_id is null then return jsonb_build_object('success', true, 'today_riyadh', v_today,
    'weekday_riyadh', v_weekday, 'allowed_weekdays', v_allowed, 'can_submit_today', false,
    'target_week_start', v_target_week, 'has_pending_request', false,
    'reason_code', 'ORDER_SHIFT_CHANGE_DRIVER_NOT_FOUND', 'templates', v_templates); end if;
  select coalesce(s.allowed_weekdays, '{}'::smallint[]) into v_allowed
    from public.organization_order_shift_change_settings s where s.organization_id = v_organization_id;
  select count(*), max(a.order_period_template_id) into v_current_count, v_current_template_id
    from public.organization_order_period_assignments a
    join public.organization_order_period_templates t on t.id = a.order_period_template_id and t.organization_id = a.organization_id
  where a.organization_id = v_organization_id and a.driver_id = v_driver_id and a.is_active
    and v_today >= a.assignment_start_date and (a.assignment_end_date is null or v_today <= a.assignment_end_date)
    and t.is_active and t.archived_at is null and t.is_published;
  if v_current_count > 1 then raise exception 'ORDER_SHIFT_CHANGE_DATA_INTEGRITY_MULTIPLE_CURRENT_ASSIGNMENTS'; end if;
  select exists(select 1 from public.driver_order_shift_change_requests r where r.driver_id = v_driver_id
    and r.requested_week_start_date = v_target_week and r.status = 'pending') into v_pending;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'start_time', t.start_time,
    'end_time', t.end_time, 'crosses_midnight', t.crosses_midnight) order by t.start_time, t.id), '[]'::jsonb)
    into v_templates from public.organization_order_period_templates t
  where t.organization_id = v_organization_id and t.is_active and t.archived_at is null
    and t.is_published and t.id <> v_current_template_id;
  return jsonb_build_object('success', true, 'today_riyadh', v_today, 'weekday_riyadh', v_weekday,
    'allowed_weekdays', v_allowed, 'can_submit_today', v_allowed @> array[v_weekday]::smallint[]
      and not v_pending and v_current_template_id is not null, 'target_week_start', v_target_week,
    'has_pending_request', v_pending, 'reason_code', case when v_current_template_id is null
      then 'ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT' when not (v_allowed @> array[v_weekday]::smallint[])
      then 'ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED' when v_pending then 'ORDER_SHIFT_CHANGE_PENDING_REQUEST_EXISTS'
      else null end, 'templates', v_templates);
end;
$$;

create or replace function public.publish_order_period_template(p_template_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor,p_organization_id,'order_periods.manage') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  if not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_published=true, published_at=coalesce(published_at,timezone('utc',now())), published_by=v_actor, updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_published','organization_order_period_template',p_template_id,jsonb_build_object('is_published',v_template.is_published,'published_at',v_template.published_at),jsonb_build_object('is_published',true));
  return jsonb_build_object('success',true,'template_id',p_template_id);
end; $$;

create or replace function public.unpublish_order_period_template(p_template_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor,p_organization_id,'order_periods.manage') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_published=false,published_at=null,published_by=null,updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_unpublished','organization_order_period_template',p_template_id,jsonb_build_object('is_published',v_template.is_published),jsonb_build_object('is_published',false));
  return jsonb_build_object('success',true,'template_id',p_template_id);
end; $$;

create or replace function public.disable_order_period_template(p_template_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor,p_organization_id,'order_periods.manage') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_active=false,updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(v_actor,p_organization_id,'order_shift_disabled','organization_order_period_template',p_template_id);
  return jsonb_build_object('success',true,'template_id',p_template_id);
end; $$;

create or replace function public.enable_order_period_template(p_template_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor is null or not public.has_organization_permission(v_actor,p_organization_id,'order_periods.manage') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_active=true,updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(v_actor,p_organization_id,'order_shift_enabled','organization_order_period_template',p_template_id);
  return jsonb_build_object('success',true,'template_id',p_template_id);
end; $$;

-- Preserve the deployed archive signature and make archive explicitly
-- ineffective without touching assignments.
create or replace function public.archive_order_period_template(p_template_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype; v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if v_actor is null or not public.has_organization_permission(v_actor,p_organization_id,'order_periods.manage') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  if exists(select 1 from public.organization_order_period_assignments where order_period_template_id=p_template_id and is_active and (assignment_end_date is null or assignment_end_date >= v_today)) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_HAS_CURRENT_OR_FUTURE_ASSIGNMENTS'); end if;
  update public.organization_order_period_templates set is_active=false, is_published=false, published_at=null, published_by=null, archived_at=timezone('utc',now()), archived_by=v_actor, updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_archived','organization_order_period_template',p_template_id,jsonb_build_object('is_active',v_template.is_active,'is_published',v_template.is_published),jsonb_build_object('is_active',false,'is_published',false,'archived_at',timezone('utc',now())));
  return jsonb_build_object('success',true,'template_id',p_template_id);
end; $$;

revoke all on function public.set_order_period_operational_policy(uuid,uuid,integer,integer) from public, anon;
revoke all on function public.resolve_order_period_occurrence(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.open_driver_order_period_now(uuid,uuid,uuid) from public, anon;
revoke all on function public.get_my_current_order_shift_operational_context() from public, anon;
revoke all on function public.publish_order_period_template(uuid,uuid) from public, anon;
revoke all on function public.unpublish_order_period_template(uuid,uuid) from public, anon;
revoke all on function public.disable_order_period_template(uuid,uuid) from public, anon;
revoke all on function public.enable_order_period_template(uuid,uuid) from public, anon;
revoke all on function public.archive_order_period_template(uuid,uuid) from public, anon;
grant execute on function public.set_order_period_operational_policy(uuid,uuid,integer,integer) to authenticated, service_role;
grant execute on function public.open_driver_order_period_now(uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.get_my_current_order_shift_operational_context() to authenticated, service_role;
grant execute on function public.publish_order_period_template(uuid,uuid) to authenticated, service_role;
grant execute on function public.unpublish_order_period_template(uuid,uuid) to authenticated, service_role;
grant execute on function public.disable_order_period_template(uuid,uuid) to authenticated, service_role;
grant execute on function public.enable_order_period_template(uuid,uuid) to authenticated, service_role;
grant execute on function public.archive_order_period_template(uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
