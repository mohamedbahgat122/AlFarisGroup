-- Phase 5B-B: add Keeta Driver ID and Driving License fields to drivers.
-- Existing driver rows are preserved; new columns are nullable for migration
-- compatibility while application/RPC validation requires license completion.

alter table public.drivers
  add column if not exists keeta_driver_id text null,
  add column if not exists driving_license_number text null,
  add column if not exists driving_license_expiry_date date null;

alter table public.drivers
  drop constraint if exists drivers_keeta_driver_id_not_blank,
  add constraint drivers_keeta_driver_id_not_blank
    check (keeta_driver_id is null or length(btrim(keeta_driver_id)) between 1 and 120),
  drop constraint if exists drivers_driving_license_number_not_blank,
  add constraint drivers_driving_license_number_not_blank
    check (driving_license_number is null or length(btrim(driving_license_number)) between 1 and 60);

create unique index if not exists drivers_organization_keeta_driver_id_key
  on public.drivers (organization_id, keeta_driver_id)
  where keeta_driver_id is not null;

comment on column public.drivers.keeta_driver_id is
  'External driver identifier shown by Keeta; not an application user id or authentication identifier.';
comment on column public.drivers.driving_license_number is
  'Driving license number. Nullable for legacy rows; required by application validation for saved records.';
comment on column public.drivers.driving_license_expiry_date is
  'Driving license expiry date stored as a date without timestamp conversion.';

create or replace function public.safe_driver_snapshot(p_driver_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'full_name', d.full_name,
    'nationality', d.nationality,
    'mobile_number', d.mobile_number,
    'vehicle_type', d.vehicle_type,
    'vehicle_number', d.vehicle_number,
    'keeta_username', d.keeta_username,
    'keeta_driver_id', d.keeta_driver_id,
    'is_company_sponsored', d.is_company_sponsored,
    'iqama_number', d.iqama_number,
    'iqama_expiry_date', d.iqama_expiry_date,
    'driving_license_number', d.driving_license_number,
    'driving_license_expiry_date', d.driving_license_expiry_date,
    'driver_card_number', d.driver_card_number,
    'driver_card_expiry_date', d.driver_card_expiry_date,
    'vehicle_authorization_number', d.vehicle_authorization_number,
    'vehicle_authorization_expiry_date', d.vehicle_authorization_expiry_date,
    'documents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'document_type', dd.document_type,
            'original_filename', dd.original_filename,
            'mime_type', dd.mime_type,
            'size_bytes', dd.size_bytes
          )
          order by dd.document_type
        )
        from public.driver_documents dd
        where dd.driver_id = d.id
      ),
      '[]'::jsonb
    )
  )
  from public.drivers d
  where d.id = p_driver_id;
$$;

create or replace function public.validate_driver_document_item(p_document jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_document_type public.driver_document_type;
  v_storage_path text;
  v_original_filename text;
  v_mime_type text;
  v_size_bytes bigint;
begin
  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'Driver document validation failed: document must be an object.';
  end if;

  begin
    v_document_type := (p_document ->> 'document_type')::public.driver_document_type;
    v_size_bytes := (p_document ->> 'size_bytes')::bigint;
  exception
    when invalid_text_representation then
      raise exception 'Driver document validation failed: malformed document metadata.';
  end;

  if v_document_type not in (
    'iqama'::public.driver_document_type,
    'driving_license'::public.driver_document_type,
    'driver_card'::public.driver_document_type
  ) then
    raise exception 'Driver document validation failed: invalid document type.';
  end if;

  v_storage_path := btrim(coalesce(p_document ->> 'storage_path', ''));
  v_original_filename := btrim(coalesce(p_document ->> 'original_filename', ''));
  v_mime_type := btrim(coalesce(p_document ->> 'mime_type', ''));

  if v_storage_path = '' or length(v_storage_path) > 500 then
    raise exception 'Driver document validation failed: invalid storage path.';
  end if;

  if v_original_filename = '' or length(v_original_filename) > 255 then
    raise exception 'Driver document validation failed: invalid original filename.';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Driver document validation failed: invalid mime type.';
  end if;

  if v_size_bytes <= 0 or v_size_bytes > 10485760 then
    raise exception 'Driver document validation failed: invalid file size.';
  end if;
end;
$$;

drop function if exists public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
);

create or replace function public.create_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid,
  p_full_name text,
  p_nationality text,
  p_mobile_number text,
  p_vehicle_type public.driver_vehicle_type,
  p_vehicle_number text,
  p_keeta_username text,
  p_keeta_driver_id text,
  p_is_company_sponsored boolean,
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
  p_documents jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_nationality text;
  v_mobile_number text;
  v_vehicle_number text;
  v_keeta_username text;
  v_keeta_driver_id text;
  v_iqama_number text;
  v_driving_license_number text;
  v_driver_card_number text;
  v_vehicle_authorization_number text;
  v_iban text;
  v_bank_name text;
  v_account_number text;
  v_document jsonb;
  v_seen_document_types public.driver_document_type[] := array[]::public.driver_document_type[];
  v_document_type public.driver_document_type;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  if p_driver_id is null then
    raise exception 'Driver creation failed: driver id is required.';
  end if;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_nationality := btrim(coalesce(p_nationality, ''));
  v_mobile_number := btrim(coalesce(p_mobile_number, ''));
  v_vehicle_number := btrim(coalesce(p_vehicle_number, ''));
  v_keeta_username := btrim(coalesce(p_keeta_username, ''));
  v_keeta_driver_id := nullif(btrim(coalesce(p_keeta_driver_id, '')), '');
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
  v_driving_license_number := btrim(coalesce(p_driving_license_number, ''));
  v_driver_card_number := btrim(coalesce(p_driver_card_number, ''));
  v_vehicle_authorization_number := btrim(coalesce(p_vehicle_authorization_number, ''));
  v_iban := public.normalize_driver_iban(p_iban);
  v_bank_name := btrim(coalesce(p_bank_name, ''));
  v_account_number := btrim(coalesce(p_account_number, ''));

  if v_full_name = '' or length(v_full_name) > 160 then raise exception 'Driver creation failed: invalid full name.'; end if;
  if v_nationality = '' or length(v_nationality) > 80 then raise exception 'Driver creation failed: invalid nationality.'; end if;
  if v_mobile_number = '' or length(v_mobile_number) > 40 then raise exception 'Driver creation failed: invalid mobile number.'; end if;
  if p_vehicle_type not in ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) then raise exception 'Driver creation failed: invalid vehicle type.'; end if;
  if v_vehicle_number = '' or length(v_vehicle_number) > 80 then raise exception 'Driver creation failed: invalid vehicle number.'; end if;
  if v_keeta_username = '' or length(v_keeta_username) > 120 then raise exception 'Driver creation failed: invalid Keeta username.'; end if;
  if v_keeta_driver_id is not null and length(v_keeta_driver_id) > 120 then raise exception 'Driver creation failed: invalid Keeta driver id.'; end if;
  if p_is_company_sponsored is null then raise exception 'Driver creation failed: invalid sponsorship value.'; end if;
  if v_iqama_number = '' or length(v_iqama_number) > 40 then raise exception 'Driver creation failed: invalid iqama number.'; end if;
  if p_iqama_expiry_date is null then raise exception 'Driver creation failed: invalid iqama expiry date.'; end if;
  if v_driving_license_number = '' or length(v_driving_license_number) > 60 then raise exception 'Driver creation failed: invalid driving license number.'; end if;
  if p_driving_license_expiry_date is null then raise exception 'Driver creation failed: invalid driving license expiry date.'; end if;
  if v_driver_card_number = '' or length(v_driver_card_number) > 60 then raise exception 'Driver creation failed: invalid driver card number.'; end if;
  if p_driver_card_expiry_date is null then raise exception 'Driver creation failed: invalid driver card expiry date.'; end if;
  if v_vehicle_authorization_number = '' or length(v_vehicle_authorization_number) > 80 then raise exception 'Driver creation failed: invalid vehicle authorization number.'; end if;
  if p_vehicle_authorization_expiry_date is null then raise exception 'Driver creation failed: invalid vehicle authorization expiry date.'; end if;
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then raise exception 'Driver creation failed: invalid IBAN.'; end if;
  if v_bank_name = '' or length(v_bank_name) > 120 then raise exception 'Driver creation failed: invalid bank name.'; end if;
  if v_account_number = '' or length(v_account_number) > 60 then raise exception 'Driver creation failed: invalid account number.'; end if;
  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) <> 3 then
    raise exception 'Driver creation failed: iqama, driving license, and driver card documents are required.';
  end if;

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    perform public.validate_driver_document_item(v_document);
    v_document_type := (v_document ->> 'document_type')::public.driver_document_type;
    if v_document_type = any(v_seen_document_types) then
      raise exception 'Driver creation failed: duplicate document type.';
    end if;
    v_seen_document_types := array_append(v_seen_document_types, v_document_type);
  end loop;

  if not (
    'iqama'::public.driver_document_type = any(v_seen_document_types)
    and 'driving_license'::public.driver_document_type = any(v_seen_document_types)
    and 'driver_card'::public.driver_document_type = any(v_seen_document_types)
  ) then
    raise exception 'Driver creation failed: required documents are missing.';
  end if;

  insert into public.drivers (
    id, organization_id, full_name, nationality, mobile_number, vehicle_type,
    vehicle_number, keeta_username, keeta_driver_id, is_company_sponsored,
    iqama_number, iqama_expiry_date, driving_license_number,
    driving_license_expiry_date, driver_card_number, driver_card_expiry_date,
    vehicle_authorization_number, vehicle_authorization_expiry_date
  )
  values (
    p_driver_id, p_organization_id, v_full_name, v_nationality, v_mobile_number,
    p_vehicle_type, v_vehicle_number, v_keeta_username, v_keeta_driver_id,
    p_is_company_sponsored, v_iqama_number, p_iqama_expiry_date,
    v_driving_license_number, p_driving_license_expiry_date,
    v_driver_card_number, p_driver_card_expiry_date,
    v_vehicle_authorization_number, p_vehicle_authorization_expiry_date
  );

  insert into public.driver_bank_details (driver_id, iban, bank_name, account_number)
  values (p_driver_id, v_iban, v_bank_name, v_account_number);

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    insert into public.driver_documents (
      driver_id, document_type, storage_path, original_filename, mime_type, size_bytes
    )
    values (
      p_driver_id,
      (v_document ->> 'document_type')::public.driver_document_type,
      btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'),
      btrim(v_document ->> 'mime_type'),
      (v_document ->> 'size_bytes')::bigint
    );
  end loop;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, after_data
  )
  values (
    p_actor_user_id,
    p_organization_id,
    'driver_created',
    'driver',
    p_driver_id,
    public.safe_driver_snapshot(p_driver_id)
  );
end;
$$;

drop function if exists public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
);

create or replace function public.update_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid,
  p_full_name text,
  p_nationality text,
  p_mobile_number text,
  p_vehicle_type public.driver_vehicle_type,
  p_vehicle_number text,
  p_keeta_username text,
  p_keeta_driver_id text,
  p_is_company_sponsored boolean,
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
  p_documents jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.drivers%rowtype;
  v_before jsonb;
  v_full_name text;
  v_nationality text;
  v_mobile_number text;
  v_vehicle_number text;
  v_keeta_username text;
  v_keeta_driver_id text;
  v_iqama_number text;
  v_driving_license_number text;
  v_driver_card_number text;
  v_vehicle_authorization_number text;
  v_iban text;
  v_bank_name text;
  v_account_number text;
  v_document jsonb;
  v_document_type public.driver_document_type;
  v_replaced_documents jsonb := '[]'::jsonb;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  select * into v_existing
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Driver update failed: driver is unavailable.';
  end if;

  v_before := public.safe_driver_snapshot(p_driver_id);

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_nationality := btrim(coalesce(p_nationality, ''));
  v_mobile_number := btrim(coalesce(p_mobile_number, ''));
  v_vehicle_number := btrim(coalesce(p_vehicle_number, ''));
  v_keeta_username := btrim(coalesce(p_keeta_username, ''));
  v_keeta_driver_id := nullif(btrim(coalesce(p_keeta_driver_id, '')), '');
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
  v_driving_license_number := btrim(coalesce(p_driving_license_number, ''));
  v_driver_card_number := btrim(coalesce(p_driver_card_number, ''));
  v_vehicle_authorization_number := btrim(coalesce(p_vehicle_authorization_number, ''));
  v_iban := public.normalize_driver_iban(p_iban);
  v_bank_name := btrim(coalesce(p_bank_name, ''));
  v_account_number := btrim(coalesce(p_account_number, ''));

  if v_full_name = '' or length(v_full_name) > 160 then raise exception 'Driver update failed: invalid full name.'; end if;
  if v_nationality = '' or length(v_nationality) > 80 then raise exception 'Driver update failed: invalid nationality.'; end if;
  if v_mobile_number = '' or length(v_mobile_number) > 40 then raise exception 'Driver update failed: invalid mobile number.'; end if;
  if p_vehicle_type not in ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) then raise exception 'Driver update failed: invalid vehicle type.'; end if;
  if v_vehicle_number = '' or length(v_vehicle_number) > 80 then raise exception 'Driver update failed: invalid vehicle number.'; end if;
  if v_keeta_username = '' or length(v_keeta_username) > 120 then raise exception 'Driver update failed: invalid Keeta username.'; end if;
  if v_keeta_driver_id is not null and length(v_keeta_driver_id) > 120 then raise exception 'Driver update failed: invalid Keeta driver id.'; end if;
  if p_is_company_sponsored is null then raise exception 'Driver update failed: invalid sponsorship value.'; end if;
  if v_iqama_number = '' or length(v_iqama_number) > 40 then raise exception 'Driver update failed: invalid iqama number.'; end if;
  if p_iqama_expiry_date is null then raise exception 'Driver update failed: invalid iqama expiry date.'; end if;
  if v_driving_license_number = '' or length(v_driving_license_number) > 60 then raise exception 'Driver update failed: invalid driving license number.'; end if;
  if p_driving_license_expiry_date is null then raise exception 'Driver update failed: invalid driving license expiry date.'; end if;
  if v_driver_card_number = '' or length(v_driver_card_number) > 60 then raise exception 'Driver update failed: invalid driver card number.'; end if;
  if p_driver_card_expiry_date is null then raise exception 'Driver update failed: invalid driver card expiry date.'; end if;
  if v_vehicle_authorization_number = '' or length(v_vehicle_authorization_number) > 80 then raise exception 'Driver update failed: invalid vehicle authorization number.'; end if;
  if p_vehicle_authorization_expiry_date is null then raise exception 'Driver update failed: invalid vehicle authorization expiry date.'; end if;
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then raise exception 'Driver update failed: invalid IBAN.'; end if;
  if v_bank_name = '' or length(v_bank_name) > 120 then raise exception 'Driver update failed: invalid bank name.'; end if;
  if v_account_number = '' or length(v_account_number) > 60 then raise exception 'Driver update failed: invalid account number.'; end if;
  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' then
    raise exception 'Driver update failed: documents must be an array.';
  end if;

  update public.drivers
  set
    full_name = v_full_name,
    nationality = v_nationality,
    mobile_number = v_mobile_number,
    vehicle_type = p_vehicle_type,
    vehicle_number = v_vehicle_number,
    keeta_username = v_keeta_username,
    keeta_driver_id = v_keeta_driver_id,
    is_company_sponsored = p_is_company_sponsored,
    iqama_number = v_iqama_number,
    iqama_expiry_date = p_iqama_expiry_date,
    driving_license_number = v_driving_license_number,
    driving_license_expiry_date = p_driving_license_expiry_date,
    driver_card_number = v_driver_card_number,
    driver_card_expiry_date = p_driver_card_expiry_date,
    vehicle_authorization_number = v_vehicle_authorization_number,
    vehicle_authorization_expiry_date = p_vehicle_authorization_expiry_date,
    updated_at = now()
  where id = p_driver_id;

  update public.driver_bank_details
  set iban = v_iban,
      bank_name = v_bank_name,
      account_number = v_account_number,
      updated_at = now()
  where driver_id = p_driver_id;

  for v_document in select value from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb))
  loop
    perform public.validate_driver_document_item(v_document);
    v_document_type := (v_document ->> 'document_type')::public.driver_document_type;

    insert into public.driver_documents (
      driver_id, document_type, storage_path, original_filename, mime_type, size_bytes
    )
    values (
      p_driver_id,
      v_document_type,
      btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'),
      btrim(v_document ->> 'mime_type'),
      (v_document ->> 'size_bytes')::bigint
    )
    on conflict (driver_id, document_type) do update
    set storage_path = excluded.storage_path,
        original_filename = excluded.original_filename,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        updated_at = now();

    v_replaced_documents := v_replaced_documents || jsonb_build_array(v_document_type);
  end loop;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_organization_id,
    'driver_updated',
    'driver',
    p_driver_id,
    v_before,
    public.safe_driver_snapshot(p_driver_id) ||
      jsonb_build_object('replaced_documents', v_replaced_documents)
  );
end;
$$;

revoke all on function public.safe_driver_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.validate_driver_document_item(jsonb) from public, anon, authenticated;
revoke all on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
) from public, anon, authenticated;
revoke all on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
) to service_role;
grant execute on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
) to service_role;
