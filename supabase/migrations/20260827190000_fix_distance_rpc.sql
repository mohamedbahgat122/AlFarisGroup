CREATE OR REPLACE FUNCTION public.get_organization_driver_cumulative_distances(p_organization_id uuid)
 RETURNS TABLE(driver_id uuid, total_distance_km bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    RETURN QUERY
      SELECT 
        d.id AS driver_id,
        COALESCE(SUM(ds.end_odometer_reading - ds.start_odometer_reading), 0)::bigint AS total_distance_km
      FROM public.drivers d
      LEFT JOIN public.driver_shifts ds
        ON ds.driver_id = d.id
          AND ds.status = 'completed'
          AND ds.start_odometer_reading IS NOT NULL
          AND ds.end_odometer_reading IS NOT NULL
          AND ds.end_odometer_reading >= ds.start_odometer_reading
          AND ds.start_review_status IS DISTINCT FROM 'rejected'
          AND ds.end_review_status IS DISTINCT FROM 'rejected'
      WHERE d.organization_id = p_organization_id
      GROUP BY d.id;
  END;
$function$;
