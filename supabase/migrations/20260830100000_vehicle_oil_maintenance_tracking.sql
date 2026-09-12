create table if not exists public.fleet_vehicle_oil_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  driver_id uuid null references public.drivers(id) on delete set null,
  request_id uuid null references public.driver_app_requests(id) on delete set null,
  odometer_reading bigint not null,
  interval_km integer not null,
  completed_at timestamptz not null,
  note text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fleet_vehicle_oil_change_events_odometer_check check (
    odometer_reading >= 0 and odometer_reading <= 2147483647
  ),
  constraint fleet_vehicle_oil_change_events_interval_check check (
    interval_km > 0 and interval_km <= 2147483647
  )
);

create index if not exists fleet_vehicle_oil_change_events_vehicle_completed_idx
  on public.fleet_vehicle_oil_change_events (vehicle_id, completed_at desc);

create index if not exists fleet_vehicle_oil_change_events_organization_idx
  on public.fleet_vehicle_oil_change_events (organization_id);

create unique index if not exists fleet_vehicle_oil_change_events_request_key
  on public.fleet_vehicle_oil_change_events (request_id)
  where request_id is not null;

alter table public.fleet_vehicle_oil_change_events enable row level security;

grant select on public.fleet_vehicle_oil_change_events to authenticated;
grant select, insert on public.fleet_vehicle_oil_change_events to service_role;
revoke all on public.fleet_vehicle_oil_change_events from anon;

drop policy if exists fleet_vehicle_oil_change_events_select_viewable_organization
  on public.fleet_vehicle_oil_change_events;
create policy fleet_vehicle_oil_change_events_select_viewable_organization
  on public.fleet_vehicle_oil_change_events
  for select
  to authenticated
  using (
    public.can_manage_organization(organization_id)
    or public.has_organization_permission(auth.uid(), organization_id, 'app_requests.view')
    or public.has_organization_permission(auth.uid(), organization_id, 'app_requests.review')
    or exists (
      select 1
      from public.drivers d
      where d.id = fleet_vehicle_oil_change_events.driver_id
        and d.auth_user_id = auth.uid()
        and d.organization_id = fleet_vehicle_oil_change_events.organization_id
        and d.deleted_at is null
    )
  );

create or replace function public.complete_driver_oil_change_request(
  p_request_id uuid,
  p_interval_km integer,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.driver_app_requests%rowtype;
  v_detail public.driver_app_oil_change_request_details%rowtype;
  v_existing_event public.fleet_vehicle_oil_change_events%rowtype;
  v_completed_at timestamptz := timezone('utc', now());
  v_review_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'APP_REQUEST_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_interval_km is null or p_interval_km <= 0 or p_interval_km > 2147483647 then
    raise exception 'APP_REQUEST_INVALID_OIL_INTERVAL' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.driver_app_requests
  where id = p_request_id
    and request_type = 'oil_change'
  for update;

  if not found then
    raise exception 'APP_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.can_manage_organization(v_request.organization_id)
    or public.has_organization_permission(v_actor_id, v_request.organization_id, 'app_requests.review')
  ) then
    raise exception 'APP_REQUEST_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_detail
  from public.driver_app_oil_change_request_details
  where request_id = v_request.id
  for update;

  if not found then
    raise exception 'APP_REQUEST_OIL_DETAIL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_request.vehicle_id is null then
    raise exception 'APP_REQUEST_VEHICLE_REQUIRED' using errcode = '23502';
  end if;

  if v_request.status = 'completed' then
    select *
      into v_existing_event
    from public.fleet_vehicle_oil_change_events
    where request_id = v_request.id;

    if found then
      return jsonb_build_object(
        'id', v_request.id,
        'request_type', v_request.request_type,
        'status', v_request.status,
        'oil_event_id', v_existing_event.id
      );
    end if;

    raise exception 'APP_REQUEST_COMPLETED_WITHOUT_OIL_EVENT' using errcode = '23514';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'APP_REQUEST_INVALID_STATUS' using errcode = '22023';
  end if;

  update public.driver_app_requests
  set
    status = 'completed',
    completed_by = v_actor_id,
    completed_at = v_completed_at,
    updated_at = v_completed_at,
    review_note = coalesce(v_review_note, review_note)
  where id = v_request.id
    and status = 'approved'
  returning * into v_request;

  if not found then
    raise exception 'APP_REQUEST_CONCURRENT_UPDATE' using errcode = '40001';
  end if;

  insert into public.fleet_vehicle_oil_change_events (
    organization_id,
    vehicle_id,
    driver_id,
    request_id,
    odometer_reading,
    interval_km,
    completed_at,
    note,
    created_by
  )
  values (
    v_request.organization_id,
    v_request.vehicle_id,
    v_request.driver_id,
    v_request.id,
    v_detail.current_odometer_reading,
    p_interval_km,
    v_completed_at,
    coalesce(v_review_note, v_detail.note),
    v_actor_id
  )
  on conflict (request_id) where request_id is not null do nothing
  returning * into v_existing_event;

  if not found then
    select *
      into v_existing_event
    from public.fleet_vehicle_oil_change_events
    where request_id = v_request.id;
  end if;

  perform public.insert_driver_app_request_activity(
    v_actor_id,
    v_request.organization_id,
    v_request.driver_id,
    v_request.id,
    'driver_app_request_completed',
    'oil_change',
    'completed'
  );

  return jsonb_build_object(
    'id', v_request.id,
    'request_type', v_request.request_type,
    'status', v_request.status,
    'oil_event_id', v_existing_event.id
  );
end;
$$;

revoke all on function public.complete_driver_oil_change_request(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.complete_driver_oil_change_request(uuid, integer, text)
  to authenticated;

notify pgrst, 'reload schema';
