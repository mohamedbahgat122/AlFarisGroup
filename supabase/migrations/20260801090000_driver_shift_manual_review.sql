-- Manual administrative review for driver odometer shift submissions.

alter table public.driver_shifts
  add column if not exists start_review_status text not null default 'pending_review',
  add column if not exists start_reviewed_by uuid null references public.profiles(id) on delete restrict,
  add column if not exists start_reviewed_at timestamptz null,
  add column if not exists start_review_note text null,
  add column if not exists end_review_status text null,
  add column if not exists end_reviewed_by uuid null references public.profiles(id) on delete restrict,
  add column if not exists end_reviewed_at timestamptz null,
  add column if not exists end_review_note text null;

alter table public.driver_shifts
  drop constraint if exists driver_shifts_start_review_status_check,
  add constraint driver_shifts_start_review_status_check
    check (start_review_status in ('pending_review', 'approved', 'rejected'));

alter table public.driver_shifts
  drop constraint if exists driver_shifts_end_review_status_check,
  add constraint driver_shifts_end_review_status_check
    check (end_review_status is null or end_review_status in ('pending_review', 'approved', 'rejected'));

alter table public.driver_shifts
  drop constraint if exists driver_shifts_start_review_completion_check,
  add constraint driver_shifts_start_review_completion_check
    check (
      (start_review_status = 'pending_review' and start_reviewed_by is null and start_reviewed_at is null)
      or (start_review_status = 'approved' and start_reviewed_by is not null and start_reviewed_at is not null)
      or (start_review_status = 'rejected' and start_reviewed_by is not null and start_reviewed_at is not null and nullif(btrim(coalesce(start_review_note, '')), '') is not null)
    );

alter table public.driver_shifts
  drop constraint if exists driver_shifts_end_review_completion_check,
  add constraint driver_shifts_end_review_completion_check
    check (
      end_review_status is null
      or (end_review_status = 'pending_review' and end_reviewed_by is null and end_reviewed_at is null)
      or (end_review_status = 'approved' and end_reviewed_by is not null and end_reviewed_at is not null)
      or (end_review_status = 'rejected' and end_reviewed_by is not null and end_reviewed_at is not null and nullif(btrim(coalesce(end_review_note, '')), '') is not null)
    );

alter table public.driver_shifts
  drop constraint if exists driver_shifts_end_review_requires_end_reading_check,
  add constraint driver_shifts_end_review_requires_end_reading_check
    check (
      (end_odometer_reading is null and end_photo_path is null and end_review_status is null)
      or (end_odometer_reading is not null and end_photo_path is not null and end_review_status is not null)
    );

create index if not exists driver_shifts_start_review_pending_idx
  on public.driver_shifts (organization_id, started_at desc)
  where start_review_status = 'pending_review';

create index if not exists driver_shifts_end_review_pending_idx
  on public.driver_shifts (organization_id, ended_at desc)
  where end_review_status = 'pending_review';

drop policy if exists driver_shifts_select_org_odometer_manage on public.driver_shifts;
create policy driver_shifts_select_org_odometer_manage
  on public.driver_shifts
  for select
  to authenticated
  using (
    public.is_system_owner()
    or public.has_organization_permission(auth.uid(), organization_id, 'odometer.manage')
  );

drop policy if exists driver_odometer_objects_select_org_odometer_manage on storage.objects;
create policy driver_odometer_objects_select_org_odometer_manage
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-odometer'
    and exists (
      select 1
      from public.driver_shifts ds
      where (ds.start_photo_path = storage.objects.name or ds.end_photo_path = storage.objects.name)
        and (
          public.is_system_owner()
          or public.has_organization_permission(auth.uid(), ds.organization_id, 'odometer.manage')
        )
    )
  );

create or replace function public.review_driver_shift_odometer(
  p_shift_id uuid,
  p_phase text,
  p_decision text,
  p_review_note text default null
)
returns public.driver_shifts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift public.driver_shifts%rowtype;
  v_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_phase not in ('start', 'end') then
    raise exception 'INVALID_PHASE' using errcode = '22023';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  if p_decision = 'rejected' and v_note is null then
    raise exception 'REJECTION_NOTE_REQUIRED' using errcode = '22023';
  end if;

  select *
  into v_shift
  from public.driver_shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, v_shift.organization_id, 'odometer.manage')
  ) then
    raise exception 'ODOMETER_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;

  if p_phase = 'end' and (v_shift.end_odometer_reading is null or v_shift.end_photo_path is null) then
    raise exception 'END_READING_MISSING' using errcode = '22023';
  end if;

  if p_phase = 'start' then
    update public.driver_shifts
    set start_review_status = p_decision,
        start_reviewed_by = v_actor_id,
        start_reviewed_at = now(),
        start_review_note = v_note,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;
  else
    update public.driver_shifts
    set end_review_status = p_decision,
        end_reviewed_by = v_actor_id,
        end_reviewed_at = now(),
        end_review_note = v_note,
        updated_at = now()
    where id = p_shift_id
    returning * into v_shift;
  end if;

  insert into public.activity_logs (
    actor_user_id,
    target_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_actor_id,
    null,
    v_shift.organization_id,
    'driver_shift_odometer_' || p_phase || '_' || p_decision,
    'driver_shift',
    v_shift.id,
    jsonb_build_object(
      'phase', p_phase,
      'review_status', p_decision,
      'review_note', v_note,
      'driver_id', v_shift.driver_id,
      'vehicle_id', v_shift.vehicle_id
    ),
    jsonb_build_object('source', 'dashboard')
  );

  return v_shift;
end;
$$;

revoke all on function public.review_driver_shift_odometer(uuid, text, text, text) from public, anon;
grant execute on function public.review_driver_shift_odometer(uuid, text, text, text) to authenticated;
