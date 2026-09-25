-- Persist maintenance job subtype context for render-time notification localization.

alter table public.app_notifications
  add column if not exists metadata jsonb null;

create or replace function public.insert_app_notification(
  p_recipient_user_id uuid,
  p_organization_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id uuid,
  p_event_key text,
  p_metadata jsonb
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
    recipient_user_id, organization_id, type, title, message,
    entity_type, entity_id, event_key, metadata
  )
  values (
    p_recipient_user_id, p_organization_id, p_type, p_title, p_message,
    p_entity_type, p_entity_id, p_event_key, p_metadata
  )
  on conflict (event_key) do nothing;
end;
$$;

create or replace function public.notify_maintenance_job_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
  v_metadata jsonb := case
    when new.job_type in ('maintenance', 'oil_change')
      then jsonb_build_object('maintenanceJobType', new.job_type)
    else null
  end;
begin
  for v_recipient in
    select mpu.user_id
    from public.maintenance_provider_users mpu
    join public.maintenance_providers mp
      on mp.id = mpu.provider_id
     and mp.is_active = true
    join public.profiles p
      on p.id = mpu.user_id
     and p.status = 'active'::public.account_status
     and p.deleted_at is null
     and p.role::text = 'maintenance_partner'
    where mpu.provider_id = new.provider_id
      and mpu.is_active = true
  loop
    perform public.insert_app_notification(
      v_recipient.user_id, new.organization_id, 'maintenance_job_assigned',
      'Maintenance job assigned',
      'A new maintenance job has been assigned to your workshop.',
      'maintenance_job', new.id,
      'maintenance_job:' || new.id::text || ':assigned:' || v_recipient.user_id::text,
      v_metadata
    );
  end loop;
  return new;
end;
$$;

create or replace function public.notify_maintenance_job_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
  v_type text;
  v_title text;
  v_message text;
  v_metadata jsonb := case
    when new.job_type in ('maintenance', 'oil_change')
      then jsonb_build_object('maintenanceJobType', new.job_type)
    else null
  end;
begin
  if old.status = new.status then
    return new;
  end if;
  if new.status = 'in_progress' then
    v_type := 'maintenance_job_started';
    v_title := 'Maintenance job started';
    v_message := 'A maintenance partner started an assigned job.';
  elsif new.status = 'completed' then
    v_type := 'maintenance_job_completed';
    v_title := 'Maintenance job completed';
    v_message := 'A maintenance partner completed an assigned job.';
  elsif new.status = 'cancelled' then
    v_type := 'maintenance_job_cancelled';
    v_title := 'Maintenance job cancelled';
    v_message := 'A maintenance job was cancelled.';
  else
    return new;
  end if;

  for v_recipient in
    select p.id
    from public.profiles p
    where p.status = 'active'::public.account_status
      and p.deleted_at is null
      and p.role <> 'driver'::public.app_role
      and p.role::text <> 'maintenance_partner'
      and (
        p.role = 'system_owner'::public.app_role
        or (
          public.has_organization_permission(p.id, new.organization_id, 'notifications.view')
          and public.has_organization_permission(p.id, new.organization_id, 'maintenance_jobs.view')
        )
      )
  loop
    perform public.insert_app_notification(
      v_recipient.id, new.organization_id, v_type, v_title, v_message,
      'maintenance_job', new.id,
      'maintenance_job:' || new.id::text || ':' || new.status || ':' || v_recipient.id::text,
      v_metadata
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.insert_app_notification(uuid, uuid, text, text, text, text, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.notify_maintenance_job_assigned()
  from public, anon, authenticated;
revoke all on function public.notify_maintenance_job_status_changed()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
