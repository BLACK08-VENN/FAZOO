-- Requests become work orders on assignment. No existing role enum is changed.
create table public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reported_by uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  title text not null check (length(btrim(title)) between 5 and 160),
  description text not null check (length(btrim(description)) between 10 and 3000),
  location text not null check (length(btrim(location)) between 3 and 240),
  priority text not null check (priority in ('low','normal','high','urgent')),
  status text not null default 'requested' check (status in ('requested','assigned','in_progress','awaiting_parts','ready_for_review','completed')),
  instructions text not null default '' check (length(instructions) <= 2000),
  completion_note text not null default '' check (length(completion_note) <= 2000),
  due_at timestamptz,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'requested' or (assigned_to is not null and due_at is not null)),
  check (status not in ('ready_for_review','completed') or length(btrim(completion_note)) >= 5),
  check (status <> 'completed' or (completed_by is not null and completed_at is not null and completed_by <> assigned_to))
);
create index maintenance_jobs_org_status on public.maintenance_jobs (organization_id, status, updated_at desc);
create index maintenance_jobs_assignee on public.maintenance_jobs (assigned_to, updated_at desc);
create index maintenance_jobs_reporter on public.maintenance_jobs (reported_by, updated_at desc);
create table public.maintenance_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('create','assign','update','approve','reopen')),
  note text not null check (length(note) between 5 and 3000),
  created_at timestamptz not null default now()
);
create index maintenance_events_job on public.maintenance_events (job_id, created_at);
alter table public.maintenance_jobs enable row level security;
alter table public.maintenance_events enable row level security;
revoke all on public.maintenance_jobs, public.maintenance_events from public, anon, authenticated;
grant select on public.maintenance_jobs, public.maintenance_events to authenticated;
create policy maintenance_jobs_visible on public.maintenance_jobs for select to authenticated using (
  exists (select 1 from public.current_profile() p join public.organizations o on o.id = p.organization_id
    where p.account_status = 'approved' and o.status = 'active' and p.organization_id = maintenance_jobs.organization_id
    and (p.role::text in ('super_admin','organization_admin') or p.id = reported_by or p.id = assigned_to))
);
create policy maintenance_events_visible on public.maintenance_events for select to authenticated using (
  exists (select 1 from public.maintenance_jobs j where j.id = maintenance_events.job_id)
);

create function public.maintenance_mutate(p_client_request_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  tech public.profiles;
  job public.maintenance_jobs;
  receipt public.operation_receipts;
  operation_key text;
  act text;
  result jsonb;
  event_note text;
  deadline timestamptz;
  manager boolean;
begin
  select p.* into actor from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.account_status='approved' and o.status='active' for share of p, o;
  if actor.id is null then raise exception 'Approved active organization membership required' using errcode='42501'; end if;
  if p_client_request_id is null or p_command is null or jsonb_typeof(p_command) <> 'object'
    or octet_length(p_command::text) > 12000 then raise exception 'Invalid command'; end if;
  act := p_command->>'action';
  if act is null or act not in ('create','assign','update','approve','reopen') then raise exception 'Invalid action'; end if;
  manager := actor.role::text in ('super_admin','organization_admin');
  operation_key := 'maintenance:' || act || ':' || md5(p_command::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text,0));
  select * into receipt from public.operation_receipts where client_request_id=p_client_request_id;
  if found then
    if receipt.brand_ambassador_id <> actor.id or receipt.organization_id <> actor.organization_id or receipt.operation <> operation_key
      then raise exception 'Request identifier already used' using errcode='42501'; end if;
    return receipt.result;
  end if;
  if not public.check_rate_limit('maintenance:'||actor.id::text,60,300) then raise exception 'Too many updates; try again later'; end if;
  if act='create' then
    if p_command->>'title' is null or p_command->>'description' is null or p_command->>'location' is null
      or p_command->>'priority' is null then raise exception 'Missing request details'; end if;
    insert into public.maintenance_jobs(organization_id,reported_by,title,description,location,priority)
      values(actor.organization_id,actor.id,btrim(p_command->>'title'),btrim(p_command->>'description'),btrim(p_command->>'location'),p_command->>'priority')
      returning * into job;
    event_note := job.description;
  else
    select * into job from public.maintenance_jobs where id=(p_command->>'job_id')::uuid and organization_id=actor.organization_id for update;
    if job.id is null then raise exception 'Job not found' using errcode='42501'; end if;
    if (p_command->>'expected_version') is null or job.version <> (p_command->>'expected_version')::int then raise exception 'Job changed; refresh before trying again' using errcode='40001'; end if;
    if act='assign' then
      if not manager or job.status not in ('requested','assigned') then raise exception 'Assignment not permitted' using errcode='42501'; end if;
      select * into tech from public.profiles where id=(p_command->>'technician_id')::uuid
        and organization_id=actor.organization_id and account_status='approved' and role::text <> 'client' for share;
      if tech.id is null then raise exception 'Choose an approved technician in this organization'; end if;
      deadline := (p_command->>'due_at')::timestamptz;
      if deadline is null or deadline <= now() then raise exception 'Choose a future deadline'; end if;
      if p_command->>'instructions' is null or length(btrim(p_command->>'instructions')) not between 5 and 2000 then raise exception 'Work instructions are required'; end if;
      update public.maintenance_jobs set assigned_to=tech.id,due_at=deadline,instructions=btrim(p_command->>'instructions'),status='assigned'
        where id=job.id;
      event_note := 'Assigned to '||tech.full_name||'. '||btrim(p_command->>'instructions');
    else
      event_note := btrim(p_command->>'note');
      if event_note is null or length(event_note) not between 5 and 2000 then raise exception 'A meaningful work or review note is required'; end if;
      if act='update' then
        if job.assigned_to is distinct from actor.id then raise exception 'Only the assigned technician may update this job' using errcode='42501'; end if;
        if not ((job.status='assigned' and p_command->>'status'='in_progress')
          or (job.status='in_progress' and p_command->>'status' in ('in_progress','awaiting_parts','ready_for_review'))
          or (job.status='awaiting_parts' and p_command->>'status' in ('awaiting_parts','in_progress')))
          or p_command->>'status' is null then raise exception 'Invalid status transition'; end if;
        update public.maintenance_jobs set status=p_command->>'status',
          completion_note=case when p_command->>'status'='ready_for_review' then event_note else completion_note end where id=job.id;
      else
        if not manager or job.status <> 'ready_for_review' or job.assigned_to=actor.id then raise exception 'An independent administrator must review submitted work' using errcode='42501'; end if;
        if act='approve' then
          update public.maintenance_jobs set status='completed',completed_by=actor.id,completed_at=now() where id=job.id;
        else
          update public.maintenance_jobs set status='in_progress',completion_note='' where id=job.id;
        end if;
      end if;
    end if;
    update public.maintenance_jobs set version=version+1,updated_at=now() where id=job.id returning * into job;
  end if;
  insert into public.maintenance_events(job_id,actor_id,action,note) values(job.id,actor.id,act,event_note);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
    values(actor.organization_id,actor.id,'maintenance.'||act,'maintenance_job',job.id,jsonb_build_object('status',job.status,'version',job.version));
  result := jsonb_build_object('id',job.id,'version',job.version);
  insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result)
    values(actor.organization_id,actor.id,p_client_request_id,operation_key,result);
  return result;
end;
$$;

create function public.maintenance_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles; manager boolean; jobs jsonb; technicians jsonb;
begin
  select p.* into actor from public.profiles p join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid() and p.account_status='approved' and o.status='active';
  if actor.id is null then raise exception 'Approved active organization membership required' using errcode='42501'; end if;
  manager := actor.role::text in ('super_admin','organization_admin');
  select coalesce(jsonb_agg(payload order by updated_at desc),'[]'::jsonb) into jobs from (
    select j.updated_at, jsonb_build_object(
      'id',j.id,'title',j.title,'description',j.description,'location',j.location,'priority',j.priority,'status',j.status,
      'reported_by',j.reported_by,'assigned_to',j.assigned_to,'technician_name',p.full_name,'due_at',j.due_at,
      'instructions',j.instructions,'completion_note',j.completion_note,'version',j.version,'created_at',j.created_at,'updated_at',j.updated_at,
      'events',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actor_name',ep.full_name,'action',e.action,'note',e.note,'created_at',e.created_at) order by e.created_at,e.id),'[]'::jsonb)
        from public.maintenance_events e join public.profiles ep on ep.id=e.actor_id where e.job_id=j.id)
    ) payload from public.maintenance_jobs j left join public.profiles p on p.id=j.assigned_to
    where j.organization_id=actor.organization_id and (manager or j.reported_by=actor.id or j.assigned_to=actor.id)
    order by j.updated_at desc limit 250
  ) visible;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name),'[]'::jsonb) into technicians
    from public.profiles p where manager and p.organization_id=actor.organization_id and p.account_status='approved' and p.role::text <> 'client';
  return jsonb_build_object('viewer',jsonb_build_object('id',actor.id,'name',actor.full_name,'can_manage',manager),'jobs',jobs,'technicians',technicians);
end;
$$;
revoke all on function public.maintenance_mutate(uuid,jsonb),public.maintenance_workspace() from public,anon;
grant execute on function public.maintenance_mutate(uuid,jsonb),public.maintenance_workspace() to authenticated;
