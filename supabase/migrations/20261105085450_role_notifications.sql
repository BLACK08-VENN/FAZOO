-- Future committed activity only. Notifications never contain leave reasons,
-- contacts, photos, coordinates or free-text submissions.
create table public.user_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id),
 recipient_role text not null check(recipient_role in ('super_admin','organization_admin','supervisor','brand_ambassador','client')),
 organization_id uuid not null references public.organizations(id),
 event_key text not null,
 kind text not null,
 title text not null check(length(title) between 1 and 160),
 body text not null check(length(body)<=400),
 web_path text not null check(web_path ~ '^/(overview|workspace|brand|campaigns|leave-requests|daily-logs|partners|booklists|service-desk)(/|[?]|$)'),
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 unique(recipient_id,event_key)
);
create index notification_recipient_history on public.user_notifications(recipient_id,created_at desc,id desc);
create index notification_unread on public.user_notifications(recipient_id) where read_at is null;
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public,anon,authenticated;
grant select on public.user_notifications to authenticated;

create function private.notification_role(p_user uuid,p_org uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; r text;
begin
 select * into p from public.profiles where id=p_user and account_status='approved';
 if p.id is null or not exists(select 1 from public.organizations where id=p_org and status='active') then return null; end if;
 if p.current_membership_id is not null and not exists(select 1 from public.organization_memberships m where m.id=p.current_membership_id and m.user_id=p.id and m.organization_id=p.organization_id and m.role=p.role and m.account_status='approved') then return null; end if;
 if p.role='super_admin' or p.organization_id=p_org then return p.role::text; end if;
 select m.role::text into r from public.organization_memberships m where m.user_id=p.id and m.organization_id=p_org and m.account_status='approved';
 return r;
end $$;
revoke all on function private.notification_role(uuid,uuid) from public,anon,authenticated;

create function private.notification_visible(p_org uuid,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.notification_role(auth.uid(),p_org)=p_role
 and exists(select 1 from public.profiles p where p.id=auth.uid() and (p.role in ('super_admin','organization_admin','supervisor') or p.organization_id=p_org));
$$;
revoke all on function private.notification_visible(uuid,text) from public,anon;
grant execute on function private.notification_visible(uuid,text) to authenticated;
create policy notification_owner_read on public.user_notifications for select to authenticated
 using(recipient_id=(select auth.uid()) and private.notification_visible(organization_id,recipient_role));

create function private.notify_user(p_user uuid,p_org uuid,p_key text,p_kind text,p_title text,p_body text,p_staff_path text,p_brand_path text,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r text;
begin
 if p_user is null or p_user=p_actor then return; end if;
 r:=private.notification_role(p_user,p_org);
 if r is null then return; end if;
 insert into public.user_notifications(recipient_id,recipient_role,organization_id,event_key,kind,title,body,web_path)
 values(p_user,r,p_org,p_key,p_kind,p_title,p_body,case when r in ('client','brand_ambassador') then p_brand_path else p_staff_path end)
 on conflict(recipient_id,event_key) do nothing;
end $$;
revoke all on function private.notify_user(uuid,uuid,text,text,text,text,text,text,uuid) from public,anon,authenticated;

create function private.notify_roles(p_org uuid,p_key text,p_kind text,p_title text,p_body text,p_staff_path text,p_brand_path text,p_actor uuid,p_roles text[] default array['super_admin','organization_admin'],p_campaign uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare u record; r text;
begin
 for u in select p.id from public.profiles p where p.account_status='approved' and
 (p.organization_id=p_org or p.role='super_admin' or exists(select 1 from public.organization_memberships m where m.user_id=p.id and m.organization_id=p_org and m.account_status='approved')) loop
  r:=private.notification_role(u.id,p_org);
  if r is null or not(r=any(p_roles)) then continue; end if;
  if r='supervisor' and (p_campaign is null or not public.supervisor_can_see_campaign(u.id,p_campaign)) then continue; end if;
  perform private.notify_user(u.id,p_org,p_key,p_kind,p_title,p_body,p_staff_path,p_brand_path,p_actor);
 end loop;
end $$;
revoke all on function private.notify_roles(uuid,text,text,text,text,text,text,uuid,text[],uuid) from public,anon,authenticated;

create function private.notify_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 org uuid:=(n->>'organization_id')::uuid; entity uuid:=(n->>'id')::uuid; actor uuid:=auth.uid();
 k text:=tg_table_name||':'||entity::text||':'||gen_random_uuid()::text;
 status text:=coalesce(n->>'status',n->>'stage',n->>'account_status');
 u record; owner_id uuid; title text;
begin
 if org is null then return new; end if;
 case tg_table_name
 when 'leave_requests' then
  if tg_op='INSERT' and status='pending' then
   perform private.notify_roles(org,k,'leave.request','Leave request awaiting review','A team member submitted a leave request.','/leave-requests/'||entity,'/brand/leave',actor);
  elsif n->>'status' is distinct from o->>'status' and status in ('approved','denied','cancelled') then
   perform private.notify_user((n->>'brand_ambassador_id')::uuid,org,k,'leave.decision','Leave request '||status,'Your leave request has been '||status||'.','/leave-requests/'||entity,'/brand/leave',actor);
  end if;
 when 'brand_ambassador_assignments' then
  if tg_op='INSERT' or (n-'updated_at') is distinct from (o-'updated_at') then
   perform private.notify_user((n->>'brand_ambassador_id')::uuid,org,k,'assignment.updated',case when tg_op='INSERT' then 'New assignment' else 'Assignment updated' end,'Review your campaign, location and shift details.','/workspace','/brand',actor);
  end if;
 when 'partner_visit_logs' then
  perform private.notify_roles(org,k,'partner.submitted','Partner log submitted','A new Lenovo partner log is available for review.','/partners?month='||left(n->>'reporting_month',7),'/brand/partners',actor);
 when 'daily_logs' then
  if (tg_op='INSERT' and (n->>'flagged')::boolean) or (tg_op='UPDATE' and ((n->>'status'='completed' and o->>'status'<>'completed') or (n->>'flagged'='true' and o->>'flagged' is distinct from 'true'))) then
   perform private.notify_roles(org,k,'field.submitted',case when n->>'flagged'='true' then 'Field activity needs attention' else 'Field log completed' end,'Review the latest field submission.','/daily-logs/'||entity,'/brand',actor,array['super_admin','organization_admin','supervisor'],(n->>'campaign_id')::uuid);
  end if;
 when 'booklist_jobs' then
  if tg_op='INSERT' or n->>'stage' is distinct from o->>'stage' or n->>'owner_ba_id' is distinct from o->>'owner_ba_id' then
   title:='Booklist status updated';
   perform private.notify_roles(org,k,'booklist.updated',title,'A booklist has moved to '||replace(n->>'stage','_',' ')||'.','/booklists/'||entity,'/brand',actor);
   perform private.notify_user((n->>'owner_ba_id')::uuid,org,k,'booklist.updated',title,'Review the next step for your assigned booklist.','/booklists/'||entity,'/brand',actor);
  end if;
 when 'maintenance_jobs' then
  if tg_op='INSERT' or (n-array['updated_at','version']) is distinct from (o-array['updated_at','version']) then
   if tg_op='INSERT' or status='ready_for_review' then
    perform private.notify_roles(org,k,'maintenance.review',case when status='ready_for_review' then 'Work order awaiting approval' else 'New service request' end,'A service request needs your attention.','/service-desk','/service-desk',actor);
   end if;
   perform private.notify_user((n->>'assigned_to')::uuid,org,k,'maintenance.updated',case when n->>'assigned_to' is distinct from o->>'assigned_to' then 'Work order assigned to you' else 'Work order updated' end,'Open the service desk to review the current status and next step.','/service-desk','/service-desk',actor);
   perform private.notify_user((n->>'reported_by')::uuid,org,k,'maintenance.updated','Service request updated','Open the service desk to review your request.','/service-desk','/service-desk',actor);
  end if;
 when 'campaigns' then
  if status='pending_approval' and (tg_op='INSERT' or status is distinct from o->>'status') then
   perform private.notify_roles(org,k,'campaign.review','Campaign awaiting approval','A campaign request needs a decision.','/campaigns','/brand/campaigns',actor);
  elsif tg_op='UPDATE' and status is distinct from o->>'status' then
   perform private.notify_roles(org,k,'campaign.updated','Campaign status updated','A campaign is now '||replace(status,'_',' ')||'.','/campaigns','/brand/campaigns',actor,array['client']);
   for u in select distinct a.brand_ambassador_id id from public.brand_ambassador_assignments a where a.campaign_id=entity and a.organization_id=org and a.status='active' loop
    perform private.notify_user(u.id,org,k,'campaign.updated','Campaign status updated','Review your assigned campaign.','/campaigns','/brand',actor);
   end loop;
  end if;
 when 'organization_memberships','profiles' then
  owner_id:=case when tg_table_name='profiles' then entity else (n->>'user_id')::uuid end;
  k:='account:'||owner_id::text||':'||org::text||':'||coalesce(status,'')||':'||txid_current()::text;
  if tg_op='INSERT' and status='pending' then
   perform private.notify_roles(org,k,'account.review','Account awaiting approval','A new account is waiting for an administrator review.','/brand-ambassadors','/brand',actor);
  elsif n->>'account_status' is distinct from o->>'account_status' and status='approved' then
   perform private.notify_user(owner_id,org,k,'account.approved','Your account is approved','Your workspace access is ready.','/workspace','/brand',actor);
  end if;
 else null;
 end case;
 return new;
end $$;
revoke all on function private.notify_activity() from public,anon,authenticated;

create trigger notify_leave_activity after insert or update on public.leave_requests for each row execute function private.notify_activity();
create trigger notify_assignment_activity after insert or update on public.brand_ambassador_assignments for each row execute function private.notify_activity();
create trigger notify_partner_activity after insert on public.partner_visit_logs for each row execute function private.notify_activity();
create trigger notify_field_activity after insert or update on public.daily_logs for each row execute function private.notify_activity();
create trigger notify_booklist_activity after insert or update on public.booklist_jobs for each row execute function private.notify_activity();
create trigger notify_maintenance_activity after insert or update on public.maintenance_jobs for each row execute function private.notify_activity();
create trigger notify_campaign_activity after insert or update on public.campaigns for each row execute function private.notify_activity();
create trigger notify_membership_activity after insert or update on public.organization_memberships for each row execute function private.notify_activity();
create trigger notify_account_activity after insert or update of account_status on public.profiles for each row execute function private.notify_activity();

create function public.notification_inbox(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view notifications' using errcode='42501'; end if;
 with visible as (
  select n.id,n.organization_id,o.name brand_name,n.kind,n.title,n.body,n.created_at,n.read_at
  from public.user_notifications n join public.organizations o on o.id=n.organization_id
  where n.recipient_id=auth.uid() and private.notification_visible(n.organization_id,n.recipient_role)
 ), page as (select * from visible where p_before is null or (created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit 31)
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc,id desc),'[]'::jsonb) from (select * from page order by created_at desc,id desc limit 30) x),'has_more',(select count(*)>30 from page),'unread_count',(select count(*) from visible where read_at is null)) into result;
 return result;
end $$;
revoke all on function public.notification_inbox(timestamptz,uuid) from public,anon;
grant execute on function public.notification_inbox(timestamptz,uuid) to authenticated;

create function public.notification_mark_read(p_client_request_id uuid,p_notification_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; receipt public.operation_receipts; result jsonb; marked integer; ids jsonb:=to_jsonb(p_notification_ids);
begin
 select * into p from public.profiles where id=auth.uid() and account_status='approved';
 if p.id is null then raise exception 'Approved account required' using errcode='42501'; end if;
 if p_client_request_id is null or coalesce(cardinality(p_notification_ids),0)>100 then raise exception 'Invalid read request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
 select * into receipt from public.operation_receipts where client_request_id=p_client_request_id;
 if found then
  if receipt.brand_ambassador_id<>p.id or receipt.operation<>'notification_read' or receipt.result->'ids' is distinct from coalesce(ids,'null'::jsonb) then raise exception 'Request ID is already in use' using errcode='42501'; end if;
  return receipt.result;
 end if;
 if p_notification_ids is not null and exists(select 1 from unnest(p_notification_ids) i where not exists(select 1 from public.user_notifications n where n.id=i and n.recipient_id=p.id and private.notification_visible(n.organization_id,n.recipient_role))) then raise exception 'Notification is not available' using errcode='42501'; end if;
 if not public.check_rate_limit('notification-read:'||p.id::text,120,60) then raise exception 'Please try again shortly'; end if;
 update public.user_notifications n set read_at=clock_timestamp() where n.recipient_id=p.id and n.read_at is null and (p_notification_ids is null or n.id=any(p_notification_ids)) and private.notification_visible(n.organization_id,n.recipient_role);
 get diagnostics marked=row_count;
 result:=jsonb_build_object('marked',marked,'ids',coalesce(ids,'null'::jsonb));
 insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result) values(p.organization_id,p.id,p_client_request_id,'notification_read',result);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,metadata) values(p.organization_id,p.id,'notification.read','user_notifications',jsonb_build_object('count',marked));
 return result;
end $$;
revoke all on function public.notification_mark_read(uuid,uuid[]) from public,anon;
grant execute on function public.notification_mark_read(uuid,uuid[]) to authenticated;

create function public.notification_open(p_notification_id uuid,p_client_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.user_notifications;
begin
 select * into n from public.user_notifications where id=p_notification_id and recipient_id=auth.uid() and private.notification_visible(organization_id,recipient_role);
 if n.id is null then raise exception 'Notification is no longer available' using errcode='42501'; end if;
 perform public.notification_mark_read(p_client_request_id,array[n.id]);
 return jsonb_build_object('organization_id',n.organization_id,'web_path',n.web_path);
end $$;
revoke all on function public.notification_open(uuid,uuid) from public,anon;
grant execute on function public.notification_open(uuid,uuid) to authenticated;
