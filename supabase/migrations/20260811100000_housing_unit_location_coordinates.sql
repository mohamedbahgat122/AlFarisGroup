-- Add optional geographic coordinates to global housing units.

alter table public.housing_units
  add column if not exists latitude double precision null,
  add column if not exists longitude double precision null;

alter table public.housing_units
  drop constraint if exists housing_units_latitude_range_check,
  add constraint housing_units_latitude_range_check check (
    latitude is null or (latitude >= -90 and latitude <= 90)
  );

alter table public.housing_units
  drop constraint if exists housing_units_longitude_range_check,
  add constraint housing_units_longitude_range_check check (
    longitude is null or (longitude >= -180 and longitude <= 180)
  );

alter table public.housing_units
  drop constraint if exists housing_units_coordinates_pair_check,
  add constraint housing_units_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  );

comment on column public.housing_units.latitude is
  'Optional geographic latitude for the housing unit. Must be paired with longitude.';
comment on column public.housing_units.longitude is
  'Optional geographic longitude for the housing unit. Must be paired with latitude.';
