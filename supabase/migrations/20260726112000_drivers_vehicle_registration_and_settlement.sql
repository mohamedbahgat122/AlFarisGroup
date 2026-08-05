-- Phase 5C: vehicle registration, ownership, and settlement fields.
-- Existing driver rows are preserved; new columns are nullable for migration
-- compatibility while application/RPC validation requires completion on save.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_settlement_type'
  ) then
    create type public.driver_settlement_type as enum ('tiers', 'per_order');
  end if;
end
$$;

alter table public.drivers
  add column if not exists vehicle_serial_number text null,
  add column if not exists vehicle_owner_identifier text null,
  add column if not exists vehicle_brand text null,
  add column if not exists is_vehicle_owner boolean null,
  add column if not exists settlement_type public.driver_settlement_type null;

alter table public.drivers
  drop constraint if exists drivers_vehicle_serial_number_not_blank,
  add constraint drivers_vehicle_serial_number_not_blank
    check (vehicle_serial_number is null or length(btrim(vehicle_serial_number)) > 0),
  drop constraint if exists drivers_vehicle_owner_identifier_not_blank,
  add constraint drivers_vehicle_owner_identifier_not_blank
    check (vehicle_owner_identifier is null or length(btrim(vehicle_owner_identifier)) > 0),
  drop constraint if exists drivers_vehicle_brand_not_blank,
  add constraint drivers_vehicle_brand_not_blank
    check (vehicle_brand is null or length(btrim(vehicle_brand)) > 0);

comment on column public.drivers.vehicle_number is
  'Vehicle plate number. Stored as text to preserve letters, spaces, separators, and leading zeroes.';
comment on column public.drivers.vehicle_serial_number is
  'Vehicle registration serial number stored as text to preserve leading zeroes.';
comment on column public.drivers.vehicle_owner_identifier is
  'Vehicle registration owner identifier stored as text. Omitted from safe activity snapshots.';
comment on column public.drivers.vehicle_brand is
  'Free-text vehicle brand; independent from vehicle_type category.';
comment on column public.drivers.is_vehicle_owner is
  'Whether the driver owns the vehicle. Separate from company sponsorship.';
comment on column public.drivers.settlement_type is
  'Selected settlement system only; no financial calculations are performed.';

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
    'vehicle_serial_number', d.vehicle_serial_number,
    'vehicle_brand', d.vehicle_brand,
    'is_vehicle_owner', d.is_vehicle_owner,
    'settlement_type', d.settlement_type,
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

drop function if exists public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
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
  v_vehicle_serial_number text;
  v_vehicle_owner_identifier text;
  v_vehicle_brand text;
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

  if p_driver_id is null then raise exception 'Driver creation failed: driver id is required.'; end if;

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
  v_iban := public.normalize_driver_iban(p_iban);
  v_bank_name := btrim(coalesce(p_bank_name, ''));
  v_account_number := btrim(coalesce(p_account_number, ''));

  if v_full_name = '' or length(v_full_name) > 160 then raise exception 'Driver creation failed: invalid full name.'; end if;
  if v_nationality = '' or length(v_nationality) > 80 then raise exception 'Driver creation failed: invalid nationality.'; end if;
  if v_mobile_number = '' or length(v_mobile_number) > 40 then raise exception 'Driver creation failed: invalid mobile number.'; end if;
  if p_vehicle_type not in ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) then raise exception 'Driver creation failed: invalid vehicle type.'; end if;
  if v_vehicle_number = '' or length(v_vehicle_number) > 80 then raise exception 'Driver creation failed: invalid vehicle plate number.'; end if;
  if v_vehicle_serial_number = '' or length(v_vehicle_serial_number) > 80 then raise exception 'Driver creation failed: invalid vehicle serial number.'; end if;
  if v_vehicle_owner_identifier = '' or length(v_vehicle_owner_identifier) > 80 then raise exception 'Driver creation failed: invalid vehicle owner identifier.'; end if;
  if v_vehicle_brand = '' or length(v_vehicle_brand) > 120 then raise exception 'Driver creation failed: invalid vehicle brand.'; end if;
  if v_keeta_username = '' or length(v_keeta_username) > 120 then raise exception 'Driver creation failed: invalid Keeta username.'; end if;
  if v_keeta_driver_id is not null and length(v_keeta_driver_id) > 120 then raise exception 'Driver creation failed: invalid Keeta driver id.'; end if;
  if p_is_company_sponsored is null then raise exception 'Driver creation failed: invalid sponsorship value.'; end if;
  if p_is_vehicle_owner is null then raise exception 'Driver creation failed: invalid vehicle ownership value.'; end if;
  if p_settlement_type not in ('tiers'::public.driver_settlement_type, 'per_order'::public.driver_settlement_type) then raise exception 'Driver creation failed: invalid settlement type.'; end if;
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
    if v_document_type = any(v_seen_document_types) then raise exception 'Driver creation failed: duplicate document type.'; end if;
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
    vehicle_number, vehicle_serial_number, vehicle_owner_identifier,
    vehicle_brand, keeta_username, keeta_driver_id, is_company_sponsored,
    is_vehicle_owner, settlement_type, iqama_number, iqama_expiry_date,
    driving_license_number, driving_license_expiry_date, driver_card_number,
    driver_card_expiry_date, vehicle_authorization_number,
    vehicle_authorization_expiry_date
  )
  values (
    p_driver_id, p_organization_id, v_full_name, v_nationality, v_mobile_number,
    p_vehicle_type, v_vehicle_number, v_vehicle_serial_number,
    v_vehicle_owner_identifier, v_vehicle_brand, v_keeta_username,
    v_keeta_driver_id, p_is_company_sponsored, p_is_vehicle_owner,
    p_settlement_type, v_iqama_number, p_iqama_expiry_date,
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
    p_actor_user_id, p_organization_id, 'driver_created', 'driver',
    p_driver_id, public.safe_driver_snapshot(p_driver_id)
  );
end;
$$;

drop function if exists public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, boolean, text, date, text, date, text, date, text, date, text, text,
  text, jsonb
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

  if not found then raise exception 'Driver update failed: driver is unavailable.'; end if;

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
  v_iban := public.normalize_driver_iban(p_iban);
  v_bank_name := btrim(coalesce(p_bank_name, ''));
  v_account_number := btrim(coalesce(p_account_number, ''));
  v_owner_identifier_changed := v_existing.vehicle_owner_identifier is distinct from v_vehicle_owner_identifier;

  if v_full_name = '' or length(v_full_name) > 160 then raise exception 'Driver update failed: invalid full name.'; end if;
  if v_nationality = '' or length(v_nationality) > 80 then raise exception 'Driver update failed: invalid nationality.'; end if;
  if v_mobile_number = '' or length(v_mobile_number) > 40 then raise exception 'Driver update failed: invalid mobile number.'; end if;
  if p_vehicle_type not in ('motorcycle'::public.driver_vehicle_type, 'car'::public.driver_vehicle_type) then raise exception 'Driver update failed: invalid vehicle type.'; end if;
  if v_vehicle_number = '' or length(v_vehicle_number) > 80 then raise exception 'Driver update failed: invalid vehicle plate number.'; end if;
  if v_vehicle_serial_number = '' or length(v_vehicle_serial_number) > 80 then raise exception 'Driver update failed: invalid vehicle serial number.'; end if;
  if v_vehicle_owner_identifier = '' or length(v_vehicle_owner_identifier) > 80 then raise exception 'Driver update failed: invalid vehicle owner identifier.'; end if;
  if v_vehicle_brand = '' or length(v_vehicle_brand) > 120 then raise exception 'Driver update failed: invalid vehicle brand.'; end if;
  if v_keeta_username = '' or length(v_keeta_username) > 120 then raise exception 'Driver update failed: invalid Keeta username.'; end if;
  if v_keeta_driver_id is not null and length(v_keeta_driver_id) > 120 then raise exception 'Driver update failed: invalid Keeta driver id.'; end if;
  if p_is_company_sponsored is null then raise exception 'Driver update failed: invalid sponsorship value.'; end if;
  if p_is_vehicle_owner is null then raise exception 'Driver update failed: invalid vehicle ownership value.'; end if;
  if p_settlement_type not in ('tiers'::public.driver_settlement_type, 'per_order'::public.driver_settlement_type) then raise exception 'Driver update failed: invalid settlement type.'; end if;
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
  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' then raise exception 'Driver update failed: documents must be an array.'; end if;

  update public.drivers
  set
    full_name = v_full_name,
    nationality = v_nationality,
    mobile_number = v_mobile_number,
    vehicle_type = p_vehicle_type,
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
      p_driver_id, v_document_type, btrim(v_document ->> 'storage_path'),
      btrim(v_document ->> 'original_filename'), btrim(v_document ->> 'mime_type'),
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
      jsonb_build_object(
        'replaced_documents', v_replaced_documents,
        'vehicle_owner_identifier_changed', v_owner_identifier_changed
      )
  );
end;
$$;

revoke all on function public.safe_driver_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb
) to service_role;
grant execute on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  text, text, text, text, boolean, boolean, public.driver_settlement_type,
  text, date, text, date, text, date, text, date, text, text, text, jsonb
) to service_role;
