grant select on public.user_global_permissions to authenticated;
grant select, insert, update, delete on public.user_global_permissions to service_role;
revoke all on public.user_global_permissions from anon;
