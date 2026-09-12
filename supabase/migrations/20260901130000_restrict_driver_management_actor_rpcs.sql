create or replace function public.actor_has_global_permission(
  p_actor_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
security definer
set search_path to ''
as $function$
  with trusted_actor as (
    select case
      when auth.role() = 'service_role' then p_actor_user_id
      when auth.uid() is not null and p_actor_user_id is not distinct from auth.uid() then auth.uid()
      else null::uuid
    end as user_id
  )
  select exists (
      select 1
      from public.profiles p
      cross join trusted_actor actor
      where p.id = actor.user_id
        and p.status = 'active'::public.account_status
        and p.deleted_at is null
        and (
          p.role = 'system_owner'::public.app_role
          or exists (
            select 1
            from public.user_global_permissions ugp
            where ugp.user_id = actor.user_id
              and ugp.permission_key = p_permission_key
          )
        )
    );
$function$;

revoke all on function public.actor_has_global_permission(uuid, text) from public, anon;
grant execute on function public.actor_has_global_permission(uuid, text) to authenticated, service_role;

revoke execute on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb,
  uuid, text
) from public, anon, authenticated;
grant execute on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb,
  uuid, text
) to service_role;

revoke execute on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb,
  uuid, text
) from public, anon, authenticated;
grant execute on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb,
  uuid, text
) to service_role;

revoke execute on function public.create_driver_record_v2(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, boolean, public.driver_settlement_type, text, date, text,
  date, text, date, text, text, text, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_driver_record_v2(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, boolean, public.driver_settlement_type, text, date, text,
  date, text, date, text, text, text, jsonb, uuid, text
) to service_role;

revoke execute on function public.update_driver_record_v2(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, boolean, public.driver_settlement_type, text, date, text,
  date, text, date, text, text, text, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.update_driver_record_v2(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, boolean, public.driver_settlement_type, text, date, text,
  date, text, date, text, text, text, jsonb, uuid, text
) to service_role;

revoke execute on function public.start_driver_keeta_period(uuid, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.start_driver_keeta_period(uuid, uuid, text, date)
  to service_role;

revoke execute on function public.resign_driver_keeta_period(uuid, uuid, date, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.resign_driver_keeta_period(uuid, uuid, date, integer, numeric, text)
  to service_role;

revoke execute on function public.assign_driver_to_housing(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assign_driver_to_housing(uuid, uuid, uuid, text)
  to service_role;

revoke execute on function public.assign_driver_to_housing_room(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assign_driver_to_housing_room(uuid, uuid, uuid, uuid, text)
  to service_role;

revoke execute on function public.remove_driver_from_housing(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_driver_from_housing(uuid, uuid, uuid)
  to service_role;

revoke execute on function public.set_housing_organization_assignment(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_housing_organization_assignment(uuid, uuid, uuid, boolean)
  to service_role;

revoke execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_managed_user_organization_permissions(uuid, uuid, jsonb)
  to service_role;
