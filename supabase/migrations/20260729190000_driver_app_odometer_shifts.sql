-- Driver App odometer shifts and private camera capture storage.
-- The canonical Driver App profile role in this schema is public.app_role 'driver'.

create table if not exists public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid null references public.fleet_vehicles(id) on delete set null,
  vehicle_plate_snapshot text not null,
  status text not null default 'open',
  started_at timestamptz not null default timezone('utc', now()),
  start_odometer_reading bigint not null,
  start_photo_path text not null,
  start_photo_captured_at timestamptz not null,
  ended_at timestamptz null,
  end_odometer_reading bigint null,
  end_photo_path text null,
  end_photo_captured_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_shifts_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint driver_shifts_vehicle_plate_snapshot_not_blank check (length(btrim(vehicle_plate_snapshot)) > 0),
  constraint driver_shifts_start_photo_path_not_blank check (length(btrim(start_photo_path)) > 0),
  constraint driver_shifts_start_odometer_non_negative check (start_odometer_reading >= 0),
  constraint driver_shifts_end_odometer_non_negative check (end_odometer_reading is null or end_odometer_reading >= 0),
  constraint driver_shifts_end_not_lower_than_start check (
    end_odometer_reading is null or end_odometer_reading >= start_odometer_reading
  ),
  constraint driver_shifts_open_shape_check check (
    status <> 'open'
    or (
      ended_at is null
      and end_odometer_reading is null
      and end_photo_path is null
      and end_photo_captured_at is null
    )
  ),
  constraint driver_shifts_completed_shape_check check (
    status <> 'completed'
    or (
      ended_at is not null
      and end_odometer_reading is not null
      and end_photo_path is not null
      and length(btrim(end_photo_path)) > 0
      and end_photo_captured_at is not null
    )
  )
);

create index if not exists driver_shifts_driver_started_at_idx
  on public.driver_shifts (driver_id, started_at desc);

create index if not exists driver_shifts_organization_started_at_idx
  on public.driver_shifts (organization_id, started_at desc);

create unique index if not exists driver_shifts_one_open_per_driver_idx
  on public.driver_shifts (driver_id)
  where status = 'open';

create or replace function public.set_driver_shifts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_driver_shifts_updated_at on public.driver_shifts;
create trigger set_driver_shifts_updated_at
  before update on public.driver_shifts
  for each row
  execute function public.set_driver_shifts_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'driver-odometer',
  'driver-odometer',
  false,
  5242880,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg']::text[];

alter table public.driver_shifts enable row level security;

revoke all on public.driver_shifts from anon;
grant select on public.driver_shifts to authenticated;
grant select, insert, update, delete on public.driver_shifts to service_role;

drop policy if exists driver_shifts_select_own_linked_driver on public.driver_shifts;
create policy driver_shifts_select_own_linked_driver
  on public.driver_shifts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      join public.drivers d
        on d.auth_user_id = p.id
       and d.id = driver_shifts.driver_id
      where p.id = auth.uid()
        and p.role = 'driver'::public.app_role
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and p.must_change_password = false
        and d.status = 'active'::public.driver_status
        and d.deleted_at is null
    )
  );

drop policy if exists driver_odometer_objects_select_own on storage.objects;
create policy driver_odometer_objects_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-odometer'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists driver_odometer_objects_insert_own on storage.objects;
create policy driver_odometer_objects_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'driver-odometer'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists driver_odometer_objects_delete_own on storage.objects;
create policy driver_odometer_objects_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'driver-odometer'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.validate_driver_odometer_photo_path(
  p_photo_path text,
  p_user_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_photo_path is not null
    and p_user_id is not null
    and p_photo_path = btrim(p_photo_path)
    and p_photo_path like p_user_id::text || '/%/%.jpg'
    and length(p_photo_path) between 48 and 500;
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
  v_plate text;
  v_shift public.driver_shifts%rowtype;
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING';
  end if;

  if p_photo_captured_at is null then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO';
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
    raise exception 'SHIFT_PROFILE_UNAVAILABLE';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE';
  end if;

  select fv.*
    into v_vehicle
  from public.fleet_vehicles fv
  where fv.organization_id = v_driver.organization_id
    and fv.archived_at is null
    and (
      fv.assigned_driver_id = v_driver.id
      or fv.authorized_driver_id = v_driver.id
    )
  order by
    case when fv.assigned_driver_id = v_driver.id then 0 else 1 end,
    fv.created_at desc
  limit 1;

  v_plate := coalesce(
    nullif(v_vehicle.plate_number, ''),
    nullif(v_driver.keeta_vehicle_plate_number, ''),
    nullif(v_driver.vehicle_number, '')
  );

  if v_plate is null then
    raise exception 'SHIFT_VEHICLE_UNAVAILABLE';
  end if;

  insert into public.driver_shifts (
    driver_id,
    organization_id,
    vehicle_id,
    vehicle_plate_snapshot,
    status,
    started_at,
    start_odometer_reading,
    start_photo_path,
    start_photo_captured_at
  )
  values (
    v_driver.id,
    v_driver.organization_id,
    v_vehicle.id,
    v_plate,
    'open',
    timezone('utc', now()),
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
    'vehicle_plate', v_shift.vehicle_plate_snapshot
  );
exception
  when unique_violation then
    raise exception 'SHIFT_OPEN_EXISTS';
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
begin
  if v_user_id is null then
    raise exception 'SHIFT_AUTH_REQUIRED';
  end if;

  if p_odometer_reading is null or p_odometer_reading < 0 or p_odometer_reading > 2147483647 then
    raise exception 'SHIFT_INVALID_READING';
  end if;

  if p_photo_captured_at is null then
    raise exception 'SHIFT_INVALID_PHOTO';
  end if;

  if not public.validate_driver_odometer_photo_path(p_photo_path, v_user_id) then
    raise exception 'SHIFT_INVALID_PHOTO';
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
    raise exception 'SHIFT_PROFILE_UNAVAILABLE';
  end if;

  select d.*
    into v_driver
  from public.drivers d
  where d.auth_user_id = v_user_id
    and d.status = 'active'::public.driver_status
    and d.deleted_at is null;

  if not found then
    raise exception 'SHIFT_DRIVER_UNAVAILABLE';
  end if;

  select ds.*
    into v_shift
  from public.driver_shifts ds
  where ds.driver_id = v_driver.id
    and ds.status = 'open';

  if not found then
    raise exception 'SHIFT_NO_OPEN_SHIFT';
  end if;

  if p_odometer_reading < v_shift.start_odometer_reading then
    raise exception 'SHIFT_END_BELOW_START';
  end if;

  update public.driver_shifts
  set
    status = 'completed',
    ended_at = timezone('utc', now()),
    end_odometer_reading = p_odometer_reading,
    end_photo_path = p_photo_path,
    end_photo_captured_at = p_photo_captured_at
  where id = v_shift.id
    and status = 'open'
  returning * into v_shift;

  return jsonb_build_object(
    'id', v_shift.id,
    'status', v_shift.status,
    'started_at', v_shift.started_at,
    'ended_at', v_shift.ended_at,
    'start_odometer_reading', v_shift.start_odometer_reading,
    'end_odometer_reading', v_shift.end_odometer_reading,
    'distance', v_shift.end_odometer_reading - v_shift.start_odometer_reading,
    'vehicle_plate', v_shift.vehicle_plate_snapshot
  );
end;
$$;

revoke all on function public.validate_driver_odometer_photo_path(text, uuid)
  from public, anon, authenticated;
revoke all on function public.start_driver_shift(bigint, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.end_driver_shift(bigint, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.start_driver_shift(bigint, text, timestamptz)
  to authenticated;
grant execute on function public.end_driver_shift(bigint, text, timestamptz)
  to authenticated;
