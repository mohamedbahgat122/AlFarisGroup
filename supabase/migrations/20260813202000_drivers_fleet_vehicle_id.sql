ALTER TABLE public.drivers
ADD COLUMN vehicle_id UUID
REFERENCES public.fleet_vehicles(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_vehicle_id
ON public.drivers(vehicle_id);
