-- Driver App password-change completion and linked organization visibility.
-- The canonical Driver App profile role in this schema is public.app_role 'driver'.

update public.profiles p
set
  home_organization_id = d.organization_id,
  updated_at = now()
from public.drivers d
where d.auth_user_id = p.id
  and p.role = 'driver'::public.app_role
  and p.deleted_at is null
  and d.deleted_at is null
  and d.organization_id is not null
  and p.home_organization_id is distinct from d.organization_id;

create or replace function public.can_view_linked_driver_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.drivers d
      on d.auth_user_id = p.id
    where p.id = auth.uid()
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
      and d.organization_id = target_organization_id
  );
$$;

revoke all on function public.can_view_linked_driver_organization(uuid)
  from public, anon;
grant execute on function public.can_view_linked_driver_organization(uuid)
  to authenticated;

drop policy if exists organizations_select_linked_driver_organization
  on public.organizations;
create policy organizations_select_linked_driver_organization
  on public.organizations
  for select
  to authenticated
  using (
    is_active = true
    and public.can_view_linked_driver_organization(id)
  );

create or replace function public.complete_driver_password_change()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'Driver password change completion failed: authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'driver'::public.app_role
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
  ) then
    raise exception 'Driver password change completion failed: profile unavailable.';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.auth_user_id = v_user_id
      and d.status = 'active'::public.driver_status
      and d.deleted_at is null
  ) then
    raise exception 'Driver password change completion failed: driver unavailable.';
  end if;

  update public.profiles p
  set
    must_change_password = false,
    updated_at = now()
  where p.id = v_user_id
    and p.role = 'driver'::public.app_role
    and p.status = 'active'::public.account_status
    and p.deleted_at is null
    and p.must_change_password = true
  returning true into v_updated;

  return jsonb_build_object(
    'success', true,
    'updated', coalesce(v_updated, false)
  );
end;
$$;

revoke all on function public.complete_driver_password_change()
  from public, anon, authenticated;
grant execute on function public.complete_driver_password_change()
  to authenticated;
