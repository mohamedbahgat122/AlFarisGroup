begin;

create or replace function public.organization_permission_keys()
returns text[] language sql stable set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'drivers.create', 'drivers.update',
    'drivers.status', 'drivers.archive', 'drivers.documents.view', 'drivers.documents.download',
    'drivers.activity.view', 'drivers.account.manage', 'driver_reports.view', 'driver_reports.import',
    'driver_reports.replace', 'driver_reports.details.view', 'driver_order_reports.view',
    'driver_order_reports.import', 'driver_order_reports.replace', 'driver_order_reports.details.view',
    'driver_order_reports.edit', 'fleet.cars.view', 'fleet.motorcycles.view', 'fleet.create',
    'fleet.update', 'fleet.technical_status', 'fleet.operational_status', 'fleet.archive',
    'fleet.operating_card.download', 'fleet.activity.view', 'fuel.manage', 'fuel.reports.view',
    'fuel.increase.review', 'app_requests.view', 'app_requests.review', 'odometer.manage',
    'notifications.view', 'driver_warnings.view', 'driver_warnings.issue', 'driver_warnings.revoke',
    'entitlements.view', 'entitlements.create_transaction', 'entitlements.view_transactions',
    'entitlements.reverse_transaction', 'entitlements.publish', 'shifts.view', 'shifts.create',
    'shifts.update', 'shifts.assign', 'shifts.archive', 'maintenance_providers.view',
    'maintenance_providers.manage', 'maintenance_jobs.view', 'maintenance_jobs.assign',
    'maintenance_jobs.cancel', 'maintenance_materials.view', 'maintenance_materials.manage',
    'order_periods.view', 'order_periods.manage', 'order_periods.create', 'order_periods.update',
    'order_periods.assign', 'order_periods.open_now', 'order_periods.requests.review',
    'order_periods.settings', 'order_periods.archive', 'order_periods.activity.view'
  ]::text[];
$$;

create or replace function public.view_only_organization_permission_keys()
returns text[] language sql immutable security definer set search_path = '' as $$
  select array[
    'organization.dashboard.view', 'drivers.view', 'driver_reports.view', 'driver_order_reports.view',
    'fleet.cars.view', 'fleet.motorcycles.view', 'fuel.reports.view', 'app_requests.view',
    'odometer.manage', 'notifications.view', 'driver_warnings.view', 'entitlements.view',
    'entitlements.view_transactions', 'shifts.view', 'maintenance_providers.view',
    'maintenance_jobs.view', 'maintenance_materials.view', 'order_periods.view',
    'order_periods.activity.view'
  ]::text[];
$$;

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;
alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check
  check (permission_key = any (public.organization_permission_keys()));

insert into public.organization_user_permissions (user_id, organization_id, permission_key, granted_by, updated_by)
select user_id, organization_id, 'order_periods.activity.view', granted_by, granted_by
from public.organization_user_permissions
where permission_key = 'order_periods.manage'
on conflict (user_id, organization_id, permission_key) do nothing;

drop policy if exists activity_logs_select_order_shift_history on public.activity_logs;
create policy activity_logs_select_order_shift_history
  on public.activity_logs
  for select
  to authenticated
  using (
    organization_id is not null
    and action = any (array[
      'order_period_template_created',
      'order_period_template_updated',
      'order_shift_operational_policy_updated',
      'order_shift_change_settings_updated',
      'order_shift_published',
      'order_shift_unpublished',
      'order_shift_enabled',
      'order_shift_disabled',
      'order_shift_archived',
      'order_period_week_membership_replaced',
      'order_period_driver_moved',
      'order_shift_driver_opened_now',
      'order_shift_change_request_approved',
      'order_shift_change_request_rejected'
    ]::text[])
    and (
      public.has_current_user_organization_permission(organization_id, 'order_periods.activity.view')
      or public.has_current_user_organization_permission(organization_id, 'order_periods.manage')
    )
  );

commit;
