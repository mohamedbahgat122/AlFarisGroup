create or replace function public.mark_driver_app_request_submitted_notifications_read(
  p_request_id uuid,
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_updated_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.driver_app_requests request
    where request.id = p_request_id
      and request.organization_id = p_organization_id
  ) then
    return 0;
  end if;

  if not (
    public.is_system_owner_user(v_actor_id)
    or public.has_organization_permission(v_actor_id, p_organization_id, 'app_requests.view')
    or public.has_organization_permission(v_actor_id, p_organization_id, 'app_requests.review')
  ) then
    raise exception 'APP_REQUEST_NOTIFICATION_READ_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  update public.app_notifications
  set
    is_read = true,
    read_at = now()
  where organization_id = p_organization_id
    and entity_type = 'driver_app_request'
    and entity_id = p_request_id
    and type = 'driver_app_request_submitted'
    and read_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_driver_app_request_submitted_notifications_read(uuid, uuid)
  from public, anon;
grant execute on function public.mark_driver_app_request_submitted_notifications_read(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
