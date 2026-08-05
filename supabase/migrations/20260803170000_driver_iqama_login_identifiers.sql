-- Private Driver PWA login identifiers.
-- Iqama/residency numbers are used only as a server-side lookup to the
-- existing driver/auth relationship.

create table if not exists public.driver_login_identifiers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  identifier_type text not null default 'iqama',
  identifier_normalized text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint driver_login_identifiers_driver_id_key unique (driver_id),
  constraint driver_login_identifiers_type_key unique (identifier_type, identifier_normalized),
  constraint driver_login_identifiers_type_check check (identifier_type = 'iqama'),
  constraint driver_login_identifiers_iqama_shape_check check (
    identifier_normalized ~ '^[0-9]{10}$'
  )
);

alter table public.driver_login_identifiers enable row level security;

revoke all on public.driver_login_identifiers from public, anon, authenticated;
grant select, insert, update, delete on public.driver_login_identifiers to service_role;

create or replace function public.set_driver_login_identifiers_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_driver_login_identifiers_updated_at
  on public.driver_login_identifiers;

create trigger set_driver_login_identifiers_updated_at
  before update on public.driver_login_identifiers
  for each row
  execute function public.set_driver_login_identifiers_updated_at();

with normalized as (
  select
    d.id as driver_id,
    regexp_replace(d.iqama_number, '[^0-9]', '', 'g') as identifier_normalized
  from public.drivers d
  where d.status = 'active'::public.driver_status
    and d.deleted_at is null
    and d.auth_user_id is not null
    and d.iqama_number ~ '^[0-9[:space:]._-]+$'
),
valid_unique as (
  select n.driver_id, n.identifier_normalized
  from normalized n
  where n.identifier_normalized ~ '^[0-9]{10}$'
    and not exists (
      select 1
      from normalized duplicates
      where duplicates.identifier_normalized = n.identifier_normalized
        and duplicates.driver_id <> n.driver_id
    )
)
insert into public.driver_login_identifiers (
  driver_id,
  identifier_type,
  identifier_normalized
)
select
  driver_id,
  'iqama',
  identifier_normalized
from valid_unique
on conflict (driver_id) do update
set
  identifier_type = excluded.identifier_type,
  identifier_normalized = excluded.identifier_normalized;

notify pgrst, 'reload schema';
