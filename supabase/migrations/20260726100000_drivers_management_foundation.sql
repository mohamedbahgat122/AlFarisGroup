-- Phase 5A: organization-scoped drivers management foundation.
--
-- This migration creates driver records, private document metadata, RLS, and
-- service-role-only transaction functions. It does not seed driver data.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_vehicle_type'
  ) then
    create type public.driver_vehicle_type as enum ('motorcycle', 'car');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'driver_document_type'
  ) then
    create type public.driver_document_type as enum ('iqama', 'driver_card');
  end if;
end
$$;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  full_name text not null,
  nationality text not null,
  mobile_number text not null,
  vehicle_type public.driver_vehicle_type not null,
  vehicle_number text not null,
  keeta_username text not null,
  is_company_sponsored boolean not null,
  iqama_number text not null,
  iqama_expiry_date date not null,
  driver_card_number text not null,
  driver_card_expiry_date date not null,
  vehicle_authorization_number text not null,
  vehicle_authorization_expiry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,
  constraint drivers_full_name_not_blank check (length(btrim(full_name)) between 1 and 160),
  constraint drivers_nationality_not_blank check (length(btrim(nationality)) between 1 and 80),
  constraint drivers_mobile_number_not_blank check (length(btrim(mobile_number)) between 1 and 40),
  constraint drivers_vehicle_number_not_blank check (length(btrim(vehicle_number)) between 1 and 80),
  constraint drivers_keeta_username_not_blank check (length(btrim(keeta_username)) between 1 and 120),
  constraint drivers_iqama_number_not_blank check (length(btrim(iqama_number)) between 1 and 40),
  constraint drivers_driver_card_number_not_blank check (length(btrim(driver_card_number)) between 1 and 60),
  constraint drivers_vehicle_authorization_number_not_blank check (length(btrim(vehicle_authorization_number)) between 1 and 80),
  constraint drivers_iqama_number_key unique (iqama_number)
);

comment on table public.drivers is
  'Organization-scoped driver business records. Drivers are not Supabase Auth users in Phase 5A.';
comment on column public.drivers.vehicle_number is
  'Generic free-text vehicle number. It is not assumed to be a plate, fleet, or chassis number.';
comment on column public.drivers.keeta_username is
  'Driver username in the Keeta platform only; not an application login or permission source.';

create index if not exists drivers_organization_id_idx
  on public.drivers (organization_id);

create index if not exists drivers_organization_full_name_idx
  on public.drivers (organization_id, full_name);

create table if not exists public.driver_bank_details (
  driver_id uuid primary key,
  iban text not null,
  bank_name text not null,
  account_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_bank_details_driver_id_fkey
    foreign key (driver_id)
    references public.drivers(id)
    on delete cascade,
  constraint driver_bank_details_iban_not_blank check (length(btrim(iban)) between 1 and 34),
  constraint driver_bank_details_bank_name_not_blank check (length(btrim(bank_name)) between 1 and 120),
  constraint driver_bank_details_account_number_not_blank check (length(btrim(account_number)) between 1 and 60),
  constraint driver_bank_details_iban_shape check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$')
);

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null,
  document_type public.driver_document_type not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_documents_driver_id_fkey
    foreign key (driver_id)
    references public.drivers(id)
    on delete cascade,
  constraint driver_documents_driver_type_key unique (driver_id, document_type),
  constraint driver_documents_storage_path_not_blank check (length(btrim(storage_path)) between 1 and 500),
  constraint driver_documents_original_filename_not_blank check (length(btrim(original_filename)) between 1 and 255),
  constraint driver_documents_mime_type_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  constraint driver_documents_size_valid check (size_bytes > 0 and size_bytes <= 10485760)
);

create index if not exists driver_documents_driver_id_idx
  on public.driver_documents (driver_id);

create or replace function public.set_drivers_management_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_drivers_updated_at on public.drivers;
create trigger set_drivers_updated_at
  before update on public.drivers
  for each row
  execute function public.set_drivers_management_updated_at();

drop trigger if exists set_driver_bank_details_updated_at on public.driver_bank_details;
create trigger set_driver_bank_details_updated_at
  before update on public.driver_bank_details
  for each row
  execute function public.set_drivers_management_updated_at();

drop trigger if exists set_driver_documents_updated_at on public.driver_documents;
create trigger set_driver_documents_updated_at
  before update on public.driver_documents
  for each row
  execute function public.set_drivers_management_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

alter table public.drivers enable row level security;
alter table public.driver_bank_details enable row level security;
alter table public.driver_documents enable row level security;

revoke all on public.drivers from anon;
revoke all on public.driver_bank_details from anon;
revoke all on public.driver_documents from anon;

grant select, insert, update on public.drivers to authenticated;
grant select, insert, update on public.driver_bank_details to authenticated;
grant select, insert, update on public.driver_documents to authenticated;

drop policy if exists drivers_select_viewable_organization on public.drivers;
create policy drivers_select_viewable_organization
  on public.drivers
  for select
  to authenticated
  using (public.can_view_organization(organization_id));

drop policy if exists drivers_insert_manage_organization on public.drivers;
create policy drivers_insert_manage_organization
  on public.drivers
  for insert
  to authenticated
  with check (public.can_manage_organization(organization_id));

drop policy if exists drivers_update_manage_organization on public.drivers;
create policy drivers_update_manage_organization
  on public.drivers
  for update
  to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists driver_bank_details_select_viewable_organization on public.driver_bank_details;
create policy driver_bank_details_select_viewable_organization
  on public.driver_bank_details
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_view_organization(d.organization_id)
    )
  );

drop policy if exists driver_bank_details_insert_manage_organization on public.driver_bank_details;
create policy driver_bank_details_insert_manage_organization
  on public.driver_bank_details
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  );

drop policy if exists driver_bank_details_update_manage_organization on public.driver_bank_details;
create policy driver_bank_details_update_manage_organization
  on public.driver_bank_details
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  );

drop policy if exists driver_documents_select_viewable_organization on public.driver_documents;
create policy driver_documents_select_viewable_organization
  on public.driver_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_view_organization(d.organization_id)
    )
  );

drop policy if exists driver_documents_insert_manage_organization on public.driver_documents;
create policy driver_documents_insert_manage_organization
  on public.driver_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  );

drop policy if exists driver_documents_update_manage_organization on public.driver_documents;
create policy driver_documents_update_manage_organization
  on public.driver_documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  )
  with check (
    exists (
      select 1
      from public.drivers d
      where d.id = driver_id
        and public.can_manage_organization(d.organization_id)
    )
  );

create or replace function public.assert_driver_manager_actor(
  p_actor_user_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null or p_organization_id is null then
    raise exception 'Driver operation failed: actor and organization are required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_user_id
      and p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role in (
        'system_owner'::public.app_role,
        'manager'::public.app_role,
        'supervisor'::public.app_role
      )
      and (
        p.role = 'system_owner'::public.app_role
        or p.home_organization_id = p_organization_id
        or exists (
          select 1
          from public.organization_access oa
          where oa.user_id = p_actor_user_id
            and oa.organization_id = p_organization_id
            and oa.access_level = 'manage'::public.organization_access_level
        )
      )
  ) then
    raise exception 'Driver operation failed: actor is not authorized.';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.is_active = true
  ) then
    raise exception 'Driver operation failed: organization is unavailable.';
  end if;
end;
$$;

create or replace function public.normalize_driver_iban(p_iban text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(p_iban, '')), '\s+', '', 'g'));
$$;

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

  if v_document_type not in ('iqama'::public.driver_document_type, 'driver_card'::public.driver_document_type) then
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
  p_is_company_sponsored boolean,
  p_iqama_number text,
  p_iqama_expiry_date date,
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
  v_iqama_number text;
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
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
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
  if p_is_company_sponsored is null then raise exception 'Driver creation failed: invalid sponsorship value.'; end if;
  if v_iqama_number = '' or length(v_iqama_number) > 40 then raise exception 'Driver creation failed: invalid iqama number.'; end if;
  if p_iqama_expiry_date is null then raise exception 'Driver creation failed: invalid iqama expiry date.'; end if;
  if v_driver_card_number = '' or length(v_driver_card_number) > 60 then raise exception 'Driver creation failed: invalid driver card number.'; end if;
  if p_driver_card_expiry_date is null then raise exception 'Driver creation failed: invalid driver card expiry date.'; end if;
  if v_vehicle_authorization_number = '' or length(v_vehicle_authorization_number) > 80 then raise exception 'Driver creation failed: invalid vehicle authorization number.'; end if;
  if p_vehicle_authorization_expiry_date is null then raise exception 'Driver creation failed: invalid vehicle authorization expiry date.'; end if;
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then raise exception 'Driver creation failed: invalid IBAN.'; end if;
  if v_bank_name = '' or length(v_bank_name) > 120 then raise exception 'Driver creation failed: invalid bank name.'; end if;
  if v_account_number = '' or length(v_account_number) > 60 then raise exception 'Driver creation failed: invalid account number.'; end if;
  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) <> 2 then
    raise exception 'Driver creation failed: iqama and driver card documents are required.';
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
    and 'driver_card'::public.driver_document_type = any(v_seen_document_types)
  ) then
    raise exception 'Driver creation failed: required documents are missing.';
  end if;

  insert into public.drivers (
    id, organization_id, full_name, nationality, mobile_number, vehicle_type,
    vehicle_number, keeta_username, is_company_sponsored, iqama_number,
    iqama_expiry_date, driver_card_number, driver_card_expiry_date,
    vehicle_authorization_number, vehicle_authorization_expiry_date
  )
  values (
    p_driver_id, p_organization_id, v_full_name, v_nationality, v_mobile_number,
    p_vehicle_type, v_vehicle_number, v_keeta_username, p_is_company_sponsored,
    v_iqama_number, p_iqama_expiry_date, v_driver_card_number,
    p_driver_card_expiry_date, v_vehicle_authorization_number,
    p_vehicle_authorization_expiry_date
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
  p_is_company_sponsored boolean,
  p_iqama_number text,
  p_iqama_expiry_date date,
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
  v_iqama_number text;
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
  v_iqama_number := btrim(coalesce(p_iqama_number, ''));
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
  if p_is_company_sponsored is null then raise exception 'Driver update failed: invalid sponsorship value.'; end if;
  if v_iqama_number = '' or length(v_iqama_number) > 40 then raise exception 'Driver update failed: invalid iqama number.'; end if;
  if p_iqama_expiry_date is null then raise exception 'Driver update failed: invalid iqama expiry date.'; end if;
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
    is_company_sponsored = p_is_company_sponsored,
    iqama_number = v_iqama_number,
    iqama_expiry_date = p_iqama_expiry_date,
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

revoke all on function public.assert_driver_manager_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function public.normalize_driver_iban(text) from public, anon, authenticated;
revoke all on function public.safe_driver_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.validate_driver_document_item(jsonb) from public, anon, authenticated;
revoke all on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
) to service_role;
grant execute on function public.update_driver_record(
  uuid, uuid, uuid, text, text, text, public.driver_vehicle_type, text, text,
  boolean, text, date, text, date, text, date, text, text, text, jsonb
) to service_role;
