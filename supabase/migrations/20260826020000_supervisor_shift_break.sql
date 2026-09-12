-- 1. Add break fields to supervisor_shifts
ALTER TABLE public.supervisor_shifts
ADD COLUMN break_start_time time NULL,
ADD COLUMN break_end_time time NULL;

-- 2. Create the validation function
CREATE OR REPLACE FUNCTION public.is_valid_shift_break(
  p_shift_start time,
  p_shift_end time,
  p_break_start time,
  p_break_end time
) RETURNS boolean AS $$
DECLARE
  v_shift_dur interval;
  v_break_start_off interval;
  v_break_end_off interval;
BEGIN
  -- If both are NULL, it's valid (no scheduled break)
  IF p_break_start IS NULL AND p_break_end IS NULL THEN
    RETURN true;
  END IF;

  -- If only one is NULL, it's invalid
  IF p_break_start IS NULL OR p_break_end IS NULL THEN
    RETURN false;
  END IF;

  -- Calculate shift duration (gross)
  v_shift_dur := p_shift_end - p_shift_start;
  IF v_shift_dur <= interval '0' THEN
    v_shift_dur := v_shift_dur + interval '24 hours';
  END IF;

  -- Calculate break start offset from shift start
  v_break_start_off := p_break_start - p_shift_start;
  IF v_break_start_off < interval '0' THEN
    v_break_start_off := v_break_start_off + interval '24 hours';
  END IF;

  -- Calculate break end offset from shift start
  v_break_end_off := p_break_end - p_shift_start;
  IF v_break_end_off <= interval '0' THEN
    -- if break end is exactly same as shift start, it wrapped around a full 24h
    v_break_end_off := v_break_end_off + interval '24 hours';
  END IF;

  -- Break start MUST be strictly less than break end
  IF v_break_start_off >= v_break_end_off THEN
    RETURN false;
  END IF;

  -- Break end MUST be less than or equal to shift duration
  IF v_break_end_off > v_shift_dur THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Add the CHECK constraint
ALTER TABLE public.supervisor_shifts
ADD CONSTRAINT supervisor_shifts_valid_break_check
CHECK (public.is_valid_shift_break(start_time, end_time, break_start_time, break_end_time));
