-- Allow server-side Global Housing queries to resolve organization metadata.
grant select on table public.organizations to service_role;
