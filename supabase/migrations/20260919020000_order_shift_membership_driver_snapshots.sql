begin;

create or replace function public.replace_order_period_week_members(
  p_organization_id uuid, p_order_period_template_id uuid, p_week_start date, p_week_end date, p_driver_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid:=auth.uid(); v_today date:=(now() at time zone 'Asia/Riyadh')::date;
  v_current_start date:=v_today-extract(dow from v_today)::integer; v_current_end date:=v_current_start+6;
  v_selected uuid[]:=coalesce((select array_agg(distinct driver_id order by driver_id) from unnest(coalesce(p_driver_ids,'{}'::uuid[])) x(driver_id) where driver_id is not null),'{}'::uuid[]);
  v_relevant uuid[]; v_count integer; v_removed integer:=0; v_added integer:=0; v_assignment public.organization_order_period_assignments%rowtype; v_driver_id uuid; v_before boolean; v_after boolean;
  v_added_driver_ids uuid[]:='{}'::uuid[]; v_removed_driver_ids uuid[]:='{}'::uuid[];
begin
  if v_actor_id is null or not public.has_order_period_permission(v_actor_id,p_organization_id,'order_periods.assign') then return jsonb_build_object('success',false,'error','ORDER_PERIOD_MEMBERSHIP_UNAUTHORIZED'); end if;
  if not exists(select 1 from public.organizations where id=p_organization_id and is_active) then return jsonb_build_object('success',false,'error','ORDER_PERIOD_ORGANIZATION_INVALID'); end if;
  if p_week_start is null or p_week_end is null or not ((p_week_start=v_current_start and p_week_end=v_current_start+6) or (p_week_start=v_current_start+7 and p_week_end=v_current_start+13)) then return jsonb_build_object('success',false,'error','INVALID_WEEK_RANGE'); end if;
  perform 1 from public.organization_order_period_templates where id=p_order_period_template_id and organization_id=p_organization_id and is_active and archived_at is null for update;
  if not found then return jsonb_build_object('success',false,'error','ORDER_PERIOD_NOT_FOUND'); end if;
  select coalesce(array_agg(distinct driver_id order by driver_id),'{}'::uuid[]) into v_relevant from public.organization_order_period_assignments where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start);
  v_relevant:=v_relevant||v_selected;
  select coalesce(array_agg(distinct driver_id order by driver_id),'{}'::uuid[]) into v_relevant from unnest(v_relevant) x(driver_id);
  perform 1 from public.drivers where organization_id=p_organization_id and id=any(v_relevant) order by id for update;
  select count(*) into v_count from public.drivers where organization_id=p_organization_id and id=any(v_selected) and status='active'::public.driver_status and deleted_at is null and settlement_type='per_order'::public.driver_settlement_type;
  if v_count<>cardinality(v_selected) then return jsonb_build_object('success',false,'error','DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD'); end if;
  perform 1 from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_relevant) and is_active order by driver_id,id for update;
  if exists(select 1 from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_selected) and order_period_template_id<>p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start)) then return jsonb_build_object('success',false,'error','DRIVER_ALREADY_ASSIGNED_THIS_WEEK'); end if;
  if exists(select driver_id from public.organization_order_period_assignments where organization_id=p_organization_id and driver_id=any(v_selected) and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) group by driver_id having count(*)>1) then return jsonb_build_object('success',false,'error','DRIVER_HAS_MULTIPLE_ASSIGNMENTS_THIS_WEEK'); end if;
  for v_assignment in select * from public.organization_order_period_assignments where organization_id=p_organization_id and order_period_template_id=p_order_period_template_id and is_active and assignment_start_date<=p_week_end and (assignment_end_date is null or assignment_end_date>=p_week_start) order by driver_id,id for update loop
    if not(v_assignment.driver_id=any(v_selected)) then
      v_before:=v_assignment.assignment_start_date<p_week_start; v_after:=v_assignment.assignment_end_date is null or v_assignment.assignment_end_date>p_week_end;
      if v_before then update public.organization_order_period_assignments set assignment_end_date=p_week_start-1,updated_by=v_actor_id where id=v_assignment.id;
        if v_after then insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_order_period_template_id,v_assignment.driver_id,p_week_end+1,v_assignment.assignment_end_date,v_actor_id,v_actor_id); end if;
      elsif v_after then update public.organization_order_period_assignments set assignment_start_date=p_week_end+1,updated_by=v_actor_id where id=v_assignment.id;
      else update public.organization_order_period_assignments set is_active=false,updated_by=v_actor_id where id=v_assignment.id; end if;
      v_removed:=v_removed+1; v_removed_driver_ids:=array_append(v_removed_driver_ids,v_assignment.driver_id);
    end if;
  end loop;
  for v_driver_id in select d.id from public.drivers d where d.organization_id=p_organization_id and d.id=any(v_selected) and not exists(select 1 from public.organization_order_period_assignments a where a.organization_id=p_organization_id and a.order_period_template_id=p_order_period_template_id and a.driver_id=d.id and a.is_active and a.assignment_start_date<=p_week_end and (a.assignment_end_date is null or a.assignment_end_date>=p_week_start)) loop
    insert into public.organization_order_period_assignments(organization_id,order_period_template_id,driver_id,assignment_start_date,assignment_end_date,created_by,updated_by) values(p_organization_id,p_order_period_template_id,v_driver_id,p_week_start,p_week_end,v_actor_id,v_actor_id); v_added:=v_added+1; v_added_driver_ids:=array_append(v_added_driver_ids,v_driver_id);
  end loop;
  insert into public.activity_logs(actor_user_id,organization_id,action,entity_type,entity_id,after_data,metadata)
  values(v_actor_id,p_organization_id,'order_period_week_membership_replaced','organization_order_period_template',p_order_period_template_id,
    jsonb_build_object('week_start',p_week_start,'week_end',p_week_end,'added_count',v_added,'removed_count',v_removed),
    jsonb_build_object(
      'organization_id',p_organization_id,
      'added_driver_ids',to_jsonb(v_added_driver_ids),
      'removed_driver_ids',to_jsonb(v_removed_driver_ids),
      'added_drivers',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.full_name) order by d.id) from public.drivers d where d.organization_id=p_organization_id and d.id=any(v_added_driver_ids)),'[]'::jsonb),
      'removed_drivers',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.full_name) order by d.id) from public.drivers d where d.organization_id=p_organization_id and d.id=any(v_removed_driver_ids)),'[]'::jsonb)
    ));
  return jsonb_build_object('success',true,'added_count',v_added,'removed_count',v_removed);
end; $$;

revoke all on function public.replace_order_period_week_members(uuid,uuid,date,date,uuid[]) from public,anon;
grant execute on function public.replace_order_period_week_members(uuid,uuid,date,date,uuid[]) to authenticated,service_role;

commit;
