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
  v_current_assignment public.supervisor_shift_assignments%rowtype;
  v_end_date date;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'system_owner') OR
    public.actor_has_global_permission(v_uid, 'supervisor_shifts.manage')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_supervisor_id AND role = 'supervisor') THEN
    RAISE EXCEPTION 'Profile is not a supervisor';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.supervisor_shifts WHERE id = p_new_shift_id AND is_active = true) THEN
    RAISE EXCEPTION 'New shift does not exist or is not active';
  END IF;

  SELECT *
  INTO v_current_assignment
  FROM public.supervisor_shift_assignments
  WHERE supervisor_id = p_supervisor_id
    AND end_date IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.supervisor_shift_assignments
      (supervisor_id, shift_id, start_date, notes, created_by)
    VALUES
      (p_supervisor_id, p_new_shift_id, p_start_date, p_notes, v_uid);
    RETURN;
  END IF;

  IF p_start_date < v_current_assignment.start_date THEN
    RAISE EXCEPTION 'SUPERVISOR_SHIFT_TRANSFER_BEFORE_CURRENT_START';
  END IF;

  IF p_new_shift_id = v_current_assignment.shift_id THEN
    RETURN;
  END IF;

  IF p_start_date = v_current_assignment.start_date THEN
    UPDATE public.supervisor_shift_assignments
    SET shift_id = p_new_shift_id,
        notes = p_notes,
        updated_by = v_uid,
        updated_at = now()
    WHERE id = v_current_assignment.id;
    RETURN;
  END IF;

  v_end_date := p_start_date - interval '1 day';

  UPDATE public.supervisor_shift_assignments
  SET end_date = v_end_date,
      updated_by = v_uid,
      updated_at = now()
  WHERE id = v_current_assignment.id;

  INSERT INTO public.supervisor_shift_assignments
    (supervisor_id, shift_id, start_date, notes, created_by)
  VALUES
    (p_supervisor_id, p_new_shift_id, p_start_date, p_notes, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_supervisor_shift(uuid, uuid, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transfer_supervisor_shift(uuid, uuid, date, text) TO authenticated;
