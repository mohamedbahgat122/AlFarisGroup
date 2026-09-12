create or replace function public.restore_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.drivers%rowtype;
  v_before jsonb;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  select * into v_existing
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
  for update;

  if not found then raise exception 'Driver restore failed: driver is unavailable.'; end if;
  if v_existing.deleted_at is null then raise exception 'Driver restore failed: driver is not archived.'; end if;

  v_before := public.safe_driver_snapshot(p_driver_id);

  update public.drivers
  set deleted_at = null,
      deleted_by_user_id = null,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  where id = p_driver_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_organization_id,
    'driver_restored',
    'driver',
    p_driver_id,
    v_before,
    public.safe_driver_snapshot(p_driver_id)
  );
end;
$$;

revoke all on function public.restore_driver_record(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.restore_driver_record(uuid, uuid, uuid)
  to service_role;
