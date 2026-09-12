-- 0. Update registry permissions (Manual step skipped here but assumed to be in global-registry.ts)

-- 1. Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_supervisor_shifts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Create supervisor_shifts table
CREATE TABLE public.supervisor_shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  work_days integer[] NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER set_supervisor_shifts_updated_at
  BEFORE UPDATE ON public.supervisor_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supervisor_shifts_updated_at();

-- 3. Create supervisor_shift_assignments table
CREATE TABLE public.supervisor_shift_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supervisor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.supervisor_shifts(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_assignment_dates CHECK (end_date IS NULL OR start_date <= end_date)
);

CREATE UNIQUE INDEX idx_supervisor_active_shift ON public.supervisor_shift_assignments(supervisor_id) WHERE end_date IS NULL;

CREATE TRIGGER set_supervisor_shift_assignments_updated_at
  BEFORE UPDATE ON public.supervisor_shift_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supervisor_shifts_updated_at();

-- 4. Create supervisor_organization_assignments table
CREATE TABLE public.supervisor_organization_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supervisor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_org_assignment_dates CHECK (end_date IS NULL OR start_date <= end_date)
);

CREATE UNIQUE INDEX idx_supervisor_active_org ON public.supervisor_organization_assignments(supervisor_id, organization_id) WHERE end_date IS NULL;

CREATE TRIGGER set_supervisor_organization_assignments_updated_at
  BEFORE UPDATE ON public.supervisor_organization_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supervisor_shifts_updated_at();

-- 5. Create supervisor_leaves table
CREATE TABLE public.supervisor_leaves (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supervisor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type text,
  reason text,
  notes text,
  covered_by_supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'cancelled')),
  cancelled_at timestamp with time zone,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_leave_dates CHECK (start_date <= end_date),
  CONSTRAINT no_self_coverage CHECK (supervisor_id != covered_by_supervisor_id)
);

CREATE TRIGGER set_supervisor_leaves_updated_at
  BEFORE UPDATE ON public.supervisor_leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supervisor_shifts_updated_at();

-- 6. Leave Validations (Overlap & Coverage)
CREATE OR REPLACE FUNCTION public.check_supervisor_leave_validations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Overlap check
  IF NEW.status = 'active' THEN
    IF EXISTS (
      SELECT 1 FROM public.supervisor_leaves
      WHERE supervisor_id = NEW.supervisor_id
        AND status = 'active'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND (NEW.start_date <= end_date AND NEW.end_date >= start_date)
    ) THEN
      RAISE EXCEPTION 'Leave overlaps with an existing active leave';
    END IF;
  END IF;
  
  -- Coverage check
  IF NEW.covered_by_supervisor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.covered_by_supervisor_id AND role = 'supervisor') THEN
      RAISE EXCEPTION 'Covering profile is not a supervisor';
    END IF;
    
    IF EXISTS (
      SELECT 1 FROM public.supervisor_leaves
      WHERE supervisor_id = NEW.covered_by_supervisor_id
        AND status = 'active'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND (NEW.start_date <= end_date AND NEW.end_date >= start_date)
    ) THEN
      RAISE EXCEPTION 'Covering supervisor is on leave during this period';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_supervisor_leave_validations_trigger
  BEFORE INSERT OR UPDATE ON public.supervisor_leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.check_supervisor_leave_validations();

-- 7. Stored Procedure for Shift Transfer
CREATE OR REPLACE FUNCTION public.transfer_supervisor_shift(
  p_supervisor_id uuid,
  p_new_shift_id uuid,
  p_start_date date,
  p_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_end_date date;
  v_uid uuid := auth.uid();
BEGIN
  -- Authorization check
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'system_owner') OR
    public.actor_has_global_permission(v_uid, 'supervisor_shifts.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate profile is supervisor
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_supervisor_id AND role = 'supervisor') THEN
    RAISE EXCEPTION 'Profile is not a supervisor';
  END IF;
  
  -- Validate new shift
  IF NOT EXISTS (SELECT 1 FROM public.supervisor_shifts WHERE id = p_new_shift_id AND is_active = true) THEN
    RAISE EXCEPTION 'New shift does not exist or is not active';
  END IF;
  
  -- Validate start date against current assignment
  IF EXISTS (
    SELECT 1 FROM public.supervisor_shift_assignments 
    WHERE supervisor_id = p_supervisor_id 
      AND end_date IS NULL 
      AND start_date >= p_start_date
  ) THEN
    RAISE EXCEPTION 'Cannot transfer shift with start date on or before current assignment start date';
  END IF;

  -- Close current
  v_end_date := p_start_date - interval '1 day';

  UPDATE public.supervisor_shift_assignments
  SET end_date = v_end_date, updated_by = v_uid
  WHERE supervisor_id = p_supervisor_id AND end_date IS NULL;

  -- Insert new
  INSERT INTO public.supervisor_shift_assignments 
    (supervisor_id, shift_id, start_date, notes, created_by)
  VALUES 
    (p_supervisor_id, p_new_shift_id, p_start_date, p_notes, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_supervisor_shift(uuid, uuid, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transfer_supervisor_shift(uuid, uuid, date, text) TO authenticated;

-- 8. Stored Procedure for Leave Cancellation
CREATE OR REPLACE FUNCTION public.cancel_supervisor_leave(
  p_leave_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current_status text;
BEGIN
  -- Authorization check
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'system_owner') OR
    public.actor_has_global_permission(v_uid, 'supervisor_shifts.manage_leave')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT status INTO v_current_status FROM public.supervisor_leaves WHERE id = p_leave_id;
  
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Leave not found';
  END IF;
  
  IF v_current_status = 'cancelled' THEN
    RAISE EXCEPTION 'Leave is already cancelled';
  END IF;

  UPDATE public.supervisor_leaves
  SET 
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_uid,
    cancellation_reason = p_reason,
    updated_by = v_uid
  WHERE id = p_leave_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_supervisor_leave(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supervisor_leave(uuid, text) TO authenticated;

-- 9. Row Level Security Policies
ALTER TABLE public.supervisor_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_organization_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_leaves ENABLE ROW LEVEL SECURITY;

-- supervisor_shifts policies
CREATE POLICY supervisor_shifts_select
  ON public.supervisor_shifts FOR SELECT TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

CREATE POLICY supervisor_shifts_manage
  ON public.supervisor_shifts FOR ALL TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'))
  WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

-- supervisor_shift_assignments policies
CREATE POLICY supervisor_shift_assignments_select
  ON public.supervisor_shift_assignments FOR SELECT TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

CREATE POLICY supervisor_shift_assignments_manage
  ON public.supervisor_shift_assignments FOR ALL TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'))
  WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

-- supervisor_organization_assignments policies
CREATE POLICY supervisor_org_assignments_select
  ON public.supervisor_organization_assignments FOR SELECT TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

CREATE POLICY supervisor_org_assignments_manage
  ON public.supervisor_organization_assignments FOR ALL TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'))
  WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

-- supervisor_leaves policies
CREATE POLICY supervisor_leaves_select
  ON public.supervisor_leaves FOR SELECT TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));

CREATE POLICY supervisor_leaves_manage
  ON public.supervisor_leaves FOR ALL TO authenticated
  USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage_leave') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'))
  WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage_leave') OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_owner'));
-- 10. Stored Procedure for Updating Organization Assignments
CREATE OR REPLACE FUNCTION public.update_supervisor_organizations(
  p_supervisor_id uuid,
  p_organization_ids uuid[],
  p_start_date date,
  p_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_end_date date;
BEGIN
  -- Authorization check
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'system_owner') OR
    public.actor_has_global_permission(v_uid, 'supervisor_shifts.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_end_date := p_start_date - interval '1 day';

  -- Close assignments that are not in the new list
  UPDATE public.supervisor_organization_assignments
  SET end_date = v_end_date, updated_by = v_uid
  WHERE supervisor_id = p_supervisor_id 
    AND end_date IS NULL
    AND NOT (organization_id = ANY(p_organization_ids));

  -- Insert new assignments
  INSERT INTO public.supervisor_organization_assignments 
    (supervisor_id, organization_id, start_date, notes, created_by)
  SELECT p_supervisor_id, org_id, p_start_date, p_notes, v_uid
  FROM unnest(p_organization_ids) AS org_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.supervisor_organization_assignments
    WHERE supervisor_id = p_supervisor_id 
      AND organization_id = org_id 
      AND end_date IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_supervisor_organizations(uuid, uuid[], date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_supervisor_organizations(uuid, uuid[], date, text) TO authenticated;
