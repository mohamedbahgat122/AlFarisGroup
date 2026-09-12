ALTER TABLE public.drivers
  ALTER COLUMN vehicle_authorization_number DROP NOT NULL;

ALTER TABLE public.drivers
  ALTER COLUMN vehicle_authorization_expiry_date DROP NOT NULL;
