-- Persistent in-app notifications and realtime invalidation for Driver App requests.

alter table public.organization_user_permissions
  drop constraint if exists organization_user_permissions_key_check;

alter table public.organization_user_permissions
  add constraint organization_user_permissions_key_check check (
    permission_key in (
      'organization.dashboard.view',
      'drivers.view',
      'drivers.create',
      'drivers.update',
      'drivers.status',
      'drivers.archive',
      'drivers.documents.view',
      'drivers.documents.download',
      'drivers.activity.view',
      'drivers.account.manage',
      'driver_reports.view',
      'driver_reports.import',
      'driver_reports.replace',
      'driver_reports.details.view',
      'fleet.cars.view',
      'fleet.motorcycles.view',
      'fleet.create',
      'fleet.update',
      'fleet.technical_status',
      'fleet.operational_status',
      'fleet.archive',
      'fleet.operating_card.download',
      'fleet.activity.view',
      'fuel.manage',
      'fuel.reports.view',
      'fuel.increase.review',
      'app_requests.view',
      'app_requests.review',
      'odometer.manage',
      'notifications.view'
    )
  );

insert into public.organization_user_permissions (
  user_id,
  organization_id,
  permission_key,
  granted_by,
  updated_by
)
select
  oup.user_id,
  oup.organization_id,
  'notifications.view',
  oup.user_id,
  oup.user_id
from public.organization_user_permissions oup
where oup.permission_key = 'app_requests.view'
on conflict (user_id, organization_id, permission_key) do nothing;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text null,
  entity_id uuid null,
  event_key text not null,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint app_notifications_type_not_blank check (length(btrim(type)) > 0),
  constraint app_notifications_title_not_blank check (length(btrim(title)) > 0),
  constraint app_notifications_message_not_blank check (length(btrim(message)) > 0),
  constraint app_notifications_event_key_not_blank check (length(btrim(event_key)) > 0),
  constraint app_notifications_read_shape check (
    (is_read = false and read_at is null)
    or (is_read = true and read_at is not null)
  )
);

create unique index if not exists app_notifications_event_key_key
  on public.app_notifications (event_key);

create index if not exists app_notifications_recipient_unread_created_idx
  on public.app_notifications (recipient_user_id, is_read, created_at desc);

create index if not exists app_notifications_organization_created_idx
  on public.app_notifications (organization_id, created_at desc);

create index if not exists app_notifications_entity_idx
  on public.app_notifications (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

alter table public.app_notifications enable row level security;
alter table public.app_notifications replica identity full;

revoke all on public.app_notifications from public, anon, authenticated;
grant select on public.app_notifications to authenticated;
grant update (is_read, read_at) on public.app_notifications to authenticated;
grant select, insert, update, delete on public.app_notifications to service_role;

drop policy if exists app_notifications_select_own on public.app_notifications;
create policy app_notifications_select_own
  on public.app_notifications
  for select
  to authenticated
  using (recipient_user_id = auth.uid());

drop policy if exists app_notifications_update_own_read_state on public.app_notifications;
create policy app_notifications_update_own_read_state
  on public.app_notifications
  for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (
    recipient_user_id = auth.uid()
    and is_read = true
    and read_at is not null
  );

create or replace function public.request_notification_type_label(p_request_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_request_type
    when 'leave' then 'Leave request'
    when 'maintenance' then 'Maintenance request'
    when 'meeting' then 'Interview request'
    when 'oil_change' then 'Oil change request'
    else 'Driver App request'
  end;
$$;

create or replace function public.insert_app_notification(
  p_recipient_user_id uuid,
  p_organization_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_user_id is null then
    return;
  end if;

  insert into public.app_notifications (
    recipient_user_id,
    organization_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    event_key
  )
  values (
    p_recipient_user_id,
    p_organization_id,
    p_type,
    p_title,
    p_message,
    p_entity_type,
    p_entity_id,
    p_event_key
  )
  on conflict (event_key) do nothing;
end;
$$;

create or replace function public.notify_driver_app_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := public.request_notification_type_label(new.request_type);
  v_driver_name text;
  v_recipient record;
begin
  select d.full_name
    into v_driver_name
  from public.drivers d
  where d.id = new.driver_id;

  for v_recipient in
    select p.id
    from public.profiles p
    where p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role <> 'driver'::public.app_role
      and (
        p.role = 'system_owner'::public.app_role
        or (
          public.has_organization_permission(p.id, new.organization_id, 'notifications.view')
          and public.has_organization_permission(p.id, new.organization_id, 'app_requests.view')
        )
      )
  loop
    perform public.insert_app_notification(
      v_recipient.id,
      new.organization_id,
      'driver_app_request_submitted',
      'New ' || lower(v_label),
      coalesce(v_driver_name, 'A driver') || ' submitted a ' || lower(v_label) || '.',
      'driver_app_request',
      new.id,
      'driver_app_request:' || new.id::text || ':submitted:' || v_recipient.id::text
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_driver_app_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := public.request_notification_type_label(new.request_type);
  v_driver_user_id uuid;
begin
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  select d.auth_user_id
    into v_driver_user_id
  from public.drivers d
  where d.id = new.driver_id
    and d.deleted_at is null;

  if v_driver_user_id is null then
    return new;
  end if;

  perform public.insert_app_notification(
    v_driver_user_id,
    new.organization_id,
    'driver_app_request_' || new.status,
    v_label || ' ' || new.status,
    'Your ' || lower(v_label) || ' was ' || new.status || '.',
    'driver_app_request',
    new.id,
    'driver_app_request:' || new.id::text || ':' || new.status || ':' || v_driver_user_id::text
  );

  return new;
end;
$$;

drop trigger if exists notify_driver_app_request_submitted on public.driver_app_requests;
create trigger notify_driver_app_request_submitted
  after insert on public.driver_app_requests
  for each row
  execute function public.notify_driver_app_request_submitted();

drop trigger if exists notify_driver_app_request_reviewed on public.driver_app_requests;
create trigger notify_driver_app_request_reviewed
  after update of status on public.driver_app_requests
  for each row
  execute function public.notify_driver_app_request_reviewed();

revoke all on function public.request_notification_type_label(text) from public, anon;
revoke all on function public.insert_app_notification(uuid, uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.notify_driver_app_request_submitted()
  from public, anon, authenticated;
revoke all on function public.notify_driver_app_request_reviewed()
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_app_requests'
    ) then
      alter publication supabase_realtime add table public.driver_app_requests;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_notifications'
    ) then
      alter publication supabase_realtime add table public.app_notifications;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
