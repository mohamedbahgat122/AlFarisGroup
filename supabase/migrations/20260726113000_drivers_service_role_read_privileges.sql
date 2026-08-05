-- Allow the server-only Admin client to perform read-only driver lookups.
-- Driver mutations remain restricted to the service-role-only RPC functions.
grant select on table public.drivers to service_role;
grant select on table public.driver_bank_details to service_role;
grant select on table public.driver_documents to service_role;
