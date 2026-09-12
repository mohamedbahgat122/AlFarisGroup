-- Add missing vehicle-related legacy fields to fleet_vehicles
ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS serial_number text null,
  ADD COLUMN IF NOT EXISTS brand text null,
  ADD COLUMN IF NOT EXISTS authorization_number text null,
  ADD COLUMN IF NOT EXISTS owner_identifier text null,
  ADD COLUMN IF NOT EXISTS registration_file_path text null,
  ADD COLUMN IF NOT EXISTS registration_file_name text null,
  ADD COLUMN IF NOT EXISTS registration_mime_type text null;
