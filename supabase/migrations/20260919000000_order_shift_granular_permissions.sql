begin;

-- Keep the legacy manage key for compatibility, while making the new
-- capabilities independently assignable.
create or replace function public.organization_permission_keys()
returns text[] language sql stable set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'drivers.create', 'drivers.update',
    'drivers.status', 'drivers.archive', 'drivers.documents.view', 'drivers.documents.download',
    'drivers.activity.view', 'drivers.account.manage', 'driver_reports.view', 'driver_reports.import',
    'driver_reports.replace', 'driver_reports.details.view', 'driver_order_reports.view',
    'driver_order_reports.import', 'driver_order_reports.replace', 'driver_order_reports.details.view',
    'driver_order_reports.edit', 'fleet.cars.view', 'fleet.motorcycles.view', 'fleet.create',
    'fleet.update', 'fleet.technical_status', 'fleet.operational_status', 'fleet.archive',
    'fleet.operating_card.download', 'fleet.activity.view', 'fuel.manage', 'fuel.reports.view',
    'fuel.increase.review', 'app_requests.view', 'app_requests.review', 'odometer.manage',
    'notifications.view', 'driver_warnings.view', 'driver_warnings.issue', 'driver_warnings.revoke',
    'entitlements.view', 'entitlements.create_transaction', 'entitlements.view_transactions',
    'entitlements.reverse_transaction', 'entitlements.publish', 'shifts.view', 'shifts.create',
    'shifts.update', 'shifts.assign', 'shifts.archive', 'maintenance_providers.view',
    'maintenance_providers.manage', 'maintenance_jobs.view', 'maintenance_jobs.assign',
    'maintenance_jobs.cancel', 'maintenance_materials.view', 'maintenance_materials.manage',
    'order_periods.view', 'order_periods.manage', 'order_periods.create', 'order_periods.update',
    'order_periods.assign', 'order_periods.open_now', 'order_periods.requests.review',
    'order_periods.settings', 'order_periods.archive'
  ]::text[];
$$;

create or replace function public.view_only_organization_permission_keys()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'driver_reports.view', 'driver_order_reports.view',
    'fleet.cars.view', 'fleet.motorcycles.view', 'fuel.reports.view', 'app_requests.view',
    'odometer.manage', 'notifications.view', 'driver_warnings.view', 'entitlements.view',
    'entitlements.view_transactions', 'shifts.view', 'maintenance_providers.view',
    'maintenance_jobs.view', 'maintenance_materials.view', 'order_periods.view'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;
alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check
  check (permission_key = any (public.organization_permission_keys()));

insert into public.organization_user_permissions (user_id, organization_id, permission_key, granted_by, updated_by)
select user_id, organization_id, granular.permission_key, granted_by, granted_by
from public.organization_user_permissions legacy
cross join unnest(array[
  'order_periods.view','order_periods.create','order_periods.update','order_periods.assign',
  'order_periods.open_now','order_periods.requests.review','order_periods.settings','order_periods.archive'
]::text[]) granular(permission_key)
where legacy.permission_key = 'order_periods.manage'
on conflict (user_id, organization_id, permission_key) do nothing;

create or replace function public.has_order_period_permission(
  p_actor_id uuid,
  p_organization_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_organization_permission(p_actor_id, p_organization_id, p_permission_key)
    or public.has_organization_permission(p_actor_id, p_organization_id, 'order_periods.manage');
$$;

revoke all on function public.has_order_period_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.has_order_period_permission(uuid, uuid, text) to service_role;

drop policy if exists organization_order_shift_change_settings_select_scoped on public.organization_order_shift_change_settings;
create policy organization_order_shift_change_settings_select_scoped
on public.organization_order_shift_change_settings for select to authenticated
using (
  public.has_current_user_organization_permission(organization_id, 'order_periods.view')
  or public.has_current_user_organization_permission(organization_id, 'order_periods.settings')
  or public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
);

drop policy if exists driver_order_shift_change_requests_select_scoped on public.driver_order_shift_change_requests;
create policy driver_order_shift_change_requests_select_scoped
on public.driver_order_shift_change_requests for select to authenticated
using (
  exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.auth_user_id
    where d.id = driver_order_shift_change_requests.driver_id
      and d.organization_id = driver_order_shift_change_requests.organization_id
      and d.auth_user_id = auth.uid()
      and p.id = auth.uid()
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.must_change_password = false
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
      and d.settlement_type = 'per_order'::public.driver_settlement_type
  )
  or public.has_current_user_organization_permission(organization_id, 'order_periods.view')
  or public.has_current_user_organization_permission(organization_id, 'order_periods.requests.review')
  or public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
);

create or replace function public.create_order_period_template(
  p_organization_id uuid, p_name text, p_start_time time, p_end_time time,
  p_crosses_midnight boolean, p_has_break boolean, p_break_start_time time, p_break_end_time time
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := auth.uid(); v_template_id uuid;
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id, p_organization_id, 'order_periods.create') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_start_time is null or p_end_time is null
     or p_crosses_midnight is null or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time)
     or (not p_has_break and (p_break_start_time is not null or p_break_end_time is not null))
     or (p_has_break and not public.is_valid_order_period_break(p_start_time, p_end_time, p_crosses_midnight, p_break_start_time, p_break_end_time)) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;
  insert into public.organization_order_period_templates
    (organization_id, name, start_time, end_time, crosses_midnight, has_break, break_start_time, break_end_time, created_by, updated_by)
  values (p_organization_id, btrim(p_name), p_start_time, p_end_time, p_crosses_midnight, p_has_break,
    case when p_has_break then p_break_start_time end, case when p_has_break then p_break_end_time end, v_actor_id, v_actor_id)
  returning id into v_template_id;
  insert into public.activity_logs (actor_user_id, organization_id, action, entity_type, entity_id, after_data, metadata)
  values (v_actor_id, p_organization_id, 'order_period_template_created', 'organization_order_period_template', v_template_id,
    jsonb_build_object('name', btrim(p_name), 'start_time', p_start_time, 'end_time', p_end_time,
      'crosses_midnight', p_crosses_midnight, 'has_break', p_has_break, 'break_start_time', p_break_start_time, 'break_end_time', p_break_end_time),
    jsonb_build_object('organization_id', p_organization_id));
  return jsonb_build_object('success', true, 'template_id', v_template_id);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

create or replace function public.update_order_period_template(
  p_template_id uuid, p_organization_id uuid, p_name text, p_start_time time, p_end_time time,
  p_crosses_midnight boolean, p_has_break boolean, p_break_start_time time, p_break_end_time time
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id, p_organization_id, 'order_periods.update') then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_UNAUTHORIZED');
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ORGANIZATION_INVALID');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_start_time is null or p_end_time is null
     or p_crosses_midnight is null or p_start_time = p_end_time
     or (p_crosses_midnight and p_end_time > p_start_time)
     or (not p_crosses_midnight and p_end_time <= p_start_time)
     or (not p_has_break and (p_break_start_time is not null or p_break_end_time is not null))
     or (p_has_break and not public.is_valid_order_period_break(p_start_time, p_end_time, p_crosses_midnight, p_break_start_time, p_break_end_time)) then
    return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_INVALID_TEMPLATE');
  end if;
  select * into v_template from public.organization_order_period_templates where id = p_template_id and organization_id = p_organization_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NOT_FOUND'); end if;
  if not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set name=btrim(p_name), start_time=p_start_time, end_time=p_end_time,
    crosses_midnight=p_crosses_midnight, has_break=p_has_break,
    break_start_time=case when p_has_break then p_break_start_time end,
    break_end_time=case when p_has_break then p_break_end_time end, updated_by=v_actor_id where id=p_template_id;
  insert into public.activity_logs (actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (v_actor_id, p_organization_id, 'order_period_template_updated', 'organization_order_period_template', p_template_id,
    jsonb_build_object('name',v_template.name,'start_time',v_template.start_time,'end_time',v_template.end_time,'crosses_midnight',v_template.crosses_midnight,
      'has_break',v_template.has_break,'break_start_time',v_template.break_start_time,'break_end_time',v_template.break_end_time),
    jsonb_build_object('name',btrim(p_name),'start_time',p_start_time,'end_time',p_end_time,'crosses_midnight',p_crosses_midnight,
      'has_break',p_has_break,'break_start_time',p_break_start_time,'break_end_time',p_break_end_time), jsonb_build_object('organization_id',p_organization_id));
  return jsonb_build_object('success', true, 'template_id', p_template_id);
exception when unique_violation then return jsonb_build_object('success', false, 'error', 'ORDER_PERIOD_NAME_EXISTS');
end;
$$;

create or replace function public.set_order_period_start_end_policy(
  p_organization_id uuid, p_order_period_template_id uuid, p_open_before_minutes integer, p_minimum_work_minutes integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_template public.organization_order_period_templates%rowtype;
  v_before public.organization_order_period_operational_policies%rowtype; v_after public.organization_order_period_operational_policies%rowtype;
begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.settings') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  if (p_open_before_minutes is not null and p_open_before_minutes not between 0 and 1440) or (p_minimum_work_minutes is not null and p_minimum_work_minutes not between 0 and 1440) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_OPERATIONAL_POLICY_INVALID'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_order_period_template_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  select * into v_before from public.organization_order_period_operational_policies where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id for update;
  insert into public.organization_order_period_operational_policies (organization_id,order_period_template_id,open_before_minutes,close_after_minutes,end_before_minutes,minimum_work_minutes,created_by,updated_by)
  values (p_organization_id,p_order_period_template_id,p_open_before_minutes,v_before.close_after_minutes,p_minimum_work_minutes,v_before.minimum_work_minutes,v_actor,v_actor)
  on conflict (organization_id,order_period_template_id) do update set open_before_minutes=excluded.open_before_minutes,end_before_minutes=excluded.end_before_minutes,updated_at=timezone('utc',now()),updated_by=excluded.updated_by
  returning * into v_after;
  insert into public.activity_logs (actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values (v_actor,p_organization_id,'order_shift_operational_policy_updated','organization_order_period_operational_policy',v_after.id,
    case when v_before.id is null then null else jsonb_build_object('open_before_minutes',v_before.open_before_minutes,'end_before_minutes',v_before.end_before_minutes,'minimum_work_minutes',v_before.minimum_work_minutes) end,
    jsonb_build_object('open_before_minutes',v_after.open_before_minutes,'end_before_minutes',v_after.end_before_minutes,'minimum_work_minutes',v_after.minimum_work_minutes),jsonb_build_object('order_period_template_id',p_order_period_template_id));
  return jsonb_build_object('success',true,'id',v_after.id,'open_before_minutes',v_after.open_before_minutes,'end_before_minutes',v_after.end_before_minutes,'minimum_work_minutes',v_after.minimum_work_minutes);
end;
$$;

create or replace function public.set_organization_order_shift_change_settings(p_organization_id uuid,p_allowed_weekdays smallint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid:=auth.uid(); v_allowed smallint[]; v_previous_allowed smallint[]; v_previous_exists boolean:=false;
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id,p_organization_id,'order_periods.settings') then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_SETTINGS_UNAUTHORIZED'); end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and is_active) then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_ORGANIZATION_INVALID'); end if;
  if exists(select 1 from unnest(coalesce(p_allowed_weekdays,'{}'::smallint[])) x where x<0 or x>6) then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_INVALID_WEEKDAY'); end if;
  select public.normalize_order_shift_change_weekdays(p_allowed_weekdays) into v_allowed;
  select allowed_weekdays into v_previous_allowed from public.organization_order_shift_change_settings where organization_id=p_organization_id for update;
  v_previous_exists:=found;
  insert into public.organization_order_shift_change_settings(organization_id,allowed_weekdays,updated_at,updated_by) values(p_organization_id,v_allowed,timezone('utc',now()),v_actor_id)
  on conflict(organization_id) do update set allowed_weekdays=excluded.allowed_weekdays,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data,metadata) values(v_actor_id,p_organization_id,'order_shift_change_settings_updated','organization_order_shift_change_settings',p_organization_id,
    case when v_previous_exists then jsonb_build_object('organization_id',p_organization_id,'allowed_weekdays',v_previous_allowed) else null end,
    jsonb_build_object('organization_id',p_organization_id,'allowed_weekdays',v_allowed),jsonb_build_object('organization_id',p_organization_id));
  return jsonb_build_object('success',true,'allowed_weekdays',v_allowed);
end; $$;

create or replace function public.open_driver_order_period_now(p_organization_id uuid,p_order_period_template_id uuid,p_driver_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_template public.organization_order_period_templates%rowtype; v_policy public.organization_order_period_operational_policies%rowtype; v_occ record; v_now timestamptz:=now();
begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.open_now') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_order_period_template_id and organization_id=p_organization_id for update;
  if not found or not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_TEMPLATE_INVALID'); end if;
  if not v_template.is_published then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNPUBLISHED'); end if;
  select * into v_policy from public.organization_order_period_operational_policies where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id for update;
  if not found or v_policy.open_before_minutes is null or v_policy.close_after_minutes is null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_OPERATIONAL_POLICY_UNCONFIGURED'); end if;
  if not exists(select 1 from public.drivers d where d.id=p_driver_id and d.organization_id=p_organization_id and d.status='active'::public.driver_status and d.deleted_at is null and d.settlement_type='per_order'::public.driver_settlement_type) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_DRIVER_INVALID'); end if;
  if not exists(select 1 from public.organization_order_period_assignments a where a.organization_id=p_organization_id and a.order_period_template_id=p_order_period_template_id and a.driver_id=p_driver_id and a.is_active and a.assignment_start_date <= (v_now at time zone 'Asia/Riyadh')::date and (a.assignment_end_date is null or a.assignment_end_date >= (v_now at time zone 'Asia/Riyadh')::date)) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_DRIVER_NOT_ASSIGNED'); end if;
  select * into v_occ from public.resolve_order_period_occurrence(p_organization_id,p_order_period_template_id,p_driver_id);
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NO_CURRENT_OCCURRENCE'); end if;
  if exists(select 1 from public.driver_shifts ds where ds.driver_id=p_driver_id and ds.organization_id=p_organization_id and ds.shift_template_id is null and ds.order_period_template_id=p_order_period_template_id and ds.scheduled_business_date=v_occ.scheduled_business_date) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ATTENDANCE_ALREADY_EXISTS'); end if;
  if v_now >= v_occ.scheduled_end_at then return jsonb_build_object('success',false,'error','ORDER_PERIOD_OCCURRENCE_EXPIRED'); end if;
  if v_now >= v_occ.opens_at then return jsonb_build_object('success',true,'status','already_open','scheduled_business_date',v_occ.scheduled_business_date); end if;
  insert into public.organization_order_period_open_overrides(organization_id,order_period_template_id,driver_id,scheduled_business_date,opened_at,expires_at,opened_by)
  values(p_organization_id,p_order_period_template_id,p_driver_id,v_occ.scheduled_business_date,v_now,v_occ.scheduled_end_at,v_actor)
  on conflict(organization_id,order_period_template_id,driver_id,scheduled_business_date) do update set opened_at=excluded.opened_at,expires_at=excluded.expires_at,opened_by=excluded.opened_by,updated_at=timezone('utc',now());
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,after_data,metadata) values(v_actor,p_organization_id,'order_shift_driver_opened_now','organization_order_period_open_override',(select id from public.organization_order_period_open_overrides where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id and driver_id=p_driver_id and scheduled_business_date=v_occ.scheduled_business_date),jsonb_build_object('driver_id',p_driver_id,'scheduled_business_date',v_occ.scheduled_business_date,'opened_at',v_now,'expires_at',v_occ.scheduled_end_at),jsonb_build_object('order_period_template_id',p_order_period_template_id,'override_lifetime','scheduled_occurrence_end'));
  return jsonb_build_object('success',true,'status','opened','scheduled_business_date',v_occ.scheduled_business_date,'expires_at',v_occ.scheduled_end_at);
end; $$;

create or replace function public.publish_order_period_template(p_template_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_actor uuid:=auth.uid(); v_template public.organization_order_period_templates%rowtype; begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.archive') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update; if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  if not v_template.is_active or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_published=true,published_at=coalesce(published_at,timezone('utc',now())),published_by=v_actor,updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_published','organization_order_period_template',p_template_id,jsonb_build_object('is_published',v_template.is_published,'published_at',v_template.published_at),jsonb_build_object('is_published',true)); return jsonb_build_object('success',true,'template_id',p_template_id); end; $$;

create or replace function public.unpublish_order_period_template(p_template_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_actor uuid:=auth.uid(); v_template public.organization_order_period_templates%rowtype; begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.archive') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update; if not found or v_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ARCHIVED'); end if;
  update public.organization_order_period_templates set is_published=false,published_at=null,published_by=null,updated_by=v_actor where id=p_template_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_unpublished','organization_order_period_template',p_template_id,jsonb_build_object('is_published',v_template.is_published),jsonb_build_object('is_published',false));
  return jsonb_build_object('success',true,'template_id',p_template_id); end; $$;

create or replace function public.disable_order_period_template(p_template_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.archive') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  update public.organization_order_period_templates set is_active=false,updated_by=v_actor where id=p_template_id and organization_id=p_organization_id and archived_at is null; if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(v_actor,p_organization_id,'order_shift_disabled','organization_order_period_template',p_template_id);
  return jsonb_build_object('success',true,'template_id',p_template_id); end; $$;

create or replace function public.enable_order_period_template(p_template_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.archive') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  update public.organization_order_period_templates set is_active=true,updated_by=v_actor where id=p_template_id and organization_id=p_organization_id and archived_at is null; if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id) values(v_actor,p_organization_id,'order_shift_enabled','organization_order_period_template',p_template_id);
  return jsonb_build_object('success',true,'template_id',p_template_id); end; $$;

create or replace function public.archive_order_period_template(p_template_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare v_actor uuid:=auth.uid(); v_today date:=(now() at time zone 'Asia/Riyadh')::date; v_template public.organization_order_period_templates%rowtype; begin
  if v_actor is null or not public.has_order_period_permission(v_actor,p_organization_id,'order_periods.archive') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_UNAUTHORIZED'); end if;
  select * into v_template from public.organization_order_period_templates where id=p_template_id and organization_id=p_organization_id for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  if exists(select 1 from public.organization_order_period_assignments where order_period_template_id=p_template_id and is_active and (assignment_end_date is null or assignment_end_date>=v_today)) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_HAS_CURRENT_OR_FUTURE_ASSIGNMENTS'); end if;
  update public.organization_order_period_templates set is_active=false,is_published=false,published_at=null,published_by=null,archived_at=timezone('utc',now()),archived_by=v_actor,updated_by=v_actor where id=p_template_id and organization_id=p_organization_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data) values(v_actor,p_organization_id,'order_shift_archived','organization_order_period_template',p_template_id,jsonb_build_object('is_active',v_template.is_active,'is_published',v_template.is_published),jsonb_build_object('is_active',false,'is_published',false,'archived_at',timezone('utc',now())));
  return jsonb_build_object('success',true,'template_id',p_template_id); end; $$;

revoke all on function public.create_order_period_template(uuid,text,time,time,boolean,boolean,time,time) from public,anon;
revoke all on function public.update_order_period_template(uuid,uuid,text,time,time,boolean,boolean,time,time) from public,anon;
revoke all on function public.set_order_period_start_end_policy(uuid,uuid,integer,integer) from public,anon;
revoke all on function public.set_organization_order_shift_change_settings(uuid,smallint[]) from public,anon;
revoke all on function public.open_driver_order_period_now(uuid,uuid,uuid) from public,anon;
revoke all on function public.publish_order_period_template(uuid,uuid) from public,anon;
revoke all on function public.unpublish_order_period_template(uuid,uuid) from public,anon;
revoke all on function public.disable_order_period_template(uuid,uuid) from public,anon;
revoke all on function public.enable_order_period_template(uuid,uuid) from public,anon;
revoke all on function public.archive_order_period_template(uuid,uuid) from public,anon;
grant execute on function public.create_order_period_template(uuid,text,time,time,boolean,boolean,time,time) to authenticated,service_role;
grant execute on function public.update_order_period_template(uuid,uuid,text,time,time,boolean,boolean,time,time) to authenticated,service_role;
grant execute on function public.set_order_period_start_end_policy(uuid,uuid,integer,integer) to authenticated,service_role;
grant execute on function public.set_organization_order_shift_change_settings(uuid,smallint[]) to authenticated,service_role;
grant execute on function public.open_driver_order_period_now(uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.publish_order_period_template(uuid,uuid) to authenticated,service_role;
grant execute on function public.unpublish_order_period_template(uuid,uuid) to authenticated,service_role;
grant execute on function public.disable_order_period_template(uuid,uuid) to authenticated,service_role;
grant execute on function public.enable_order_period_template(uuid,uuid) to authenticated,service_role;
grant execute on function public.archive_order_period_template(uuid,uuid) to authenticated,service_role;

create or replace function public.replace_order_period_week_members(
  p_organization_id uuid, p_order_period_template_id uuid, p_week_start date, p_week_end date, p_driver_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid:=auth.uid(); v_today date:=(now() at time zone 'Asia/Riyadh')::date;
  v_current_start date:=v_today-extract(dow from v_today)::integer; v_current_end date:=v_current_start+6;
  v_selected uuid[]:=coalesce((select array_agg(distinct driver_id order by driver_id) from unnest(coalesce(p_driver_ids,'{}'::uuid[])) x(driver_id) where driver_id is not null),'{}'::uuid[]);
  v_relevant uuid[]; v_count integer; v_removed integer:=0; v_added integer:=0; v_assignment public.organization_order_period_assignments%rowtype; v_driver_id uuid; v_before boolean; v_after boolean;
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id,p_organization_id,'order_periods.assign') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_MEMBERSHIP_UNAUTHORIZED'); end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and is_active) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ORGANIZATION_INVALID'); end if;
  if p_week_start is null or p_week_end is null or not ((p_week_start=v_current_start and p_week_end=v_current_start+6) or (p_week_start=v_current_start+7 and p_week_end=v_current_start+13)) then return jsonb_build_object('success',false,'error','INVALID_WEEK_RANGE'); end if;
  perform 1 from public.organization_order_period_templates where id=p_order_period_template_id and organization_id=p_organization_id and is_active and archived_at is null for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  select coalesce(array_agg(distinct driver_id order by driver_id),'{}'::uuid[]) into v_relevant from public.organization_order_period_assignments where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start);
  v_relevant:=v_relevant||v_selected;
  select coalesce(array_agg(distinct driver_id order by driver_id),'{}'::uuid[]) into v_relevant from unnest(v_relevant) x(driver_id);
  perform 1 from public.drivers where organization_id=p_organization_id and id=any(v_relevant) order by id for update;
  select count(*) into v_count from public.drivers where organization_id=p_organization_id and id=any(v_selected) and status='active'::public.driver_status and deleted_at is null and settlement_type='per_order'::public.driver_settlement_type;
  if v_count<>cardinality(v_selected) then return jsonb_build_object('success',false,'error','DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD'); end if;
  perform 1 from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_relevant) and is_active order by driver_id,id for update;
  if exists(select 1 from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_selected) and order_period_template_id<>p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start)) then return jsonb_build_object('success',false,'error','DRIVER_ALREADY_ASSIGNED_THIS_WEEK'); end if;
  if exists(select driver_id from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_selected) and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) group by driver_id having count(*)>1) then return jsonb_build_object('success',false,'error','DRIVER_HAS_MULTIPLE_ASSIGNMENTS_THIS_WEEK'); end if;
  for v_assignment in select * from public.organization_order_period_assignments where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) order by driver_id,id for update loop
    if not(v_assignment.driver_id=any(v_selected)) then
      v_before:=v_assignment.assignment_start_date<p_week_start; v_after:=v_assignment.assignment_end_date is null or v_assignment.assignment_end_date>p_week_end;
      if v_before then update public.organization_order_period_assignments set assignment_end_date=p_week_start-1,updated_by=v_actor_id where id=v_assignment.id;
        if v_after then insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_order_period_template_id,v_assignment.driver_id,p_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id); end if;
      elsif v_after then update public.organization_order_period_assignments set assignment_start_date=p_week_end+1,updated_by=v_actor_id where id=v_assignment.id;
      else update public.organization_order_period_assignments set is_active=false,updated_by=v_actor_id where id=v_assignment.id; end if;
      v_removed:=v_removed+1;
    end if;
  end loop;
  for v_driver_id in select d.id from public.drivers d where d.organization_id=p_organization_id and d.id=any(v_selected) and not exists(select 1 from public.organization_order_period_assignments a where a.organization_id=p_organization_id and a.order_period_template_id=p_order_period_template_id and a.driver_id=d.id and a.is_active and a.assignment_start_date<=p_week_end and (a.assignment_end_date is null or a.assignment_end_date>=p_week_start)) loop
    insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_order_period_template_id,v_driver_id,p_week_start,p_week_end,v_actor_id,v_actor_id); v_added:=v_added+1;
  end loop;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,after_data,metadata) values(v_actor_id,p_organization_id,'order_period_week_membership_replaced','organization_order_period_template',p_order_period_template_id,jsonb_build_object('week_start',p_week_start,'week_end',p_week_end,'added_count',v_added,'removed_count',v_removed),jsonb_build_object('organization_id',p_organization_id));
  return jsonb_build_object('success',true,'added_count',v_added,'removed_count',v_removed);
end; $$;

create or replace function public.move_order_period_driver(
  p_organization_id uuid,p_source_order_period_id uuid,p_target_order_period_id uuid,p_driver_id uuid,p_week_start date,p_week_end date
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid:=auth.uid(); v_today date:=(now() at time zone 'Asia/Riyadh')::date; v_current_start date:=v_today-extract(dow from v_today)::integer; v_source public.organization_order_period_templates%rowtype; v_target public.organization_order_period_templates%rowtype; v_driver public.drivers%rowtype; v_assignment public.organization_order_period_assignments%rowtype; v_conflict uuid; v_before boolean; v_after boolean;
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id,p_organization_id,'order_periods.assign') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_MOVE_UNAUTHORIZED'); end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and is_active) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ORGANIZATION_INVALID'); end if;
  if p_source_order_period_id=p_target_order_period_id or p_week_start is null or p_week_end<>p_week_start+6 or not(p_week_start=v_current_start or p_week_start=v_current_start+7) then return jsonb_build_object('success',false,'error','INVALID_WEEK_RANGE'); end if;
  perform 1 from public.organization_order_period_templates where id=any(array[p_source_order_period_id,p_target_order_period_id]) and organization_id=p_organization_id and is_active and archived_at is null order by id for update;
  select * into v_source from public.organization_order_period_templates where id=p_source_order_period_id and organization_id=p_organization_id and is_active and archived_at is null;
  select * into v_target from public.organization_order_period_templates where id=p_target_order_period_id and organization_id=p_organization_id and is_active and archived_at is null;
  if not found or v_source.id is null or v_target.id is null then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  select * into v_driver from public.drivers where id=p_driver_id and organization_id=p_organization_id for update;
  if not found or v_driver.status<>'active'::public.driver_status or v_driver.deleted_at is not null or v_driver.settlement_type<>'per_order'::public.driver_settlement_type then return jsonb_build_object('success',false,'error','DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD'); end if;
  perform 1 from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=p_driver_id and is_active order by id for update;
  select * into v_assignment from public.organization_order_period_assignments where organization_id=p_organization_id and order_period_template_id=p_source_order_period_id and driver_id=p_driver_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) order by assignment_start_date desc,id desc limit 1;
  if not found then return jsonb_build_object('success',false,'error','SOURCE_ORDER_PERIOD_ASSIGNMENT_NOT_FOUND'); end if;
  select id into v_conflict from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=p_driver_id and order_period_template_id=p_target_order_period_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) limit 1;
  if v_conflict is not null then return jsonb_build_object('success',false,'error','DRIVER_ALREADY_ASSIGNED_THIS_WEEK'); end if;
  v_before:=v_assignment.assignment_start_date<p_week_start; v_after:=v_assignment.assignment_end_date is null or v_assignment.assignment_end_date>p_week_end;
  if v_before then update public.organization_order_period_assignments set assignment_end_date=p_week_start-1,updated_by=v_actor_id where id=v_assignment.id;
    insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_target_order_period_id,p_driver_id,p_week_start,p_week_end,v_actor_id,v_actor_id);
    if v_after then insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_source_order_period_id,p_driver_id,p_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id); end if;
  elsif v_after then update public.organization_order_period_assignments set order_period_template_id=p_target_order_period_id,assignment_start_date=p_week_start,assignment_end_date=p_week_end,updated_by=v_actor_id where id=v_assignment.id;
    insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_source_order_period_id,p_driver_id,p_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id);
  else update public.organization_order_period_assignments set order_period_template_id=p_target_order_period_id,assignment_start_date=p_week_start,assignment_end_date=p_week_end,updated_by=v_actor_id where id=v_assignment.id; end if;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data,metadata) values(v_actor_id,p_organization_id,'order_period_driver_moved','organization_order_period_assignment',v_assignment.id,jsonb_build_object('order_period_template_id',p_source_order_period_id),jsonb_build_object('order_period_template_id',p_target_order_period_id,'week_start',p_week_start,'week_end',p_week_end),jsonb_build_object('driver_id',p_driver_id));
  return jsonb_build_object('success',true,'driver_id',p_driver_id,'source_order_period_id',p_source_order_period_id,'target_order_period_id',p_target_order_period_id);
end; $$;

create or replace function public.reject_order_shift_change_request(p_request_id uuid,p_review_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid:=auth.uid(); v_request public.driver_order_shift_change_requests%rowtype;
begin
  if v_actor_id is null then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REJECTION_AUTH_REQUIRED'); end if;
  if p_review_note is not null and length(p_review_note)>2000 then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REVIEW_NOTE_TOO_LONG'); end if;
  select * into v_request from public.driver_order_shift_change_requests where id=p_request_id and status='pending' for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REQUEST_NOT_PENDING'); end if;
  if not public.has_order_period_permission(v_actor_id,v_request.organization_id,'order_periods.requests.review') then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REJECTION_UNAUTHORIZED'); end if;
  update public.driver_order_shift_change_requests set status='rejected',reviewed_by=v_actor_id,reviewed_at=timezone('utc',now()),review_note=nullif(btrim(p_review_note),''),updated_at=timezone('utc',now()) where id=p_request_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data,metadata) values(v_actor_id,v_request.organization_id,'order_shift_change_request_rejected','driver_order_shift_change_request',p_request_id,jsonb_build_object('status','pending'),jsonb_build_object('status','rejected','review_note',nullif(btrim(p_review_note),'')),jsonb_build_object('driver_id',v_request.driver_id));
  return jsonb_build_object('success',true,'request_id',p_request_id);
end; $$;

revoke all on function public.replace_order_period_week_members(uuid,uuid,date,date,uuid[]) from public,anon;
revoke all on function public.move_order_period_driver(uuid,uuid,uuid,uuid,date,date) from public,anon;
revoke all on function public.reject_order_shift_change_request(uuid,text) from public,anon;
grant execute on function public.replace_order_period_week_members(uuid,uuid,date,date,uuid[]) to authenticated,service_role;
grant execute on function public.move_order_period_driver(uuid,uuid,uuid,uuid,date,date) to authenticated,service_role;
grant execute on function public.reject_order_shift_change_request(uuid,text) to authenticated,service_role;

create or replace function public.approve_order_shift_change_request(p_request_id uuid,p_review_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid:=auth.uid(); v_request public.driver_order_shift_change_requests%rowtype; v_driver public.drivers%rowtype; v_requested_template public.organization_order_period_templates%rowtype; v_current_template public.organization_order_period_templates%rowtype; v_assignment public.organization_order_period_assignments%rowtype; v_anchor public.organization_order_period_assignments%rowtype; v_target_count integer; v_anchor_count integer; v_week_end date; v_previous_end date; v_before boolean; v_after boolean;
begin
  if v_actor_id is null then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_APPROVAL_AUTH_REQUIRED'); end if;
  if p_review_note is not null and length(p_review_note)>2000 then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REVIEW_NOTE_TOO_LONG'); end if;
  select * into v_request from public.driver_order_shift_change_requests where id=p_request_id and status='pending' for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_REQUEST_NOT_PENDING'); end if;
  if not public.has_order_period_permission(v_actor_id,v_request.organization_id,'order_periods.requests.review') then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_APPROVAL_UNAUTHORIZED'); end if;
  if v_request.requested_week_start_date<>public.get_order_shift_change_target_week_start(v_request.created_at) then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_INVALID_TARGET_WEEK'); end if;
  perform 1 from public.organization_order_period_templates where id=any(array[v_request.current_order_period_template_id,v_request.requested_order_period_template_id]) and organization_id=v_request.organization_id order by id for update;
  select * into v_current_template from public.organization_order_period_templates where id=v_request.current_order_period_template_id and organization_id=v_request.organization_id;
  select * into v_requested_template from public.organization_order_period_templates where id=v_request.requested_order_period_template_id and organization_id=v_request.organization_id;
  if not found or not v_requested_template.is_active or v_requested_template.archived_at is not null then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_TEMPLATE_INVALID'); end if;
  select * into v_driver from public.drivers where id=v_request.driver_id and organization_id=v_request.organization_id for update;
  if not found or v_driver.status<>'active'::public.driver_status or v_driver.deleted_at is not null or v_driver.settlement_type<>'per_order'::public.driver_settlement_type then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_DRIVER_NOT_ELIGIBLE'); end if;
  perform 1 from public.organization_order_period_assignments where organization_id=v_request.organization_id and driver_id=v_request.driver_id and is_active order by id for update;
  v_week_end:=v_request.requested_week_start_date+6; v_previous_end:=v_request.requested_week_start_date-1;
  select count(*) into v_target_count from public.organization_order_period_assignments where organization_id=v_request.organization_id and driver_id=v_request.driver_id and is_active and assignment_start_date<=v_week_end and (assignment_end_date is null or assignment_end_date>=v_request.requested_week_start_date);
  if v_target_count>1 then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_ASSIGNMENT_OVERLAP'); end if;
  if v_target_count=1 then
    select * into v_assignment from public.organization_order_period_assignments where organization_id=v_request.organization_id and driver_id=v_request.driver_id and is_active and assignment_start_date<=v_week_end and (assignment_end_date is null or assignment_end_date>=v_request.requested_week_start_date) limit 1;
    if v_assignment.order_period_template_id<>v_request.current_order_period_template_id then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED'); end if;
    v_before:=v_assignment.assignment_start_date<v_request.requested_week_start_date; v_after:=v_assignment.assignment_end_date is null or v_assignment.assignment_end_date>v_week_end;
    if v_before then update public.organization_order_period_assignments set assignment_end_date=v_request.requested_week_start_date-1,updated_by=v_actor_id where id=v_assignment.id;
      insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(v_request.organization_id,v_request.requested_order_period_template_id,v_request.driver_id,v_request.requested_week_start_date,v_week_end,v_actor_id,v_actor_id);
      if v_after then insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(v_request.organization_id,v_request.current_order_period_template_id,v_request.driver_id,v_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id); end if;
    elsif v_after then update public.organization_order_period_assignments set order_period_template_id=v_request.requested_order_period_template_id,assignment_start_date=v_request.requested_week_start_date,assignment_end_date=v_week_end,updated_by=v_actor_id where id=v_assignment.id;
      insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(v_request.organization_id,v_request.current_order_period_template_id,v_request.driver_id,v_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id);
    else update public.organization_order_period_assignments set order_period_template_id=v_request.requested_order_period_template_id,assignment_start_date=v_request.requested_week_start_date,assignment_end_date=v_week_end,updated_by=v_actor_id where id=v_assignment.id; end if;
  else
    select count(*) into v_anchor_count from public.organization_order_period_assignments where organization_id=v_request.organization_id and driver_id=v_request.driver_id and is_active and assignment_start_date<=v_previous_end and (assignment_end_date is null or assignment_end_date>=v_previous_end);
    if v_anchor_count<>1 then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT'); end if;
    select * into v_anchor from public.organization_order_period_assignments where organization_id=v_request.organization_id and driver_id=v_request.driver_id and is_active and assignment_start_date<=v_previous_end and (assignment_end_date is null or assignment_end_date>=v_previous_end) limit 1;
    if v_anchor.order_period_template_id<>v_request.current_order_period_template_id then return jsonb_build_object('success',false,'error','ORDER_SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED'); end if;
    v_after:=v_anchor.assignment_end_date is null or v_anchor.assignment_end_date>v_week_end;
    update public.organization_order_period_assignments set assignment_end_date=v_previous_end,updated_by=v_actor_id where id=v_anchor.id;
    insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(v_request.organization_id,v_request.requested_order_period_template_id,v_request.driver_id,v_request.requested_week_start_date,v_week_end,v_actor_id,v_actor_id);
    if v_after then insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(v_request.organization_id,v_request.current_order_period_template_id,v_request.driver_id,v_week_end+1,v_anchor.assignment_end_date,v_actor_id,v_actor_id); end if;
  end if;
  update public.driver_order_shift_change_requests set status='approved',reviewed_by=v_actor_id,reviewed_at=timezone('utc',now()),review_note=nullif(btrim(p_review_note),''),updated_at=timezone('utc',now()) where id=p_request_id;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,before_data,after_data,metadata) values(v_actor_id,v_request.organization_id,'order_shift_change_request_approved','driver_order_shift_change_request',p_request_id,jsonb_build_object('status','pending'),jsonb_build_object('status','approved','requested_week_start_date',v_request.requested_week_start_date,'requested_order_period_template_id',v_request.requested_order_period_template_id),jsonb_build_object('driver_id',v_request.driver_id,'review_note',nullif(btrim(p_review_note),'')));
  return jsonb_build_object('success',true,'request_id',p_request_id);
end; $$;

revoke all on function public.approve_order_shift_change_request(uuid,text) from public,anon;
grant execute on function public.approve_order_shift_change_request(uuid,text) to authenticated,service_role;

create or replace function public.replace_managed_user_organization_permissions(
  p_actor_user_id uuid, p_target_user_id uuid, p_access jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target_role public.app_role; v_home uuid; v_item jsonb; v_org uuid; v_keys text[]; v_key text;
  v_old text[]; v_new text[]; v_level public.organization_access_level; v_seen uuid[]:=array[]::uuid[];
  v_view constant text[]:=array[
    'organization.dashboard.view','drivers.view','driver_reports.view','driver_order_reports.view',
    'fleet.cars.view','fleet.motorcycles.view','fuel.reports.view','app_requests.view','odometer.manage',
    'notifications.view','driver_warnings.view','entitlements.view','entitlements.view_transactions',
    'shifts.view','maintenance_providers.view','maintenance_jobs.view','maintenance_materials.view','order_periods.view'
  ];
begin
  if not public.is_system_owner_user(p_actor_user_id) then raise exception 'Managed user permissions update failed: unauthorized.'; end if;
  if p_actor_user_id=p_target_user_id then raise exception 'Managed user permissions update failed: self operation is not allowed.'; end if;
  select p.role,p.home_organization_id into v_target_role,v_home from public.profiles p where p.id=p_target_user_id and p.deleted_at is null;
  if v_target_role is null then raise exception 'Managed user permissions update failed: target is unavailable.'; end if;
  if v_target_role='system_owner'::public.app_role then raise exception 'Managed user permissions update failed: target is protected.'; end if;
  if jsonb_typeof(p_access)<>'array' then raise exception 'Managed user permissions update failed: access must be an array.'; end if;
  if v_target_role='driver'::public.app_role and jsonb_array_length(p_access)>0 then raise exception 'Managed user permissions update failed: drivers cannot receive additional access.'; end if;
  for v_item in select * from jsonb_array_elements(p_access) loop
    if not(v_item?'organization_id') or not(v_item?'permission_keys') then raise exception 'Managed user permissions update failed: malformed access entry.'; end if;
    v_org:=(v_item->>'organization_id')::uuid;
    if v_org=any(v_seen) then raise exception 'Managed user permissions update failed: duplicate organization.'; end if;
    v_seen:=array_append(v_seen,v_org);
    if v_org=v_home then raise exception 'Managed user permissions update failed: home organization cannot be additional access.'; end if;
    if not exists(select 1 from public.organizations o where o.id=v_org and o.is_active) then raise exception 'Managed user permissions update failed: organization inactive or missing.'; end if;
    select coalesce(array_agg(distinct value order by value),array[]::text[]) into v_keys from jsonb_array_elements_text(v_item->'permission_keys') as keys(value);
    foreach v_key in array v_keys loop if not v_key=any(public.organization_permission_keys()) then raise exception 'Managed user permissions update failed: invalid permission key.'; end if; end loop;
  end loop;
  for v_org in select oa.organization_id from public.organization_access oa where oa.user_id=p_target_user_id and (jsonb_array_length(p_access)=0 or not exists(select 1 from jsonb_array_elements(p_access) item where (item->>'organization_id')::uuid=oa.organization_id)) loop
    select coalesce(array_agg(permission_key order by permission_key),array[]::text[]) into v_old from public.organization_user_permissions where user_id=p_target_user_id and organization_id=v_org;
    delete from public.organization_user_permissions where user_id=p_target_user_id and organization_id=v_org;
    delete from public.organization_access where user_id=p_target_user_id and organization_id=v_org;
    insert into public.activity_logs(action,actor_user_id,target_user_id,organization_id,entity_type,entity_id,before_data,after_data,metadata)
    values('user_permissions_updated',p_actor_user_id,p_target_user_id,v_org,'profile',p_target_user_id,
      jsonb_build_object('access_enabled',true,'permission_keys',v_old),
      jsonb_build_object('access_enabled',false,'permission_keys',array[]::text[]),jsonb_build_object('changed_permissions',true));
  end loop;
  for v_item in select * from jsonb_array_elements(p_access) loop
    v_org:=(v_item->>'organization_id')::uuid;
    select coalesce(array_agg(permission_key order by permission_key),array[]::text[]) into v_old from public.organization_user_permissions where user_id=p_target_user_id and organization_id=v_org;
    select coalesce(array_agg(distinct value order by value),array[]::text[]) into v_new from jsonb_array_elements_text(v_item->'permission_keys') as keys(value);
    v_level:=case when v_new<@v_view then 'view'::public.organization_access_level else 'manage'::public.organization_access_level end;
    insert into public.organization_access(user_id,organization_id,access_level) values(p_target_user_id,v_org,v_level) on conflict(user_id,organization_id) do update set access_level=excluded.access_level,updated_at=timezone('utc',now());
    delete from public.organization_user_permissions where user_id=p_target_user_id and organization_id=v_org;
    foreach v_key in array v_new loop insert into public.organization_user_permissions(user_id,organization_id,permission_key,granted_by,updated_by) values(p_target_user_id,v_org,v_key,p_actor_user_id,p_actor_user_id); end loop;
    insert into public.activity_logs(action,actor_user_id,target_user_id,organization_id,entity_type,entity_id,before_data,after_data,metadata) values('user_permissions_updated',p_actor_user_id,p_target_user_id,v_org,'profile',p_target_user_id,jsonb_build_object('access_enabled',cardinality(v_old)>0,'permission_keys',v_old),jsonb_build_object('access_enabled',true,'permission_keys',v_new),jsonb_build_object('changed_permissions',true));
  end loop;
end;
$$;

revoke all on function public.replace_managed_user_organization_permissions(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_managed_user_organization_permissions(uuid,uuid,jsonb) to service_role;

commit;
notify pgrst, 'reload schema';
