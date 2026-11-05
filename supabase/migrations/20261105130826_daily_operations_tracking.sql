-- Optional operations module. Apply only to an isolated maintenance test project.
create table public.operations_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references public.campaigns(id),
  created_by uuid not null references public.profiles(id),
  assigned_to uuid not null references public.profiles(id),
  kind text not null check(kind in ('task','delivery','collection','setup')),
  title text not null check(length(btrim(title)) between 5 and 160),
  instructions text not null check(length(btrim(instructions)) between 5 and 2000),
  origin text not null default '' check(length(origin)<=240),
  destination text not null check(length(btrim(destination)) between 3 and 240),
  due_at timestamptz not null,
  priority text not null check(priority in ('normal','high','urgent')),
  status text not null default 'assigned' check(status in ('assigned','in_progress','blocked','ready_for_review','completed')),
  items jsonb not null default '[]', actual_items jsonb not null default '[]',
  recipient text not null default '' check(length(recipient)<=160),
  completion_note text not null default '' check(length(completion_note)<=2000),
  evidence jsonb not null default '[]' check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=4),
  version integer not null default 1 check(version>0),
  completed_by uuid references public.profiles(id), completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index operations_tasks_org_due on public.operations_tasks(organization_id,campaign_id,due_at);
create index operations_tasks_assignee on public.operations_tasks(assigned_to,organization_id,updated_at desc);
create table public.operations_events (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.operations_tasks(id),
  actor_id uuid not null references public.profiles(id), action text not null,
  note text not null check(length(note) between 1 and 2200), created_at timestamptz not null default now()
);
create index operations_events_task on public.operations_events(task_id,created_at);

create function public.operations_can_read(p_org uuid,p_assignee uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.account_status='approved' and o.status='active'
      and p.organization_id=p_org and p.role::text<>'client'
      and (p.role::text in ('super_admin','organization_admin') or p.id=p_assignee));
$$;
revoke all on function public.operations_can_read(uuid,uuid) from public,anon;
grant execute on function public.operations_can_read(uuid,uuid) to authenticated;
alter table public.operations_tasks enable row level security;
alter table public.operations_events enable row level security;
revoke all on public.operations_tasks,public.operations_events from public,anon,authenticated;
grant select on public.operations_tasks,public.operations_events to authenticated;
create policy operations_read on public.operations_tasks for select to authenticated
  using(public.operations_can_read(organization_id,assigned_to));
create policy operations_events_read on public.operations_events for select to authenticated
  using(exists(select 1 from public.operations_tasks t where t.id=task_id));

-- Private evidence objects are readable only through the task's current access rules.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('operations-evidence','operations-evidence',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy operations_evidence_read on storage.objects for select to authenticated
  using(bucket_id='operations-evidence' and exists(select 1 from public.operations_tasks t
    where t.organization_id::text=split_part(name,'/',1) and t.campaign_id::text=split_part(name,'/',2)
      and t.id::text=split_part(name,'/',3)));
create policy operations_evidence_upload on storage.objects for insert to authenticated
  with check(bucket_id='operations-evidence' and exists(select 1 from public.operations_tasks t
    where t.organization_id::text=split_part(name,'/',1) and t.campaign_id::text=split_part(name,'/',2)
      and t.id::text=split_part(name,'/',3) and t.assigned_to=auth.uid() and t.status in ('in_progress','blocked')));

create function public.operations_validate_items(p_items jsonb)
returns void language plpgsql set search_path='' as $$
declare item jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>30 then raise exception 'Invalid item list'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string'
      or length(btrim(item->>'name')) not between 1 and 120
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity')::numeric not between 1 and 1000000
      or trunc((item->>'quantity')::numeric)<>(item->>'quantity')::numeric then raise exception 'Invalid item quantity or name'; end if;
  end loop;
end;
$$;
revoke all on function public.operations_validate_items(jsonb) from public,anon,authenticated;

create function public.operations_mutate(p_client_request_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles; worker public.profiles; task public.operations_tasks;
  receipt public.operation_receipts; manager boolean; act text; fingerprint text;
  result jsonb; note text; deadline timestamptz; path text; campaign uuid;
begin
  select p.* into actor from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.account_status='approved' and o.status='active' and p.role::text<>'client' for share of p,o;
  if actor.id is null then raise exception 'Approved operations membership required' using errcode='42501'; end if;
  if p_client_request_id is null or p_command is null or jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>20000 then raise exception 'Invalid command'; end if;
  act:=p_command->>'action';
  if act is null or act not in ('create','assign','update','approve','reopen') then raise exception 'Invalid action'; end if;
  manager:=actor.role::text in ('super_admin','organization_admin');
  fingerprint:='operations:'||act||':'||md5(p_command::text);
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into receipt from public.operation_receipts where client_request_id=p_client_request_id;
  if found then
    if receipt.organization_id<>actor.organization_id or receipt.brand_ambassador_id<>actor.id or receipt.operation<>fingerprint
      then raise exception 'Request identifier already used' using errcode='42501'; end if;
    return receipt.result;
  end if;
  if not public.check_rate_limit('operations:'||actor.id::text,60,300) then raise exception 'Too many updates'; end if;
  if act='create' then
    if not manager then raise exception 'Only administrators allocate operations tasks' using errcode='42501'; end if;
    select c.id into campaign from public.campaigns c where c.id=(p_command->>'campaign_id')::uuid
      and c.organization_id=actor.organization_id and c.status::text='active' for share;
    if campaign is null then raise exception 'Choose an active campaign in this organization' using errcode='42501'; end if;
    perform public.operations_validate_items(p_command->'items');
    if p_command->>'kind' in ('delivery','collection') and
      (jsonb_array_length(p_command->'items')=0 or length(btrim(coalesce(p_command->>'origin','')))<3) then raise exception 'Movement needs origin and items'; end if;
    select * into worker from public.profiles where id=(p_command->>'assigned_to')::uuid
      and organization_id=actor.organization_id and account_status='approved' and role::text<>'client' for share;
    if worker.id is null then raise exception 'Choose an approved worker in this organization' using errcode='42501'; end if;
    deadline:=(p_command->>'due_at')::timestamptz;
    if deadline is null or deadline<=now() then raise exception 'Choose a future deadline'; end if;
    insert into public.operations_tasks(organization_id,campaign_id,created_by,assigned_to,kind,title,instructions,origin,destination,due_at,priority,items)
      values(actor.organization_id,campaign,actor.id,worker.id,p_command->>'kind',btrim(p_command->>'title'),btrim(p_command->>'instructions'),
      btrim(coalesce(p_command->>'origin','')),btrim(p_command->>'destination'),deadline,p_command->>'priority',p_command->'items') returning * into task;
    note:='Assigned to '||worker.full_name||'. '||task.instructions;
  else
    select * into task from public.operations_tasks where id=(p_command->>'task_id')::uuid and organization_id=actor.organization_id for update;
    if task.id is null then raise exception 'Task not found' using errcode='42501'; end if;
    if p_command->>'expected_version' is null or task.version<>(p_command->>'expected_version')::int then raise exception 'Task changed; refresh before retrying' using errcode='40001'; end if;
    -- Also reject stale or inconsistent campaign references in legacy/imported rows.
    perform 1 from public.campaigns c where c.id=task.campaign_id and c.organization_id=actor.organization_id for share;
    if not found then raise exception 'Campaign unavailable' using errcode='42501'; end if;
    if act='assign' then
      if not manager or task.status not in ('assigned','blocked') then raise exception 'Reassignment not permitted' using errcode='42501'; end if;
      select * into worker from public.profiles where id=(p_command->>'assigned_to')::uuid
        and organization_id=actor.organization_id and account_status='approved' and role::text<>'client' for share;
      deadline:=(p_command->>'due_at')::timestamptz;
      if worker.id is null or deadline is null or deadline<=now() then raise exception 'Choose an approved worker and future deadline'; end if;
      update public.operations_tasks set assigned_to=worker.id,due_at=deadline,status='assigned',recipient='',actual_items='[]',evidence='[]',completion_note='' where id=task.id;
      note:='Reassigned to '||worker.full_name;
    else
      note:=btrim(p_command->>'note');
      if note is null or length(note) not between 5 and 2000 then raise exception 'A meaningful update is required'; end if;
      if act='update' then
        if task.assigned_to<>actor.id then raise exception 'Only the assigned worker may update this task' using errcode='42501'; end if;
        if p_command->>'status' is null or not ((task.status='assigned' and p_command->>'status'='in_progress')
          or (task.status='in_progress' and p_command->>'status' in ('in_progress','blocked','ready_for_review'))
          or (task.status='blocked' and p_command->>'status' in ('blocked','in_progress'))) then raise exception 'Invalid status transition'; end if;
        if p_command->>'status'='ready_for_review' then
          perform public.operations_validate_items(p_command->'actual_items');
          if task.kind in ('delivery','collection') and (jsonb_array_length(p_command->'actual_items')=0 or length(btrim(coalesce(p_command->>'recipient','')))<2)
            then raise exception 'Record actual items and recipient acknowledgement'; end if;
          if p_command->'evidence' is null or jsonb_typeof(p_command->'evidence')<>'array' or jsonb_array_length(p_command->'evidence')>4 then raise exception 'Invalid evidence list'; end if;
          for path in select jsonb_array_elements_text(p_command->'evidence') loop
            if path not like task.organization_id::text||'/'||task.campaign_id::text||'/'||task.id::text||'/%'
              or not exists(select 1 from storage.objects o where o.bucket_id='operations-evidence' and o.name=path)
              then raise exception 'Evidence does not belong to this task' using errcode='42501'; end if;
          end loop;
          update public.operations_tasks set recipient=btrim(coalesce(p_command->>'recipient','')),actual_items=p_command->'actual_items',evidence=p_command->'evidence',completion_note=note where id=task.id;
        end if;
        update public.operations_tasks set status=p_command->>'status' where id=task.id;
      else
        if not manager or task.assigned_to=actor.id or task.status<>'ready_for_review' then raise exception 'Independent administrator review required' using errcode='42501'; end if;
        update public.operations_tasks set status=case when act='approve' then 'completed' else 'in_progress' end,
          completed_by=case when act='approve' then actor.id else null end, completed_at=case when act='approve' then now() else null end where id=task.id;
      end if;
    end if;
    update public.operations_tasks set version=version+1,updated_at=now() where id=task.id returning * into task;
  end if;
  insert into public.operations_events(task_id,actor_id,action,note) values(task.id,actor.id,act,note);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(actor.organization_id,actor.id,'operations.'||act,'operations_task',task.id,jsonb_build_object('campaign_id',task.campaign_id,'status',task.status,'version',task.version));
  result:=jsonb_build_object('id',task.id,'version',task.version);
  insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result)
    values(actor.organization_id,actor.id,p_client_request_id,fingerprint,result);
  return result;
end;
$$;

create function public.operations_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles; manager boolean; tasks jsonb; campaigns jsonb; workers jsonb;
begin
  select p.* into actor from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.account_status='approved' and o.status='active' and p.role::text<>'client';
  if actor.id is null then raise exception 'Approved operations membership required' using errcode='42501'; end if;
  manager:=actor.role::text in ('super_admin','organization_admin');
  select coalesce(jsonb_agg(payload order by updated_at desc),'[]'::jsonb) into tasks from (
    select t.updated_at,to_jsonb(t)-'organization_id'-'created_by'-'completed_by'||jsonb_build_object(
      'campaign_name',c.name,'assignee_name',p.full_name,
      'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actor_name',ep.full_name,'action',e.action,'note',e.note,'created_at',e.created_at) order by e.created_at,e.id),'[]'::jsonb)
        from public.operations_events e join public.profiles ep on ep.id=e.actor_id where e.task_id=t.id)) payload
    from public.operations_tasks t join public.campaigns c on c.id=t.campaign_id and c.organization_id=t.organization_id
      join public.profiles p on p.id=t.assigned_to
    where t.organization_id=actor.organization_id and (manager or t.assigned_to=actor.id)
    order by t.updated_at desc,t.id limit 250
  ) visible;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'status',c.status) order by c.name),'[]'::jsonb) into campaigns
    from public.campaigns c where c.organization_id=actor.organization_id and
      (manager and c.status::text='active' or exists(select 1 from public.operations_tasks t where t.campaign_id=c.id and t.organization_id=actor.organization_id and (manager or t.assigned_to=actor.id)));
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name),'[]'::jsonb) into workers
    from public.profiles p where manager and p.organization_id=actor.organization_id and p.account_status='approved' and p.role::text<>'client';
  return jsonb_build_object('viewer',jsonb_build_object('id',actor.id,'organization_id',actor.organization_id,'name',actor.full_name,'can_manage',manager),'tasks',tasks,'campaigns',campaigns,'workers',workers);
end;
$$;
revoke all on function public.operations_mutate(uuid,jsonb),public.operations_workspace() from public,anon;
grant execute on function public.operations_mutate(uuid,jsonb),public.operations_workspace() to authenticated;
