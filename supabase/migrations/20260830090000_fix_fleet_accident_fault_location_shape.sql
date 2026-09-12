alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_technical_shape_check,
  add constraint fleet_vehicles_technical_shape_check
  check (
    (technical_status = 'healthy' and fault_location is null)
    or
    (technical_status in ('fault', 'accident') and fault_location is not null)
  );
