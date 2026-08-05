-- Allow the server-only Supabase Admin client to complete Driver App account
-- creation/linking after application-level authorization has been verified.

grant insert, update on table public.profiles to service_role;

grant update (auth_user_id, updated_by_user_id, updated_at)
  on table public.drivers to service_role;

grant insert on table public.activity_logs to service_role;
