-- Global Fleet: one active physical plate across the system.
-- Archived rows remain historical and are excluded from active uniqueness.

create unique index if not exists fleet_vehicles_active_normalized_plate_global_key
  on public.fleet_vehicles (normalized_plate_number)
  where archived_at is null;

comment on index public.fleet_vehicles_active_normalized_plate_global_key is
  'Ensures one active non-archived Global Fleet vehicle per normalized physical plate across all organizations.';

drop index if exists public.fleet_vehicles_active_normalized_plate_key;
