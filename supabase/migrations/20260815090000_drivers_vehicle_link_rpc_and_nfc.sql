ALTER TABLE public.drivers
DROP CONSTRAINT IF EXISTS drivers_vehicle_number_not_blank;

ALTER TABLE public.drivers
DROP CONSTRAINT IF EXISTS drivers_vehicle_number_length;

ALTER TABLE public.drivers
ADD CONSTRAINT drivers_vehicle_number_length
CHECK (length(btrim(vehicle_number)) <= 80);

ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS nfc_number TEXT NULL;

ALTER TABLE public.drivers
DROP CONSTRAINT IF EXISTS drivers_nfc_number_length;

ALTER TABLE public.drivers
ADD CONSTRAINT drivers_nfc_number_length
CHECK (nfc_number IS NULL OR length(btrim(nfc_number)) BETWEEN 1 AND 80);

DROP FUNCTION IF EXISTS public.create_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb
);

DROP FUNCTION IF EXISTS public.update_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb
);

CREATE OR REPLACE FUNCTION public.create_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid,
  p_full_name text,
  p_nationality text,
  p_mobile_number text,
  p_vehicle_type public.driver_vehicle_type,
  p_vehicle_number text,
  p_vehicle_serial_number text,
  p_vehicle_owner_identifier text,
  p_vehicle_brand text,
  p_keeta_username text,
  p_keeta_driver_id text,
  p_is_company_sponsored boolean,
  p_is_vehicle_owner boolean,
  p_settlement_type public.driver_settlement_type,
  p_iqama_number text,
  p_iqama_expiry_date date,
  p_driving_license_number text,
  p_driving_license_expiry_date date,
  p_driver_card_number text,
  p_driver_card_expiry_date date,
  p_vehicle_authorization_number text,
  p_vehicle_authorization_expiry_date date,
  p_iban text,
  p_bank_name text,
  p_account_number text,
  p_documents jsonb,
  p_vehicle_id uuid DEFAULT NULL,
  p_nfc_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_nationality text;
  v_mobile_number text;
  v_vehicle_number text;
  v_vehicle_serial_number text;
  v_vehicle_owner_identifier text;
  v_vehicle_brand text;
  v_keeta_username text;
  v_keeta_driver_id text;
  v_iqama_number text;
  v_driving_license_number text;
  v_driver_card_number text;
  v_vehicle_authorization_number text;
  v_nfc_number text;
  v_iban text;
  v_bank_name text;
  v_account_number text;
  v_document jsonb;
  v_seen_document_types public.driver_document_type[] := array[]::public.driver_document_type[];
  v_document_type public.driver_document_type;
BEGIN
  PERFORM public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  IF p_driver_id IS NULL THEN RAISE EXCEPTION 'Driver creation failed: driver id is required.'; END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_nationality := btrim(coalesce(p_nationality, ''));
  v_mobile_number := btrim(coalesce(p_mobile_number, ''));
  v_vehicle_number := btrim(coalesce(p_vehicle_number, ''));
  v_vehicle_serial_number := btrim(coalesce(p_vehicle_serial_number, ''));
  v_vehicle_owner_identifier := btrim(coalesce(p_vehicle_owner_identifier, ''));
  v_vehicle_brand := btrim(coalesce(p_vehicle_brand, ''));
  v_keeta_username := btrim(coalesce(p_keeta_username, ''));
  v_keeta_driver_id := nullif(btrim(coalesce(p_keeta_driver_id, '')), '');
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
  v_driving_license_number := btrim(coalesce(p_driving_license_number, ''));
  v_driver_card_number := btrim(coalesce(p_driver_card_number, ''));
  v_vehicle_authorization_number := btrim(coalesce(p_vehicle_authorization_number, ''));
  v_nfc_number := nullif(btrim(coalesce(p_nfc_number, '')), '');
  v_iban := nullif(public.normalize_driver_iban(p_iban), '');
  v_bank_name := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_account_number := nullif(btrim(coalesce(p_account_number, '')), '');

  IF p_vehicle_id IS NOT NULL THEN
    SELECT fv.plate_number
      INTO v_vehicle_number
    FROM public.fleet_vehicles fv
    WHERE fv.id = p_vehicle_id
      AND fv.assigned_organization_id = p_organization_id
      AND fv.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Driver creation failed: invalid fleet vehicle.';
    END IF;
  END IF;

  IF v_full_name = '' OR length(v_full_name) > 160 THEN RAISE EXCEPTION 'Driver creation failed: invalid full name.'; END IF;
  IF v_nationality = '' OR length(v_nationality) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid nationality.'; END IF;
  IF v_mobile_number = '' OR length(v_mobile_number) > 40 THEN RAISE EXCEPTION 'Driver creation failed: invalid mobile number.'; END IF;
  IF p_vehicle_type NOT IN ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle type.'; END IF;
  IF length(v_vehicle_number) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle plate number.'; END IF;
  IF v_vehicle_serial_number = '' OR length(v_vehicle_serial_number) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle serial number.'; END IF;
  IF v_vehicle_owner_identifier = '' OR length(v_vehicle_owner_identifier) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle owner identifier.'; END IF;
  IF v_vehicle_brand = '' OR length(v_vehicle_brand) > 120 THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle brand.'; END IF;
  IF v_keeta_username = '' OR length(v_keeta_username) > 120 THEN RAISE EXCEPTION 'Driver creation failed: invalid Keeta username.'; END IF;
  IF v_keeta_driver_id IS NOT NULL AND length(v_keeta_driver_id) > 120 THEN RAISE EXCEPTION 'Driver creation failed: invalid Keeta driver id.'; END IF;
  IF p_is_company_sponsored IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid sponsorship value.'; END IF;
  IF p_is_vehicle_owner IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle ownership value.'; END IF;
  IF p_settlement_type NOT IN ('tiers'::public.driver_settlement_type, 'per_order'::public.driver_settlement_type) THEN RAISE EXCEPTION 'Driver creation failed: invalid settlement type.'; END IF;
  IF v_iqama_number = '' OR length(v_iqama_number) > 40 THEN RAISE EXCEPTION 'Driver creation failed: invalid iqama number.'; END IF;
  IF p_iqama_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid iqama expiry date.'; END IF;
  IF v_driving_license_number = '' OR length(v_driving_license_number) > 60 THEN RAISE EXCEPTION 'Driver creation failed: invalid driving license number.'; END IF;
  IF p_driving_license_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid driving license expiry date.'; END IF;
  IF v_driver_card_number = '' OR length(v_driver_card_number) > 60 THEN RAISE EXCEPTION 'Driver creation failed: invalid driver card number.'; END IF;
  IF p_driver_card_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid driver card expiry date.'; END IF;
  IF v_vehicle_authorization_number = '' OR length(v_vehicle_authorization_number) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle authorization number.'; END IF;
  IF p_vehicle_authorization_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver creation failed: invalid vehicle authorization expiry date.'; END IF;
  IF v_nfc_number IS NOT NULL AND length(v_nfc_number) > 80 THEN RAISE EXCEPTION 'Driver creation failed: invalid NFC number.'; END IF;
  IF v_iban IS NOT NULL AND v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN RAISE EXCEPTION 'Driver creation failed: invalid IBAN.'; END IF;
  IF v_bank_name IS NOT NULL AND length(v_bank_name) > 120 THEN RAISE EXCEPTION 'Driver creation failed: invalid bank name.'; END IF;
  IF v_account_number IS NOT NULL AND length(v_account_number) > 60 THEN RAISE EXCEPTION 'Driver creation failed: invalid account number.'; END IF;
  IF jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) <> 3 THEN
    RAISE EXCEPTION 'Driver creation failed: iqama, driving license, and driver card documents are required.';
  END IF;

  FOR v_document IN SELECT value FROM jsonb_array_elements(p_documents)
  LOOP
    PERFORM public.validate_driver_document_item(v_document);
    v_document_type := (v_document ->> 'document_type')::public.driver_document_type;
    IF v_document_type = ANY(v_seen_document_types) THEN RAISE EXCEPTION 'Driver creation failed: duplicate document type.'; END IF;
    v_seen_document_types := array_append(v_seen_document_types, v_document_type);
  END LOOP;

  IF NOT (
    'iqama'::public.driver_document_type = ANY(v_seen_document_types)
    AND 'driving_license'::public.driver_document_type = ANY(v_seen_document_types)
    AND 'driver_card'::public.driver_document_type = ANY(v_seen_document_types)
  ) THEN
    RAISE EXCEPTION 'Driver creation failed: required documents are missing.';
  END IF;

  INSERT INTO public.drivers (
    id, organization_id, full_name, nationality, mobile_number, vehicle_type,
    vehicle_id, vehicle_number, vehicle_serial_number, vehicle_owner_identifier,
    vehicle_brand, keeta_username, keeta_driver_id, is_company_sponsored,
    is_vehicle_owner, settlement_type, iqama_number, iqama_expiry_date,
    driving_license_number, driving_license_expiry_date, driver_card_number,
    driver_card_expiry_date, vehicle_authorization_number,
    vehicle_authorization_expiry_date, nfc_number, status, created_by_user_id,
    updated_by_user_id, deleted_at, deleted_by_user_id
  )
  VALUES (
    p_driver_id, p_organization_id, v_full_name, v_nationality, v_mobile_number,
    p_vehicle_type, p_vehicle_id, v_vehicle_number, v_vehicle_serial_number,
    v_vehicle_owner_identifier, v_vehicle_brand, v_keeta_username,
    v_keeta_driver_id, p_is_company_sponsored, p_is_vehicle_owner,
    p_settlement_type, v_iqama_number, p_iqama_expiry_date,
    v_driving_license_number, p_driving_license_expiry_date,
    v_driver_card_number, p_driver_card_expiry_date,
    v_vehicle_authorization_number, p_vehicle_authorization_expiry_date,
    v_nfc_number, 'active'::public.driver_status, p_actor_user_id,
    p_actor_user_id, NULL, NULL
  );

  INSERT INTO public.driver_bank_details (driver_id, iban, bank_name, account_number)
  VALUES (p_driver_id, v_iban, v_bank_name, v_account_number);

  FOR v_document IN SELECT value FROM jsonb_array_elements(p_documents)
  LOOP
    INSERT INTO public.driver_documents (
      driver_id, document_type, storage_path, original_filename, mime_type, size_bytes
    )
    VALUES (
      p_driver_id,
      (v_document ->> 'document_type')::public.driver_document_type,
      btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'),
      btrim(v_document ->> 'mime_type'),
      (v_document ->> 'size_bytes')::bigint
    );
  END LOOP;

  INSERT INTO public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data
  )
  VALUES (
    p_actor_user_id, p_organization_id, 'driver_created', 'driver',
    p_driver_id, public.safe_driver_snapshot(p_driver_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb,
  uuid,
  text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid,
  p_full_name text,
  p_nationality text,
  p_mobile_number text,
  p_vehicle_type public.driver_vehicle_type,
  p_vehicle_number text,
  p_vehicle_serial_number text,
  p_vehicle_owner_identifier text,
  p_vehicle_brand text,
  p_keeta_username text,
  p_keeta_driver_id text,
  p_is_company_sponsored boolean,
  p_is_vehicle_owner boolean,
  p_settlement_type public.driver_settlement_type,
  p_iqama_number text,
  p_iqama_expiry_date date,
  p_driving_license_number text,
  p_driving_license_expiry_date date,
  p_driver_card_number text,
  p_driver_card_expiry_date date,
  p_vehicle_authorization_number text,
  p_vehicle_authorization_expiry_date date,
  p_iban text,
  p_bank_name text,
  p_account_number text,
  p_documents jsonb DEFAULT '[]'::jsonb,
  p_vehicle_id uuid DEFAULT NULL,
  p_nfc_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.drivers%rowtype;
  v_before jsonb;
  v_owner_identifier_changed boolean;
  v_full_name text;
  v_nationality text;
  v_mobile_number text;
  v_vehicle_number text;
  v_vehicle_serial_number text;
  v_vehicle_owner_identifier text;
  v_vehicle_brand text;
  v_keeta_username text;
  v_keeta_driver_id text;
  v_iqama_number text;
  v_driving_license_number text;
  v_driver_card_number text;
  v_vehicle_authorization_number text;
  v_nfc_number text;
  v_iban text;
  v_bank_name text;
  v_account_number text;
  v_document jsonb;
  v_document_type public.driver_document_type;
  v_replaced_documents jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  SELECT * INTO v_existing
  FROM public.drivers d
  WHERE d.id = p_driver_id
    AND d.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Driver update failed: driver is unavailable.'; END IF;
  IF v_existing.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Driver update failed: archived driver cannot be updated.'; END IF;

  v_before := public.safe_driver_snapshot(p_driver_id);

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_nationality := btrim(coalesce(p_nationality, ''));
  v_mobile_number := btrim(coalesce(p_mobile_number, ''));
  v_vehicle_number := btrim(coalesce(p_vehicle_number, ''));
  v_vehicle_serial_number := btrim(coalesce(p_vehicle_serial_number, ''));
  v_vehicle_owner_identifier := btrim(coalesce(p_vehicle_owner_identifier, ''));
  v_vehicle_brand := btrim(coalesce(p_vehicle_brand, ''));
  v_keeta_username := btrim(coalesce(p_keeta_username, ''));
  v_keeta_driver_id := nullif(btrim(coalesce(p_keeta_driver_id, '')), '');
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
  v_driving_license_number := btrim(coalesce(p_driving_license_number, ''));
  v_driver_card_number := btrim(coalesce(p_driver_card_number, ''));
  v_vehicle_authorization_number := btrim(coalesce(p_vehicle_authorization_number, ''));
  v_nfc_number := nullif(btrim(coalesce(p_nfc_number, '')), '');
  v_iban := nullif(public.normalize_driver_iban(p_iban), '');
  v_bank_name := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_account_number := nullif(btrim(coalesce(p_account_number, '')), '');
  v_owner_identifier_changed := v_existing.vehicle_owner_identifier IS DISTINCT FROM v_vehicle_owner_identifier;

  IF p_vehicle_id IS NOT NULL THEN
    SELECT fv.plate_number
      INTO v_vehicle_number
    FROM public.fleet_vehicles fv
    WHERE fv.id = p_vehicle_id
      AND fv.assigned_organization_id = p_organization_id
      AND fv.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Driver update failed: invalid fleet vehicle.';
    END IF;
  END IF;

  IF v_full_name = '' OR length(v_full_name) > 160 THEN RAISE EXCEPTION 'Driver update failed: invalid full name.'; END IF;
  IF v_nationality = '' OR length(v_nationality) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid nationality.'; END IF;
  IF v_mobile_number = '' OR length(v_mobile_number) > 40 THEN RAISE EXCEPTION 'Driver update failed: invalid mobile number.'; END IF;
  IF p_vehicle_type NOT IN ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle type.'; END IF;
  IF length(v_vehicle_number) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle plate number.'; END IF;
  IF v_vehicle_serial_number = '' OR length(v_vehicle_serial_number) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle serial number.'; END IF;
  IF v_vehicle_owner_identifier = '' OR length(v_vehicle_owner_identifier) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle owner identifier.'; END IF;
  IF v_vehicle_brand = '' OR length(v_vehicle_brand) > 120 THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle brand.'; END IF;
  IF v_keeta_username = '' OR length(v_keeta_username) > 120 THEN RAISE EXCEPTION 'Driver update failed: invalid Keeta username.'; END IF;
  IF v_keeta_driver_id IS NOT NULL AND length(v_keeta_driver_id) > 120 THEN RAISE EXCEPTION 'Driver update failed: invalid Keeta driver id.'; END IF;
  IF p_is_company_sponsored IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid sponsorship value.'; END IF;
  IF p_is_vehicle_owner IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle ownership value.'; END IF;
  IF p_settlement_type NOT IN ('tiers'::public.driver_settlement_type, 'per_order'::public.driver_settlement_type) THEN RAISE EXCEPTION 'Driver update failed: invalid settlement type.'; END IF;
  IF v_iqama_number = '' OR length(v_iqama_number) > 40 THEN RAISE EXCEPTION 'Driver update failed: invalid iqama number.'; END IF;
  IF p_iqama_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid iqama expiry date.'; END IF;
  IF v_driving_license_number = '' OR length(v_driving_license_number) > 60 THEN RAISE EXCEPTION 'Driver update failed: invalid driving license number.'; END IF;
  IF p_driving_license_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid driving license expiry date.'; END IF;
  IF v_driver_card_number = '' OR length(v_driver_card_number) > 60 THEN RAISE EXCEPTION 'Driver update failed: invalid driver card number.'; END IF;
  IF p_driver_card_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid driver card expiry date.'; END IF;
  IF v_vehicle_authorization_number = '' OR length(v_vehicle_authorization_number) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle authorization number.'; END IF;
  IF p_vehicle_authorization_expiry_date IS NULL THEN RAISE EXCEPTION 'Driver update failed: invalid vehicle authorization expiry date.'; END IF;
  IF v_nfc_number IS NOT NULL AND length(v_nfc_number) > 80 THEN RAISE EXCEPTION 'Driver update failed: invalid NFC number.'; END IF;
  IF v_iban IS NOT NULL AND v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN RAISE EXCEPTION 'Driver update failed: invalid IBAN.'; END IF;
  IF v_bank_name IS NOT NULL AND length(v_bank_name) > 120 THEN RAISE EXCEPTION 'Driver update failed: invalid bank name.'; END IF;
  IF v_account_number IS NOT NULL AND length(v_account_number) > 60 THEN RAISE EXCEPTION 'Driver update failed: invalid account number.'; END IF;
  IF jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Driver update failed: documents must be an array.'; END IF;

  UPDATE public.drivers
  SET
    full_name = v_full_name,
    nationality = v_nationality,
    mobile_number = v_mobile_number,
    vehicle_type = p_vehicle_type,
    vehicle_id = p_vehicle_id,
    vehicle_number = v_vehicle_number,
    vehicle_serial_number = v_vehicle_serial_number,
    vehicle_owner_identifier = v_vehicle_owner_identifier,
    vehicle_brand = v_vehicle_brand,
    keeta_username = v_keeta_username,
    keeta_driver_id = v_keeta_driver_id,
    is_company_sponsored = p_is_company_sponsored,
    is_vehicle_owner = p_is_vehicle_owner,
    settlement_type = p_settlement_type,
    iqama_number = v_iqama_number,
    iqama_expiry_date = p_iqama_expiry_date,
    driving_license_number = v_driving_license_number,
    driving_license_expiry_date = p_driving_license_expiry_date,
    driver_card_number = v_driver_card_number,
    driver_card_expiry_date = p_driver_card_expiry_date,
    vehicle_authorization_number = v_vehicle_authorization_number,
    vehicle_authorization_expiry_date = p_vehicle_authorization_expiry_date,
    nfc_number = v_nfc_number,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  WHERE id = p_driver_id;

  INSERT INTO public.driver_bank_details (driver_id, iban, bank_name, account_number)
  VALUES (p_driver_id, v_iban, v_bank_name, v_account_number)
  ON CONFLICT (driver_id) DO UPDATE
  SET iban = excluded.iban,
      bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      updated_at = now();

  FOR v_document IN SELECT value FROM jsonb_array_elements(coalesce(p_documents, '[]'::jsonb))
  LOOP
    PERFORM public.validate_driver_document_item(v_document);
    v_document_type := (v_document ->> 'document_type')::public.driver_document_type;

    INSERT INTO public.driver_documents (
      driver_id, document_type, storage_path, original_filename, mime_type, size_bytes
    )
    VALUES (
      p_driver_id, v_document_type, btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'), btrim(v_document ->> 'mime_type'),
      (v_document ->> 'size_bytes')::bigint
    )
    ON CONFLICT (driver_id, document_type) DO UPDATE
    SET storage_path = excluded.storage_path,
        original_filename = excluded.original_filename,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        updated_at = now();

    v_replaced_documents := v_replaced_documents || jsonb_build_array(v_document_type);
  END LOOP;

  INSERT INTO public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data
  )
  VALUES (
    p_actor_user_id,
    p_organization_id,
    'driver_updated',
    'driver',
    p_driver_id,
    v_before,
    public.safe_driver_snapshot(p_driver_id) ||
      jsonb_build_object(
        'replaced_documents', v_replaced_documents,
        'vehicle_owner_identifier_changed', v_owner_identifier_changed
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_driver_record(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  public.driver_vehicle_type,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  public.driver_settlement_type,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  date,
  text,
  text,
  text,
  jsonb,
  uuid,
  text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
