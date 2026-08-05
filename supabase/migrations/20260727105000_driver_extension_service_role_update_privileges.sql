-- Driver Data extension: allow the server-side service role to persist nullable extension fields.

grant update (
  keeta_vehicle_plate_number,
  profile_photo_path,
  operating_card_number,
  operating_card_expiry_date,
  operating_card_file_path,
  updated_at
) on table public.drivers to service_role;
