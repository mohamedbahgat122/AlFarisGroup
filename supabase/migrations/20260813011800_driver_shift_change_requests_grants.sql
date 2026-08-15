GRANT SELECT, INSERT, UPDATE
ON public.driver_shift_change_requests
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.driver_shift_change_requests
TO service_role;
