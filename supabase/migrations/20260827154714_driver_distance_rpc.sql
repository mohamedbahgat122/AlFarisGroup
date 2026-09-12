CREATE OR REPLACE FUNCTION public.get_organization_driver_distances(
    p_organization_id uuid
)
RETURNS TABLE (
    driver_id uuid,
    today_distance_km bigint,
    total_distance_km bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today date := public.current_riyadh_date()::date;
BEGIN
    RETURN QUERY
    SELECT 
        d.id as driver_id,
        COALESCE(SUM(
            CASE WHEN (ds.ended_at AT TIME ZONE 'Asia/Riyadh')::date = v_today THEN
                ds.end_odometer_reading - ds.start_odometer_reading
            ELSE 0 END
        ), 0)::bigint as today_distance_km,
        COALESCE(SUM(ds.end_odometer_reading - ds.start_odometer_reading), 0)::bigint as total_distance_km
    FROM public.drivers d
    LEFT JOIN public.driver_shifts ds ON ds.driver_id = d.id
        AND ds.status = 'completed'
        AND ds.start_odometer_reading IS NOT NULL
        AND ds.end_odometer_reading IS NOT NULL
        AND ds.end_odometer_reading >= ds.start_odometer_reading
        AND (ds.start_review_status IS NULL OR ds.start_review_status = 'approved')
        AND (ds.end_review_status IS NULL OR ds.end_review_status = 'approved')
    WHERE d.organization_id = p_organization_id
    GROUP BY d.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_driver_distances(uuid) TO authenticated;



