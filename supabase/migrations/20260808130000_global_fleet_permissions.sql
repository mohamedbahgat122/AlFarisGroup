create table if not exists public.user_global_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  primary key (user_id, permission_key)
);

alter table public.user_global_permissions enable row level security;

create policy "System owners can manage global permissions"
  on public.user_global_permissions
  for all
  to authenticated
  using (public.is_system_owner());

create policy "Users can read own global permissions"
  on public.user_global_permissions
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_global_permission(required_permission text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_global_permissions
    where user_id = auth.uid()
      and permission_key = required_permission
  );
$$;

revoke all on function public.has_global_permission(text) from public, anon;
grant execute on function public.has_global_permission(text) to authenticated;
