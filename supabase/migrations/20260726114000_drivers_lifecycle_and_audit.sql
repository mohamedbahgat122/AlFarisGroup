-- Focused Drivers lifecycle and audit update.
-- Adds driver status, soft archival, actor tracking, and service-role-only
-- lifecycle RPCs without hard-deleting driver, bank, document, or storage data.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_status'
  ) then
    create type public.driver_status as enum ('active', 'suspended');
  end if;
end;
$$;

alter table public.drivers
  add column if not exists status public.driver_status not null default 'active'::public.driver_status,
  add column if not exists created_by_user_id uuid null
    references public.profiles(id)
    on delete set null,
  add column if not exists updated_by_user_id uuid null
    references public.profiles(id)
    on delete set null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by_user_id uuid null
    references public.profiles(id)
    on delete set null;

comment on column public.drivers.status is
  'Driver lifecycle status. Archived drivers are identified separately by deleted_at.';
comment on column public.drivers.deleted_at is
  'Application-level archival timestamp. Null means the driver appears in normal lists.';

create index if not exists drivers_organization_status_idx
  on public.drivers (organization_id, status);

create index if not exists drivers_organization_deleted_at_idx
  on public.drivers (organization_id, deleted_at);

create index if not exists drivers_created_by_user_id_idx
  on public.drivers (created_by_user_id);

create index if not exists drivers_updated_by_user_id_idx
  on public.drivers (updated_by_user_id);

create index if not exists activity_logs_driver_entity_created_at_idx
  on public.activity_logs (entity_id, created_at desc)
  where entity_type = 'driver';

-- Deterministic legacy backfill from existing driver activity logs only.
with created as (
  select distinct on (d.id)
    d.id as driver_id,
    al.actor_user_id
  from public.drivers d
  join public.activity_logs al
    on al.entity_type = 'driver'
   and al.entity_id = d.id
   and al.action = 'driver_created'
  join public.profiles p
    on p.id = al.actor_user_id
  where d.created_by_user_id is null
  order by d.id, al.created_at asc
)
update public.drivers d
set created_by_user_id = created.actor_user_id
from created
where d.id = created.driver_id;

with latest as (
  select distinct on (d.id)
    d.id as driver_id,
    al.actor_user_id
  from public.drivers d
  join public.activity_logs al
    on al.entity_type = 'driver'
   and al.entity_id = d.id
   and al.action in (
     'driver_created',
     'driver_updated',
     'driver_suspended',
     'driver_reactivated',
     'driver_archived'
   )
  join public.profiles p
    on p.id = al.actor_user_id
  where d.updated_by_user_id is null
  order by d.id, al.created_at desc
)
update public.drivers d
set updated_by_user_id = latest.actor_user_id
from latest
where d.id = latest.driver_id;

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
    'is_company_sponsored', d.is_company_sponsored,
    'status', d.status,
    'deleted_at', d.deleted_at,
    'iqama_number', d.iqama_number,
    'iqama_expiry_date', d.iqama_expiry_date,
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
    vehicle_authorization_expiry_date, status, created_by_user_id,
    updated_by_user_id, deleted_at, deleted_by_user_id
  )
  values (
    p_driver_id, p_organization_id, v_full_name, v_nationality, v_mobile_number,
    p_vehicle_type, v_vehicle_number, v_vehicle_serial_number,
    v_vehicle_owner_identifier, v_vehicle_brand, v_keeta_username,
    v_keeta_driver_id, p_is_company_sponsored, p_is_vehicle_owner,
    p_settlement_type, v_iqama_number, p_iqama_expiry_date,
    v_driving_license_number, p_driving_license_expiry_date,
    v_driver_card_number, p_driver_card_expiry_date,
    v_vehicle_authorization_number, p_vehicle_authorization_expiry_date,
    'active'::public.driver_status, p_actor_user_id, p_actor_user_id, null, null
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
  if v_existing.deleted_at is not null then raise exception 'Driver update failed: archived driver cannot be updated.'; end if;

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
    updated_by_user_id = p_actor_user_id,
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

create or replace function public.set_driver_status(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid,
  p_status public.driver_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.drivers%rowtype;
  v_before jsonb;
  v_action text;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  if p_status not in ('active'::public.driver_status, 'suspended'::public.driver_status) then
    raise exception 'Driver status update failed: invalid status.';
  end if;

  select * into v_existing
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
  for update;

  if not found then raise exception 'Driver status update failed: driver is unavailable.'; end if;
  if v_existing.deleted_at is not null then raise exception 'Driver status update failed: archived driver cannot be changed.'; end if;

  v_before := public.safe_driver_snapshot(p_driver_id);
  v_action := case
    when p_status = 'suspended'::public.driver_status then 'driver_suspended'
    else 'driver_reactivated'
  end;

  update public.drivers
  set status = p_status,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  where id = p_driver_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data, metadata
  )
  values (
    p_actor_user_id,
    p_organization_id,
    v_action,
    'driver',
    p_driver_id,
    v_before,
    public.safe_driver_snapshot(p_driver_id),
    jsonb_build_object('previous_status', v_existing.status, 'new_status', p_status)
  );
end;
$$;

create or replace function public.archive_driver_record(
  p_actor_user_id uuid,
  p_driver_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.drivers%rowtype;
  v_before jsonb;
begin
  perform public.assert_driver_manager_actor(p_actor_user_id, p_organization_id);

  select * into v_existing
  from public.drivers d
  where d.id = p_driver_id
    and d.organization_id = p_organization_id
  for update;

  if not found then raise exception 'Driver archive failed: driver is unavailable.'; end if;
  if v_existing.deleted_at is not null then raise exception 'Driver archive failed: driver is already archived.'; end if;

  v_before := public.safe_driver_snapshot(p_driver_id);

  update public.drivers
  set deleted_at = now(),
      deleted_by_user_id = p_actor_user_id,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  where id = p_driver_id;

  insert into public.activity_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_actor_user_id,
    p_organization_id,
    'driver_archived',
    'driver',
    p_driver_id,
    v_before,
    public.safe_driver_snapshot(p_driver_id)
  );
end;
$$;

revoke all on function public.set_driver_status(uuid, uuid, uuid, public.driver_status)
  from public, anon, authenticated;
revoke all on function public.archive_driver_record(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.set_driver_status(uuid, uuid, uuid, public.driver_status)
  to service_role;
grant execute on function public.archive_driver_record(uuid, uuid, uuid)
  to service_role;

grant select on table public.profiles to service_role;
