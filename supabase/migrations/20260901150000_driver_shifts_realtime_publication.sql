do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_shifts'
    ) then
      alter publication supabase_realtime add table public.driver_shifts;
    end if;
  end if;
end $$;
