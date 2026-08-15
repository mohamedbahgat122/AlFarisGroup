CREATE TABLE IF NOT EXISTS public.driver_shift_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    current_shift_id UUID NOT NULL REFERENCES public.organization_shift_templates(id),
    requested_shift_id UUID NOT NULL REFERENCES public.organization_shift_templates(id),
    requested_week_start_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    driver_note TEXT,
    review_note TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT current_differs_from_requested CHECK (current_shift_id <> requested_shift_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_shift_change 
ON public.driver_shift_change_requests (driver_id, requested_week_start_date) 
WHERE (status = 'pending');

ALTER TABLE public.driver_shift_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view their own shift change requests" ON public.driver_shift_change_requests;
CREATE POLICY "Drivers can view their own shift change requests"
    ON public.driver_shift_change_requests
    FOR SELECT
    USING (driver_id IN (
        SELECT d.id FROM public.drivers d WHERE d.auth_user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Drivers can create shift change requests" ON public.driver_shift_change_requests;
CREATE POLICY "Drivers can create shift change requests"
    ON public.driver_shift_change_requests
    FOR INSERT
    WITH CHECK (driver_id IN (
        SELECT d.id FROM public.drivers d WHERE d.auth_user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Org users can view their shift change requests" ON public.driver_shift_change_requests;
CREATE POLICY "Org users can view their shift change requests"
    ON public.driver_shift_change_requests
    FOR SELECT
    USING (
        public.has_organization_permission(auth.uid(), organization_id, 'app_requests.view')
        OR public.has_organization_permission(auth.uid(), organization_id, 'app_requests.review')
    );

DROP POLICY IF EXISTS "Org users can update shift change requests" ON public.driver_shift_change_requests;
CREATE POLICY "Org users can update shift change requests"
    ON public.driver_shift_change_requests
    FOR UPDATE
    USING (
        public.has_organization_permission(auth.uid(), organization_id, 'app_requests.review')
    );

-- RPC for approval
CREATE OR REPLACE FUNCTION public.approve_shift_change_request(
    p_request_id UUID,
    p_user_id UUID,
    p_review_note TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_request RECORD;
BEGIN
    -- Get the request
    SELECT * INTO v_request
    FROM public.driver_shift_change_requests
    WHERE id = p_request_id AND status = 'pending'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    IF NOT public.has_organization_permission(p_user_id, v_request.organization_id, 'app_requests.review') THEN
        RETURN json_build_object('success', false, 'error', 'Permission denied. Must have app_requests.review permission.');
    END IF;

    -- Update the request status
    UPDATE public.driver_shift_change_requests
    SET status = 'approved',
        reviewed_by = p_user_id,
        reviewed_at = NOW(),
        review_note = p_review_note,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- End current active assignments by the end of Saturday (the day before the requested Sunday)
    UPDATE public.organization_shift_assignments
    SET assignment_end_date = (v_request.requested_week_start_date - INTERVAL '1 day')::DATE,
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE driver_id = v_request.driver_id
      AND is_active = true
      AND (assignment_end_date IS NULL OR assignment_end_date > (v_request.requested_week_start_date - INTERVAL '1 day')::DATE);

    -- Insert new assignment starting from the requested Sunday
    INSERT INTO public.organization_shift_assignments (
        driver_id,
        organization_id,
        shift_template_id,
        assignment_start_date,
        is_active,
        created_at,
        created_by,
        updated_at
    ) VALUES (
        v_request.driver_id,
        v_request.organization_id,
        v_request.requested_shift_id,
        v_request.requested_week_start_date,
        true,
        NOW(),
        p_user_id,
        NOW()
    );

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
