-- Organization-scoped Fleet module.

create table if not exists public.fleet_vehicles (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_category text not null,
  vehicle_type text not null,
  plate_number text not null,
  normalized_plate_number text not null,
  owner_source text not null,
  owner_organization_id uuid null references public.organizations(id) on delete restrict,
  manual_owner_name text null,
  operating_card_number text null,
  operating_card_expiry_date date null,
  operating_card_file_path text null,
  operating_card_file_name text null,
  operating_card_mime_type text null,
  assigned_driver_source text not null default 'none',
  assigned_driver_id uuid null references public.drivers(id) on delete set null,
  assigned_driver_manual_name text null,
  assigned_driver_manual_iqama text null,
  authorized_person_source text not null default 'none',
  authorized_driver_id uuid null references public.drivers(id) on delete set null,
  authorized_manual_name text null,
  authorized_manual_iqama text null,
  authorization_expiry_date date null,
  operational_status text not null default 'active',
  technical_status text not null default 'healthy',
  fault_location text null,
  technical_status_note text null,
  technical_status_changed_at timestamptz null,
  technical_status_changed_by uuid null references public.profiles(id) on delete set null,
  notes text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  suspended_at timestamptz null,
  suspended_by uuid null references public.profiles(id) on delete set null,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  constraint fleet_vehicles_vehicle_category_check check (vehicle_category in ('car', 'motorcycle')),
  constraint fleet_vehicles_vehicle_type_not_blank check (length(btrim(vehicle_type)) > 0),
  constraint fleet_vehicles_plate_number_not_blank check (length(btrim(plate_number)) > 0),
  constraint fleet_vehicles_normalized_plate_number_not_blank check (length(btrim(normalized_plate_number)) > 0),
  constraint fleet_vehicles_owner_source_check check (owner_source in ('organization', 'manual')),
  constraint fleet_vehicles_owner_shape_check check (
    (
      owner_source = 'organization'
      and owner_organization_id is not null
      and manual_owner_name is null
    )
    or
    (
      owner_source = 'manual'
      and owner_organization_id is null
      and manual_owner_name is not null
      and length(btrim(manual_owner_name)) > 0
    )
  ),
  constraint fleet_vehicles_assigned_driver_source_check check (assigned_driver_source in ('none', 'organization_driver', 'manual')),
  constraint fleet_vehicles_assigned_driver_shape_check check (
    (
      assigned_driver_source = 'none'
      and assigned_driver_id is null
      and assigned_driver_manual_name is null
      and assigned_driver_manual_iqama is null
    )
    or
    (
      assigned_driver_source = 'organization_driver'
      and assigned_driver_id is not null
      and assigned_driver_manual_name is null
      and assigned_driver_manual_iqama is null
    )
    or
    (
      assigned_driver_source = 'manual'
      and assigned_driver_id is null
      and assigned_driver_manual_name is not null
      and assigned_driver_manual_iqama is not null
      and length(btrim(assigned_driver_manual_name)) > 0
      and length(btrim(assigned_driver_manual_iqama)) > 0
    )
  ),
  constraint fleet_vehicles_authorized_person_source_check check (authorized_person_source in ('none', 'organization_driver', 'manual')),
  constraint fleet_vehicles_authorized_person_shape_check check (
    (
      authorized_person_source = 'none'
      and authorized_driver_id is null
      and authorized_manual_name is null
      and authorized_manual_iqama is null
    )
    or
    (
      authorized_person_source = 'organization_driver'
      and authorized_driver_id is not null
      and authorized_manual_name is null
      and authorized_manual_iqama is null
    )
    or
    (
      authorized_person_source = 'manual'
      and authorized_driver_id is null
      and authorized_manual_name is not null
      and authorized_manual_iqama is not null
      and length(btrim(authorized_manual_name)) > 0
      and length(btrim(authorized_manual_iqama)) > 0
    )
  ),
  constraint fleet_vehicles_operational_status_check check (operational_status in ('active', 'suspended')),
  constraint fleet_vehicles_technical_status_check check (technical_status in ('healthy', 'fault', 'accident')),
  constraint fleet_vehicles_fault_location_check check (fault_location is null or fault_location in ('parked', 'in_maintenance')),
  constraint fleet_vehicles_technical_shape_check check (
    (technical_status = 'fault' and fault_location is not null)
    or
    (technical_status in ('healthy', 'accident') and fault_location is null)
  )
);

create table if not exists public.fleet_vehicle_activity_logs (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  old_values jsonb null,
  new_values jsonb null,
  note text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fleet_vehicle_activity_logs_action_check check (
    action in (
      'vehicle_created',
      'vehicle_updated',
      'vehicle_suspended',
      'vehicle_reactivated',
      'vehicle_archived',
      'vehicle_restored',
      'assigned_driver_changed',
      'authorized_person_changed',
      'technical_status_changed',
      'operating_card_changed'
    )
  )
);

create index if not exists fleet_vehicles_organization_category_idx
  on public.fleet_vehicles (organization_id, vehicle_category, operational_status);

create index if not exists fleet_vehicles_archived_at_idx
  on public.fleet_vehicles (organization_id, archived_at);

create unique index if not exists fleet_vehicles_active_normalized_plate_key
  on public.fleet_vehicles (organization_id, normalized_plate_number)
  where archived_at is null;

create index if not exists fleet_vehicle_activity_logs_vehicle_created_at_idx
  on public.fleet_vehicle_activity_logs (vehicle_id, created_at desc);

alter table public.fleet_vehicles enable row level security;
alter table public.fleet_vehicle_activity_logs enable row level security;

grant select, insert, update on public.fleet_vehicles to authenticated;
grant select, insert on public.fleet_vehicle_activity_logs to authenticated;
grant select, insert, update, delete on public.fleet_vehicles to service_role;
grant select, insert, update, delete on public.fleet_vehicle_activity_logs to service_role;
revoke all on public.fleet_vehicles from anon;
revoke all on public.fleet_vehicle_activity_logs from anon;

drop policy if exists fleet_vehicles_select_viewable_organization on public.fleet_vehicles;
create policy fleet_vehicles_select_viewable_organization
  on public.fleet_vehicles
  for select
  to authenticated
  using (public.can_view_organization(organization_id));

drop policy if exists fleet_vehicles_insert_manage_organization on public.fleet_vehicles;
create policy fleet_vehicles_insert_manage_organization
  on public.fleet_vehicles
  for insert
  to authenticated
  with check (public.can_manage_organization(organization_id));

drop policy if exists fleet_vehicles_update_manage_organization on public.fleet_vehicles;
create policy fleet_vehicles_update_manage_organization
  on public.fleet_vehicles
  for update
  to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop policy if exists fleet_vehicle_activity_logs_select_viewable_organization on public.fleet_vehicle_activity_logs;
create policy fleet_vehicle_activity_logs_select_viewable_organization
  on public.fleet_vehicle_activity_logs
  for select
  to authenticated
  using (public.can_view_organization(organization_id));

drop policy if exists fleet_vehicle_activity_logs_insert_manage_organization on public.fleet_vehicle_activity_logs;
create policy fleet_vehicle_activity_logs_insert_manage_organization
  on public.fleet_vehicle_activity_logs
  for insert
  to authenticated
  with check (public.can_manage_organization(organization_id));
