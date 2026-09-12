-- Corrective Migration for Supervisor Shifts Table Grants and Permission Keys

-- 1. Grant Least Privilege (SELECT, INSERT, UPDATE) on supervisor shifts tables
-- We do not grant DELETE as the module relies on historical soft-closure (end_date updates) or status cancellation.

-- public.supervisor_shifts
GRANT SELECT, INSERT, UPDATE ON public.supervisor_shifts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_shifts TO service_role;

-- public.supervisor_shift_assignments
GRANT SELECT, INSERT, UPDATE ON public.supervisor_shift_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_shift_assignments TO service_role;

-- public.supervisor_organization_assignments
GRANT SELECT, INSERT, UPDATE ON public.supervisor_organization_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_organization_assignments TO service_role;

-- public.supervisor_leaves
GRANT SELECT, INSERT, UPDATE ON public.supervisor_leaves TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_leaves TO service_role;

-- 2. Update Global Permissions Check Constraint
-- Drop and recreate to include the new supervisor shifts global permissions

ALTER TABLE public.user_global_permissions
  DROP CONSTRAINT IF EXISTS user_global_permissions_permission_key_check,
  ADD CONSTRAINT user_global_permissions_permission_key_check CHECK (
    permission_key IN (
      'fleet.view',
      'fleet.create',
      'fleet.update',
      'fleet.technical_status',
      'fleet.operational_status',
      'fleet.archive',
      'fleet.operating_card.download',
      'fleet.activity.view',
      'housing.view',
      'housing.create',
      'housing.update',
      'housing.archive',
      'housing.assign_organizations',
      'housing.assign_drivers',
      'housing.activity.view',
      'supervisor_shifts.view',
      'supervisor_shifts.manage',
      'supervisor_shifts.manage_leave'
    )
  );
