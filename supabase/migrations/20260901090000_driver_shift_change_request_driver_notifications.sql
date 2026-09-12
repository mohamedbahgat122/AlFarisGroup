create or replace function public.notify_driver_shift_change_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_user_id uuid;
  v_requested_shift_name text;
  v_requested_week text;
  v_title text;
  v_message text;
begin
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  select d.auth_user_id
    into v_driver_user_id
  from public.drivers d
  where d.id = new.driver_id
    and d.organization_id = new.organization_id
    and d.deleted_at is null;

  if v_driver_user_id is null then
    return new;
  end if;

  select ost.name
    into v_requested_shift_name
  from public.organization_shift_templates ost
  where ost.id = new.requested_shift_id;

  v_requested_week := to_char(new.requested_week_start_date, 'YYYY-MM-DD');

  if new.status = 'approved' then
    v_title := 'تم قبول طلب تغيير الشيفت';
    v_message := 'تم قبول طلب تغيير الشيفت'
      || coalesce(' إلى ' || nullif(v_requested_shift_name, ''), '')
      || ' للأسبوع الذي يبدأ ' || v_requested_week || '.';
  else
    v_title := 'تم رفض طلب تغيير الشيفت';
    v_message := 'تم رفض طلب تغيير الشيفت'
      || coalesce(' إلى ' || nullif(v_requested_shift_name, ''), '')
      || ' للأسبوع الذي يبدأ ' || v_requested_week || '.';
  end if;

  perform public.insert_app_notification(
    v_driver_user_id,
    new.organization_id,
    'driver_shift_change_request_' || new.status,
    v_title,
    v_message,
    'driver_shift_change_request',
    new.id,
    'driver_shift_change_request:' || new.id::text || ':' || new.status || ':' || v_driver_user_id::text
  );

  return new;
end;
$$;

drop trigger if exists notify_driver_shift_change_request_reviewed
  on public.driver_shift_change_requests;
create trigger notify_driver_shift_change_request_reviewed
  after update of status on public.driver_shift_change_requests
  for each row
  execute function public.notify_driver_shift_change_request_reviewed();

revoke all on function public.notify_driver_shift_change_request_reviewed()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
