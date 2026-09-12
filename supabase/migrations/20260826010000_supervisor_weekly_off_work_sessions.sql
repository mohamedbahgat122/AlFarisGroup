-- Create weekly off assignments table
CREATE TABLE public.supervisor_weekly_off_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    coverage_supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_weekly_off_supervisor_coverage CHECK (supervisor_id != coverage_supervisor_id),
    CONSTRAINT chk_weekly_off_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX idx_supervisor_weekly_off_active ON public.supervisor_weekly_off_assignments (supervisor_id) WHERE effective_to IS NULL;
CREATE INDEX idx_supervisor_weekly_off_supervisor ON public.supervisor_weekly_off_assignments (supervisor_id);

-- Create work sessions table
CREATE TABLE public.supervisor_work_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    started_by UUID NOT NULL REFERENCES public.profiles(id),
    ended_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_work_session_dates CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX idx_supervisor_work_session_active ON public.supervisor_work_sessions (supervisor_id) WHERE ended_at IS NULL;
CREATE INDEX idx_supervisor_work_sessions_lookup ON public.supervisor_work_sessions (supervisor_id, work_date);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_supervisor_weekly_off_work_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_supervisor_weekly_off_updated_at
    BEFORE UPDATE ON public.supervisor_weekly_off_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_supervisor_weekly_off_work_sessions_updated_at();

CREATE TRIGGER set_supervisor_work_sessions_updated_at
    BEFORE UPDATE ON public.supervisor_work_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_supervisor_weekly_off_work_sessions_updated_at();

-- Enable RLS
ALTER TABLE public.supervisor_weekly_off_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_work_sessions ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.supervisor_weekly_off_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisor_work_sessions TO authenticated;

-- Policies for weekly off
CREATE POLICY "Supervisors can view weekly off if they have view permission"
    ON public.supervisor_weekly_off_assignments FOR SELECT TO authenticated
    USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

CREATE POLICY "Supervisors can insert weekly off if they have manage permission"
    ON public.supervisor_weekly_off_assignments FOR INSERT TO authenticated
    WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

CREATE POLICY "Supervisors can update weekly off if they have manage permission"
    ON public.supervisor_weekly_off_assignments FOR UPDATE TO authenticated
    USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

-- Policies for work sessions
CREATE POLICY "Supervisors can view work sessions if they have view permission"
    ON public.supervisor_work_sessions FOR SELECT TO authenticated
    USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.view') OR public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

CREATE POLICY "Supervisors can insert work sessions if they have manage permission"
    ON public.supervisor_work_sessions FOR INSERT TO authenticated
    WITH CHECK (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

CREATE POLICY "Supervisors can update work sessions if they have manage permission"
    ON public.supervisor_work_sessions FOR UPDATE TO authenticated
    USING (public.actor_has_global_permission(auth.uid(), 'supervisor_shifts.manage'));

-- RPC: set_supervisor_weekly_off
CREATE OR REPLACE FUNCTION public.set_supervisor_weekly_off(
    p_supervisor_id UUID,
    p_day_of_week INTEGER,
    p_coverage_supervisor_id UUID,
    p_start_date DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_current_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    -- Verify permission
    IF NOT public.actor_has_global_permission(v_admin_id, 'supervisor_shifts.manage') THEN
        RAISE EXCEPTION 'Access denied. Requires supervisor_shifts.manage permission.';
    END IF;

    -- Basic checks
    IF p_day_of_week < 0 OR p_day_of_week > 6 THEN
        RAISE EXCEPTION 'Invalid day_of_week. Must be 0-6.';
    END IF;

    IF p_supervisor_id = p_coverage_supervisor_id THEN
        RAISE EXCEPTION 'Supervisor cannot cover themselves.';
    END IF;

    -- Check if coverage supervisor exists
    IF p_coverage_supervisor_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_coverage_supervisor_id) THEN
            RAISE EXCEPTION 'Coverage supervisor does not exist.';
        END IF;
    END IF;

    -- Find and close current active weekly off
    SELECT id INTO v_current_id
    FROM public.supervisor_weekly_off_assignments
    WHERE supervisor_id = p_supervisor_id AND effective_to IS NULL
    FOR UPDATE;

    IF v_current_id IS NOT NULL THEN
        UPDATE public.supervisor_weekly_off_assignments
        SET effective_to = p_start_date - INTERVAL '1 day',
            updated_at = now()
        WHERE id = v_current_id;
    END IF;

    -- Insert new weekly off
    INSERT INTO public.supervisor_weekly_off_assignments (
        supervisor_id,
        day_of_week,
        coverage_supervisor_id,
        effective_from,
        notes,
        created_by
    ) VALUES (
        p_supervisor_id,
        p_day_of_week,
        p_coverage_supervisor_id,
        p_start_date,
        p_notes,
        v_admin_id
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_supervisor_weekly_off TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_supervisor_weekly_off FROM public, anon;

-- RPC: start_supervisor_work_session
CREATE OR REPLACE FUNCTION public.start_supervisor_work_session(
    p_supervisor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_session_id UUID;
    v_work_date DATE;
BEGIN
    v_admin_id := auth.uid();
    
    -- Verify permission
    IF NOT public.actor_has_global_permission(v_admin_id, 'supervisor_shifts.manage') THEN
        RAISE EXCEPTION 'Access denied. Requires supervisor_shifts.manage permission.';
    END IF;

    -- Check for open session
    IF EXISTS (SELECT 1 FROM public.supervisor_work_sessions WHERE supervisor_id = p_supervisor_id AND ended_at IS NULL) THEN
        RAISE EXCEPTION 'Supervisor already has an active work session.';
    END IF;

    -- Calculate work_date based on Riyadh timezone
    v_work_date := (now() AT TIME ZONE 'Asia/Riyadh')::date;

    -- Insert new session
    INSERT INTO public.supervisor_work_sessions (
        supervisor_id,
        work_date,
        started_at,
        started_by
    ) VALUES (
        p_supervisor_id,
        v_work_date,
        now(),
        v_admin_id
    ) RETURNING id INTO v_session_id;

    RETURN v_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_supervisor_work_session TO authenticated;
REVOKE EXECUTE ON FUNCTION public.start_supervisor_work_session FROM public, anon;

-- RPC: end_supervisor_work_session
CREATE OR REPLACE FUNCTION public.end_supervisor_work_session(
    p_supervisor_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_session_id UUID;
BEGIN
    v_admin_id := auth.uid();
    
    -- Verify permission
    IF NOT public.actor_has_global_permission(v_admin_id, 'supervisor_shifts.manage') THEN
        RAISE EXCEPTION 'Access denied. Requires supervisor_shifts.manage permission.';
    END IF;

    -- Find the open session with locking
    SELECT id INTO v_session_id
    FROM public.supervisor_work_sessions
    WHERE supervisor_id = p_supervisor_id AND ended_at IS NULL
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'No active work session found for supervisor.';
    END IF;

    -- Update session
    UPDATE public.supervisor_work_sessions
    SET ended_at = now(),
        ended_by = v_admin_id,
        notes = p_notes,
        updated_at = now()
    WHERE id = v_session_id;

    RETURN v_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.end_supervisor_work_session TO authenticated;
REVOKE EXECUTE ON FUNCTION public.end_supervisor_work_session FROM public, anon;
