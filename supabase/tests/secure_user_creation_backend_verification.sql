-- Read-only verification for Phase 3A secure managed user creation backend.
-- These queries do not create Auth users, profiles, organization access rows, or test data.

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.provolatile,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_managed_user_profile';

select
  has_function_privilege(
    'public',
    'public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)',
    'execute'
  ) as public_can_execute,
  has_function_privilege(
    'anon',
    'public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)',
    'execute'
  ) as anon_can_execute,
  has_function_privilege(
    'authenticated',
    'public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)',
    'execute'
  ) as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    'public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)',
    'execute'
  ) as service_role_can_execute;

select
  position('system_owner' in pg_get_functiondef('public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)'::regprocedure)) > 0
    as function_mentions_system_owner_rejection,
  position('driver' in pg_get_functiondef('public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)'::regprocedure)) > 0
    as function_mentions_driver_restriction,
  position('jsonb_array_elements' in pg_get_functiondef('public.create_managed_user_profile(uuid, text, public.app_role, text, uuid, jsonb)'::regprocedure)) > 0
    as function_validates_access_json;

select count(*) as current_auth_user_count
from auth.users;

select count(*) as current_profile_count
from public.profiles;

select count(*) as current_organization_access_count
from public.organization_access;
