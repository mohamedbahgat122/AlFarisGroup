-- Read-only verification for Phase 5A drivers management.

with checks as (
  select
    'drivers_tables_exist' as check_name,
    (
      select count(*) = 3
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('drivers', 'driver_bank_details', 'driver_documents')
    ) as passed
  union all
  select
    'drivers_enums_exist',
    (
      select count(*) = 3
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname in (
          'driver_vehicle_type',
          'driver_document_type',
          'driver_settlement_type'
        )
    )
  union all
  select
    'driver_vehicle_type_values',
    (
      select array_agg(e.enumlabel::text order by e.enumsortorder) = array['motorcycle', 'car']
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'driver_vehicle_type'
    )
  union all
  select
    'driver_document_type_values',
    (
      select array_agg(e.enumlabel::text order by e.enumsortorder) = array['iqama', 'driver_card', 'driving_license']
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'driver_document_type'
    )
  union all
  select
    'driver_settlement_type_values',
    (
      select array_agg(e.enumlabel::text order by e.enumsortorder) = array['tiers', 'per_order']
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'driver_settlement_type'
    )
  union all
  select
    'drivers_new_columns_exist',
    (
      select count(*) = 13
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'drivers'
        and column_name in (
          'keeta_driver_id',
          'driving_license_number',
          'driving_license_expiry_date',
          'vehicle_serial_number',
          'vehicle_owner_identifier',
          'vehicle_brand',
          'is_vehicle_owner',
          'settlement_type',
          'status',
          'created_by_user_id',
          'updated_by_user_id',
          'deleted_at',
          'deleted_by_user_id'
        )
    )
  union all
  select
    'driver_status_values',
    (
      select array_agg(e.enumlabel::text order by e.enumsortorder) = array['active', 'suspended']
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'driver_status'
    )
  union all
  select
    'driver_audit_foreign_keys',
    (
      select count(*) = 3
      from pg_constraint
      where conname in (
        'drivers_created_by_user_id_fkey',
        'drivers_updated_by_user_id_fkey',
        'drivers_deleted_by_user_id_fkey'
      )
        and contype = 'f'
        and confdeltype = 'n'
    )
  union all
  select
    'required_foreign_keys',
    (
      select count(*) = 3
      from pg_constraint
      where conname in (
        'drivers_organization_id_fkey',
        'driver_bank_details_driver_id_fkey',
        'driver_documents_driver_id_fkey'
      )
        and contype = 'f'
    )
  union all
  select
    'required_constraints',
    (
      select count(*) >= 17
      from pg_constraint
      where conname in (
        'drivers_full_name_not_blank',
        'drivers_nationality_not_blank',
        'drivers_mobile_number_not_blank',
        'drivers_vehicle_number_not_blank',
        'drivers_keeta_username_not_blank',
        'drivers_iqama_number_not_blank',
        'drivers_driver_card_number_not_blank',
        'drivers_vehicle_authorization_number_not_blank',
        'drivers_keeta_driver_id_not_blank',
        'drivers_driving_license_number_not_blank',
        'drivers_vehicle_serial_number_not_blank',
        'drivers_vehicle_owner_identifier_not_blank',
        'drivers_vehicle_brand_not_blank',
        'drivers_iqama_number_key',
        'driver_bank_details_iban_not_blank',
        'driver_bank_details_bank_name_not_blank',
        'driver_bank_details_account_number_not_blank',
        'driver_bank_details_iban_shape',
        'driver_documents_driver_type_key',
        'driver_documents_storage_path_not_blank',
        'driver_documents_original_filename_not_blank',
        'driver_documents_mime_type_allowed',
        'driver_documents_size_valid'
      )
    )
  union all
  select
    'keeta_driver_id_unique_index_exists',
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'drivers'
        and indexname = 'drivers_organization_keeta_driver_id_key'
        and indexdef ilike '%unique%'
        and indexdef ilike '%organization_id%'
        and indexdef ilike '%keeta_driver_id%'
        and indexdef ilike '%where (keeta_driver_id is not null)%'
    )
  union all
  select
    'rls_enabled',
    (
      select bool_and(relrowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('drivers', 'driver_bank_details', 'driver_documents')
    )
  union all
  select
    'expected_policies_exist',
    (
      select count(*) = 9
      from pg_policies
      where schemaname = 'public'
        and tablename in ('drivers', 'driver_bank_details', 'driver_documents')
        and policyname in (
          'drivers_select_viewable_organization',
          'drivers_insert_manage_organization',
          'drivers_update_manage_organization',
          'driver_bank_details_select_viewable_organization',
          'driver_bank_details_insert_manage_organization',
          'driver_bank_details_update_manage_organization',
          'driver_documents_select_viewable_organization',
          'driver_documents_insert_manage_organization',
          'driver_documents_update_manage_organization'
        )
    )
  union all
  select
    'updated_at_triggers_exist',
    (
      select count(*) = 3
      from pg_trigger
      where tgname in (
        'set_drivers_updated_at',
        'set_driver_bank_details_updated_at',
        'set_driver_documents_updated_at'
      )
        and not tgisinternal
    )
  union all
  select
    'rpc_functions_exist',
    (
      select count(*) = 8
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'assert_driver_manager_actor',
          'normalize_driver_iban',
          'safe_driver_snapshot',
          'validate_driver_document_item',
          'create_driver_record',
          'update_driver_record',
          'set_driver_status',
          'archive_driver_record'
        )
    )
  union all
  select
    'service_role_rpc_execute_grants',
    (
      select count(*) = 4
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name in (
          'create_driver_record',
          'update_driver_record',
          'set_driver_status',
          'archive_driver_record'
        )
        and grantee = 'service_role'
        and privilege_type = 'EXECUTE'
    )
  union all
  select
    'rpc_grants_service_role_only',
    not exists (
      select 1
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name in (
          'create_driver_record',
          'update_driver_record',
          'set_driver_status',
          'archive_driver_record'
        )
        and privilege_type = 'EXECUTE'
        and grantee in ('anon', 'authenticated', 'public')
    )
  union all
  select
    'no_delete_policy_introduced',
    not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename in ('drivers', 'driver_bank_details', 'driver_documents')
        and cmd = 'DELETE'
    )
  union all
  select
    'service_role_required_select_grants',
    (
      has_table_privilege('service_role', 'public.drivers', 'SELECT')
      and has_table_privilege('service_role', 'public.driver_bank_details', 'SELECT')
      and has_table_privilege('service_role', 'public.driver_documents', 'SELECT')
      and has_table_privilege('service_role', 'public.profiles', 'SELECT')
      and has_table_privilege('service_role', 'public.activity_logs', 'SELECT')
      and has_table_privilege('service_role', 'public.activity_logs', 'INSERT')
    )
  union all
  select
    'private_storage_bucket_exists',
    exists (
      select 1
      from storage.buckets
      where id = 'driver-documents'
        and name = 'driver-documents'
        and public = false
        and file_size_limit = 10485760
    )
  union all
  select
    'driver_record_count_readable',
    (
      select count(*) >= 0
      from public.drivers
    )
  union all
  select
    'existing_driver_rows_preserved',
    (
      select count(*) >= 1
      from public.drivers
    )
  union all
  select
    'existing_bank_rows_preserved',
    (
      select count(*) >= 1
      from public.driver_bank_details
    )
  union all
  select
    'existing_document_rows_preserved',
    (
      select count(*) >= 3
      from public.driver_documents
    )
)
select check_name, passed
from checks
order by check_name;
