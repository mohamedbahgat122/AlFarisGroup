-- Baseline vehicle condition photos for Global Fleet.
-- These are reference images for a normal/healthy vehicle condition and are
-- intentionally independent from future incident/damage photo records.

alter table public.fleet_vehicles
  add column if not exists front_photo_path text null,
  add column if not exists rear_photo_path text null,
  add column if not exists right_photo_path text null,
  add column if not exists left_photo_path text null;

comment on column public.fleet_vehicles.front_photo_path is
  'Private storage path for the baseline front vehicle condition photo.';
comment on column public.fleet_vehicles.rear_photo_path is
  'Private storage path for the baseline rear vehicle condition photo.';
comment on column public.fleet_vehicles.right_photo_path is
  'Private storage path for the baseline right-side vehicle condition photo.';
comment on column public.fleet_vehicles.left_photo_path is
  'Private storage path for the baseline left-side vehicle condition photo.';
