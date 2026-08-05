-- Read-only verification queries for Phase 1 organization/access foundation.
-- These queries inspect catalog metadata only; they do not insert, update, or delete data.

select
  to_regclass('public.organizations') as organizations_table,
  to_regclass('public.organization_access') as organization_access_table;

select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organizations', 'organization_access')
order by table_name, ordinal_position;

select
  column_name,
  data_type,
  udt_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'home_organization_id';

select
  e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'organization_access_level'
order by e.enumsortorder;

select
  conname,
  conrelid::regclass as table_name,
  confrelid::regclass as referenced_table,
  confdeltype
from pg_constraint
where conname in (
  'profiles_home_organization_id_fkey',
  'organization_access_user_id_fkey',
  'organization_access_organization_id_fkey'
)
order by conname;

select
  c.conname,
  c.conrelid::regclass as table_name,
  c.contype,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conname in (
  'organizations_name_not_blank',
  'organizations_code_not_blank',
  'organizations_code_key',
  'organization_access_pkey'
)
order by c.conname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'organizations', 'organization_access')
order by c.relname;

select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'organizations', 'organization_access')
order by tablename, policyname;

with expected_policies(policyname) as (
  values
    ('organizations_select_viewable'),
    ('organizations_insert_system_owner'),
    ('organizations_update_system_owner'),
    ('organizations_delete_system_owner'),
    ('organization_access_select_own_or_system_owner'),
    ('organization_access_insert_system_owner'),
    ('organization_access_update_system_owner'),
    ('organization_access_delete_system_owner'),
    ('profiles_select_organization_visible')
)
select
  e.policyname,
  p.policyname is not null as exists
from expected_policies e
left join pg_policies p
  on p.schemaname = 'public'
 and p.policyname = e.policyname
order by e.policyname;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_system_owner',
    'can_view_organization',
    'can_manage_organization'
  )
order by p.proname;

select
  t.tgname as trigger_name,
  t.tgrelid::regclass as table_name,
  p.proname as trigger_function
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgrelid in (
    'public.organizations'::regclass,
    'public.organization_access'::regclass
  )
  and t.tgname in (
    'set_organizations_updated_at',
    'set_organization_access_updated_at'
  )
order by t.tgrelid::regclass::text, t.tgname;

select
  p.proname,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_organization_foundation_updated_at';

-- The migration should use the explicit trigger function above for both new tables.
-- There should be no catalog-order dependent trigger discovery such as selecting
-- the first non-internal trigger from public.profiles.
select
  t.tgname as profiles_trigger_name,
  p.proname as profiles_trigger_function
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgrelid = 'public.profiles'::regclass
order by t.tgname;

select
  proname,
  pg_get_functiondef(oid) as helper_definition
from pg_proc
where oid in (
  'public.can_view_organization(uuid)'::regprocedure,
  'public.can_manage_organization(uuid)'::regprocedure
)
order by proname;

select count(*) as existing_profile_count
from public.profiles;

select count(*) as existing_profiles_with_home_organization
from public.profiles
where home_organization_id is not null;
