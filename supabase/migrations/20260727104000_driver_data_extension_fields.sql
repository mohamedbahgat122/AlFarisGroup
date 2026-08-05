-- Driver Data extension: nullable profile, Keeta plate, and operating card fields.

alter table public.drivers
  add column if not exists keeta_vehicle_plate_number text null,
  add column if not exists profile_photo_path text null,
  add column if not exists operating_card_number text null,
  add column if not exists operating_card_expiry_date date null,
  add column if not exists operating_card_file_path text null;

alter table public.drivers
  drop constraint if exists drivers_keeta_vehicle_plate_number_length,
  add constraint drivers_keeta_vehicle_plate_number_length check (
    keeta_vehicle_plate_number is null
    or length(btrim(keeta_vehicle_plate_number)) between 1 and 80
  ),
  drop constraint if exists drivers_profile_photo_path_length,
  add constraint drivers_profile_photo_path_length check (
    profile_photo_path is null
    or length(btrim(profile_photo_path)) between 1 and 500
  ),
  drop constraint if exists drivers_operating_card_number_length,
  add constraint drivers_operating_card_number_length check (
    operating_card_number is null
    or length(btrim(operating_card_number)) between 1 and 80
  ),
  drop constraint if exists drivers_operating_card_file_path_length,
  add constraint drivers_operating_card_file_path_length check (
    operating_card_file_path is null
    or length(btrim(operating_card_file_path)) between 1 and 500
  );
