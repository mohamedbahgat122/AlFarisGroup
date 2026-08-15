-- Update organization_shift_templates RLS to allow drivers to see all shifts in their organization (needed for shift change requests)
DROP POLICY IF EXISTS organization_shift_templates_select_scoped ON public.organization_shift_templates;
CREATE POLICY organization_shift_templates_select_scoped
  ON public.organization_shift_templates
  FOR SELECT
  TO authenticated
  USING (
    public.has_organization_permission(auth.uid(), organization_id, 'shifts.view')
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      JOIN public.profiles p ON p.id = d.auth_user_id
      WHERE p.id = auth.uid()
        AND d.organization_id = organization_shift_templates.organization_id
        AND p.role = 'driver'::public.app_role
        AND p.status = 'active'::public.account_status
        AND p.deleted_at IS NULL
        AND p.must_change_password = false
        AND d.status = 'active'::public.driver_status
        AND d.deleted_at IS NULL
    )
  );
