-- Current vehicle ownership fields for Global Fleet.
-- This is intentionally additive and independent from operational assignment.

alter table public.fleet_vehicles
  add column if not exists ownership_type text null,
  add column if not exists owner_name text null,
  add column if not exists owner_driver_id uuid null references public.drivers(id) on delete set null,
  add column if not exists owner_contact_phone text null,
  add column if not exists rental_start_date date null,
  add column if not exists rental_end_date date null,
  add column if not exists rental_monthly_cost numeric null,
  add column if not exists ownership_contract_number text null,
  add column if not exists ownership_notes text null;

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_ownership_type_check,
  add constraint fleet_vehicles_ownership_type_check
    check (
      ownership_type is null
      or ownership_type in (
        'company_owned',
        'rental',
        'external_office',
        'individual',
        'driver_owned',
        'other'
      )
    );

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_ownership_dates_check,
  add constraint fleet_vehicles_ownership_dates_check
    check (
      rental_start_date is null
      or rental_end_date is null
      or rental_end_date >= rental_start_date
    );

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_rental_monthly_cost_check,
  add constraint fleet_vehicles_rental_monthly_cost_check
    check (rental_monthly_cost is null or rental_monthly_cost >= 0);

create index if not exists fleet_vehicles_owner_driver_id_idx
  on public.fleet_vehicles(owner_driver_id)
  where owner_driver_id is not null;

update public.fleet_vehicles
set
  ownership_type = coalesce(ownership_type, 'other'),
  owner_name = coalesce(owner_name, manual_owner_name)
where owner_source = 'manual'
  and manual_owner_name is not null
  and btrim(manual_owner_name) <> '';

comment on column public.fleet_vehicles.ownership_type is
  'Current ownership classification. Nullable during migration from legacy owner_source.';
comment on column public.fleet_vehicles.owner_name is
  'Current owner, company, rental company, external office, individual, or other display name.';
comment on column public.fleet_vehicles.owner_driver_id is
  'Driver owner for driver-owned vehicles. Independent from assigned_driver_id.';
comment on column public.fleet_vehicles.owner_contact_phone is
  'Contact phone for the current vehicle owner or rental/external office.';
comment on column public.fleet_vehicles.rental_start_date is
  'Rental ownership start date, when ownership_type is rental.';
comment on column public.fleet_vehicles.rental_end_date is
  'Rental ownership end date, when ownership_type is rental.';
comment on column public.fleet_vehicles.rental_monthly_cost is
  'Monthly rental cost for rental vehicles.';
comment on column public.fleet_vehicles.ownership_contract_number is
  'Contract, reference, or ownership document number.';
comment on column public.fleet_vehicles.ownership_notes is
  'Internal notes about current vehicle ownership.';
