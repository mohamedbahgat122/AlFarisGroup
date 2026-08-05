alter table public.organization_shift_templates
  add column if not exists driver_note text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_shift_templates_driver_note_length'
      and conrelid = 'public.organization_shift_templates'::regclass
  ) then
    alter table public.organization_shift_templates
      add constraint organization_shift_templates_driver_note_length
      check (driver_note is null or char_length(driver_note) <= 500);
  end if;
end;
$$;

notify pgrst, 'reload schema';
