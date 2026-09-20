-- Publish only the current user's authorization tables for targeted UI freshness.
-- Existing RLS and grants remain the source of access control.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
      alter publication supabase_realtime add table public.profiles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organization_access') then
      alter publication supabase_realtime add table public.organization_access;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organization_user_permissions') then
      alter publication supabase_realtime add table public.organization_user_permissions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_global_permissions') then
      alter publication supabase_realtime add table public.user_global_permissions;
    end if;
  end if;
end;
$$;

-- user_id is not part of organization_user_permissions' primary key.
-- FULL identity keeps filtered UPDATE/DELETE events reliable for revocations.
alter table public.organization_user_permissions replica identity full;

notify pgrst, 'reload schema';
