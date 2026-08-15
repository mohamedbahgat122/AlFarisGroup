-- Global Housing rooms and room-aware driver assignment.

create table if not exists public.housing_rooms (
  id uuid primary key default gen_random_uuid(),
  housing_id uuid not null references public.housing_units(id) on delete cascade,
  name text not null,
  code text null,
  capacity integer not null,
  status text not null default 'active',
  notes text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  archived_by uuid null references public.profiles(id) on delete set null,
  constraint housing_rooms_name_not_blank check (length(btrim(name)) > 0),
  constraint housing_rooms_code_not_blank check (code is null or length(btrim(code)) > 0),
  constraint housing_rooms_capacity_positive check (capacity > 0),
  constraint housing_rooms_status_check check (status in ('active', 'full', 'maintenance', 'inactive'))
);

alter table public.housing_driver_assignments
  add column if not exists room_id uuid null references public.housing_rooms(id) on delete set null;

create index if not exists housing_rooms_housing_active_idx
  on public.housing_rooms (housing_id, status, archived_at);

create unique index if not exists housing_rooms_active_name_unique
  on public.housing_rooms (housing_id, lower(name))
  where archived_at is null;

create unique index if not exists housing_rooms_active_code_unique
  on public.housing_rooms (housing_id, lower(code))
  where code is not null and archived_at is null;

create index if not exists housing_driver_assignments_room_active_idx
  on public.housing_driver_assignments (room_id, unassigned_at);

alter table public.housing_rooms enable row level security;

revoke all on public.housing_rooms from public, anon;
grant select, insert, update on public.housing_rooms to authenticated;
grant select, insert, update, delete on public.housing_rooms to service_role;

drop policy if exists housing_rooms_select_global_view on public.housing_rooms;
create policy housing_rooms_select_global_view
  on public.housing_rooms
  for select
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.view'));

drop policy if exists housing_rooms_insert_global_update on public.housing_rooms;
create policy housing_rooms_insert_global_update
  on public.housing_rooms
  for insert
  to authenticated
  with check (public.actor_has_global_permission(auth.uid(), 'housing.update'));

drop policy if exists housing_rooms_update_global_update on public.housing_rooms;
create policy housing_rooms_update_global_update
  on public.housing_rooms
  for update
  to authenticated
  using (public.actor_has_global_permission(auth.uid(), 'housing.update'))
  with check (public.actor_has_global_permission(auth.uid(), 'housing.update'));

create or replace function public.assign_driver_to_housing_room(
  p_actor_user_id uuid,
  p_housing_id uuid,
  p_room_id uuid,
  p_driver_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_housing public.housing_units%rowtype;
  v_room public.housing_rooms%rowtype;
  v_driver public.drivers%rowtype;
  v_old_assignment public.housing_driver_assignments%rowtype;
  v_new_assignment_id uuid;
  v_occupied integer;
  v_action text := 'housing_driver_assigned';
  v_had_old_assignment boolean := false;
begin
  if not public.actor_has_global_permission(p_actor_user_id, 'housing.assign_drivers') then
    raise exception 'HOUSING_PERMISSION_DENIED';
  end if;

  select * into v_housing
  from public.housing_units
  where id = p_housing_id
  for update;

  if not found or v_housing.archived_at is not null then
    raise exception 'HOUSING_UNAVAILABLE';
  end if;

  if v_housing.status in ('inactive', 'maintenance', 'full') then
    raise exception 'HOUSING_NOT_ASSIGNABLE';
  end if;

  select * into v_room
  from public.housing_rooms
  where id = p_room_id
    and housing_id = p_housing_id
  for update;

  if not found or v_room.archived_at is not null then
    raise exception 'HOUSING_ROOM_UNAVAILABLE';
  end if;

  if v_room.status in ('inactive', 'maintenance', 'full') then
    raise exception 'HOUSING_ROOM_NOT_ASSIGNABLE';
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and status = 'active'::public.driver_status
    and deleted_at is null;

  if not found then
    raise exception 'HOUSING_DRIVER_UNAVAILABLE';
  end if;

  select * into v_old_assignment
  from public.housing_driver_assignments
  where driver_id = p_driver_id
    and unassigned_at is null
  for update;
  v_had_old_assignment := found;

  if v_had_old_assignment and v_old_assignment.housing_id = p_housing_id and v_old_assignment.room_id = p_room_id then
    return jsonb_build_object('assignment_id', v_old_assignment.id, 'moved', false, 'unchanged', true);
  end if;

  select count(*)::integer into v_occupied
  from public.housing_driver_assignments
  where room_id = p_room_id
    and unassigned_at is null;

  if v_occupied >= v_room.capacity then
    raise exception 'HOUSING_ROOM_FULL';
  end if;

  if v_had_old_assignment then
    update public.housing_driver_assignments
    set unassigned_at = timezone('utc', now()),
        updated_by = p_actor_user_id
    where id = v_old_assignment.id;
    v_action := 'housing_driver_moved';
  end if;

  insert into public.housing_driver_assignments (
    housing_id,
    room_id,
    driver_id,
    notes,
    created_by,
    updated_by
  )
  values (
    p_housing_id,
    p_room_id,
    p_driver_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into v_new_assignment_id;

  perform public.insert_housing_activity(
    p_actor_user_id,
    p_housing_id,
    v_action,
    p_driver_id,
    case
      when v_had_old_assignment then jsonb_build_object(
        'housing_id', v_old_assignment.housing_id,
        'room_id', v_old_assignment.room_id,
        'assignment_id', v_old_assignment.id
      )
      else null
    end,
    jsonb_build_object(
      'housing_id', p_housing_id,
      'room_id', p_room_id,
      'driver_id', p_driver_id,
      'assignment_id', v_new_assignment_id
    ),
    jsonb_build_object('driver_id', p_driver_id, 'room_id', p_room_id)
  );

  return jsonb_build_object('assignment_id', v_new_assignment_id, 'moved', v_had_old_assignment, 'unchanged', false);
end;
$$;

revoke all on function public.assign_driver_to_housing_room(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.assign_driver_to_housing_room(uuid, uuid, uuid, uuid, text) to authenticated, service_role;

comment on table public.housing_rooms is
  'Rooms inside global housing units. When a housing unit has active rooms, summed room capacity is the displayed capacity source.';
comment on column public.housing_driver_assignments.room_id is
  'Optional room assignment for room-aware housing. Existing historical rows may remain null.';
