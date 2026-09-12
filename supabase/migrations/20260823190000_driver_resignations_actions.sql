-- 1. Add Settlement columns and constraints
ALTER TABLE public.driver_resignations
  ADD COLUMN is_settled boolean NOT NULL DEFAULT false,
  ADD COLUMN settled_at timestamptz NULL,
  ADD COLUMN settled_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Ensure consistency between is_settled and settled_at/settled_by
ALTER TABLE public.driver_resignations
  ADD CONSTRAINT driver_resignations_settlement_check
  CHECK (
    (is_settled = false AND settled_at IS NULL AND settled_by IS NULL) OR
    (is_settled = true AND settled_at IS NOT NULL)
  );

-- 2. Grant permissions for UPDATE and DELETE to authenticated users
GRANT UPDATE, DELETE ON public.driver_resignations TO authenticated;

-- For service_role
GRANT UPDATE, DELETE ON public.driver_resignations TO service_role;

-- Organization update policy
CREATE POLICY driver_resignations_update_manage_organization
  ON public.driver_resignations
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_organization(organization_id))
  WITH CHECK (public.can_manage_organization(organization_id));

-- Organization delete policy
CREATE POLICY driver_resignations_delete_manage_organization
  ON public.driver_resignations
  FOR DELETE
  TO authenticated
  USING (public.can_manage_organization(organization_id));
