-- Lenovo partner collection. Immutable submissions; one latest observation per
-- outlet/month contributes to market summaries. Existing attendance is untouched.
create table public.partner_outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  company_name text not null,
  city text not null,
  state text not null,
  branch text not null default '',
  identity_key text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(organization_id, identity_key),
  unique(organization_id, id)
);
create table public.partner_collection_settings (
  organization_id uuid primary key references public.organizations(id),
  high_threshold integer not null default 100,
  medium_threshold integer not null default 30,
  check (medium_threshold >= 0 and high_threshold > medium_threshold and high_threshold <= 10000000)
);
create table public.partner_visit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  partner_id uuid not null,
  collected_by uuid not null references public.profiles(id),
  collector_name text not null,
  visit_date date not null,
  reporting_month date not null check (extract(day from reporting_month)=1),
  payload jsonb not null,
  total_pcs bigint,
  lenovo_units integer,
  correction_of uuid references public.partner_visit_logs(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(organization_id,partner_id) references public.partner_outlets(organization_id,id)
);
create index partner_visits_org_month on public.partner_visit_logs(organization_id,reporting_month,partner_id,created_at desc,id desc);
create index partner_visits_collector on public.partner_visit_logs(collected_by,reporting_month);
create index partner_visits_correction on public.partner_visit_logs(correction_of);
create index partner_outlets_creator on public.partner_outlets(created_by);
alter table public.partner_outlets enable row level security;
alter table public.partner_visit_logs enable row level security;
alter table public.partner_collection_settings enable row level security;

create function private.partner_profile() returns public.profiles
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null or p.account_status <> 'approved' or p.role not in ('brand_ambassador','organization_admin','super_admin') then
    raise exception 'Approved Lenovo collection access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.organizations where id=p.organization_id and slug='lenovo-nigeria' and status='active') then
    raise exception 'Partner collection is available in Lenovo Nigeria only' using errcode='42501';
  end if;
  if public.staff_session_verified() is distinct from true then
    raise exception 'Complete staff verification before continuing' using errcode='42501';
  end if;
  return p;
end $$;
-- The ownership predicate is explicit; directory/settings are shared within Lenovo.
create function private.partner_can_read(p_org uuid,p_collector uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  p:=private.partner_profile();
  return p.organization_id=p_org and (p_collector is null or p.role <> 'brand_ambassador' or p.id=p_collector);
exception when others then return false;
end $$;
revoke all on function private.partner_profile() from public,anon,authenticated;
revoke all on function private.partner_can_read(uuid,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.partner_can_read(uuid,uuid) to authenticated;
create policy partner_outlets_read on public.partner_outlets for select to authenticated using(private.partner_can_read(organization_id));
create policy partner_settings_read on public.partner_collection_settings for select to authenticated using(private.partner_can_read(organization_id));
create policy partner_visits_read on public.partner_visit_logs for select to authenticated using(private.partner_can_read(organization_id,collected_by));
revoke all on public.partner_outlets,public.partner_visit_logs,public.partner_collection_settings from anon,authenticated;
grant select on public.partner_outlets,public.partner_visit_logs,public.partner_collection_settings to authenticated;

create function public.partner_submit_log(p_client_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  p public.profiles; r public.operation_receipts; outlet public.partner_outlets;
  d jsonb:=p_payload; k text; v jsonb; qty bigint; total bigint:=0; complete boolean:=true;
  visit_day date; report_month date; correction uuid; log_id uuid; result jsonb; identity text;
begin
  p:=private.partner_profile();
  if p.role <> 'brand_ambassador' then raise exception 'Only merchandisers may submit partner logs' using errcode='42501'; end if;
  if p_client_request_id is null then raise exception 'A request ID is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text,0));
  select * into r from public.operation_receipts where client_request_id=p_client_request_id;
  if found then
    if r.brand_ambassador_id<>p.id or r.organization_id<>p.organization_id or r.operation<>'partner_submit_log' then raise exception 'Request ID is already in use' using errcode='42501'; end if;
    if r.result->'request' is distinct from d then raise exception 'This retry has different answers. Start a new log.'; end if;
    return r.result-'request';
  end if;
  if not public.check_rate_limit('partner-submit:'||p.id::text,60,3600) then raise exception 'Too many submissions. Please try again later.'; end if;
  if jsonb_typeof(d)<>'object' or octet_length(d::text)>20000 then raise exception 'Invalid partner log'; end if;
  foreach k in array array['company_name','city','contact_person','state','visit_method','sales_basis','sells_mostly','main_customers'] loop
    if jsonb_typeof(d->k) is distinct from 'string' or length(trim(d->>k))=0 or length(d->>k)>200 then raise exception 'Missing or invalid field: %',k; end if;
  end loop;
  foreach k in array array['branch','phone','email','other_brand_names','notes'] loop
    if jsonb_typeof(d->k) is distinct from 'string' or length(d->>k)>(case when k='notes' then 3000 when k='other_brand_names' then 300 else 254 end) then raise exception 'Invalid field: %',k; end if;
  end loop;
  if d->>'state' <> all(array['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']) then raise exception 'Select a Nigerian state'; end if;
  if d->>'visit_method' not in ('Visit','Call') or d->>'sales_basis' not in ('Actual month','Typical month estimate') then raise exception 'Invalid visit or sales basis'; end if;
  if d->>'sells_mostly' not in ('PCs / laptops','Printers','Projectors','Accessories','Networking','Phones & tablets','Servers & storage','UPS / power','Mixed') or d->>'main_customers' not in ('Walk-in / retail','SMB','Corporate','Government','Education','Mixed') then raise exception 'Invalid product or customer category'; end if;
  if d->>'visit_date' !~ '^\d{4}-\d{2}-\d{2}$' or d->>'reporting_month' !~ '^\d{4}-\d{2}-01$' then raise exception 'Select valid dates'; end if;
  visit_day:=(d->>'visit_date')::date; report_month:=(d->>'reporting_month')::date;
  if visit_day is null or report_month is null or visit_day> (now() at time zone 'Africa/Lagos')::date or visit_day<'2020-01-01' or report_month>date_trunc('month',visit_day)::date or report_month<'2020-01-01' then raise exception 'Dates cannot be future dates; reporting month must be on or before the visit month'; end if;
  if jsonb_typeof(d->'sales') is distinct from 'object' or (select count(*) from jsonb_object_keys(d->'sales'))<>7 then raise exception 'Answer all seven brand quantities'; end if;
  foreach k in array array['Lenovo','HP','Dell','Apple','Asus','Acer','Other','employees'] loop
    v:=case when k='employees' then d->k else d->'sales'->k end;
    if v is null then raise exception 'Answer % or mark it unknown',k; end if;
    if v='null'::jsonb then
      if k<>'employees' then complete:=false; end if;
    else
      if jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' then raise exception '% must be a nonnegative whole number',k; end if;
      qty:=(v::text)::bigint;
      if qty>10000000 then raise exception '% is too large',k; end if;
      if k<>'employees' then total:=total+qty; end if;
    end if;
  end loop;
  if coalesce((d->'sales'->>'Other')::integer,0)>0 and length(trim(d->>'other_brand_names'))=0 then raise exception 'Name the other brands sold'; end if;
  if jsonb_typeof(d->'products') is distinct from 'object' or (select count(*) from jsonb_object_keys(d->'products'))<>7 then raise exception 'Answer all product categories'; end if;
  foreach k in array array['Printers','Projectors','Accessories','Networking','Phones & Tablets','Servers & Storage','Gaming and Gaming Accessories'] loop
    if (d->'products'->>k) is null or (d->'products'->>k) not in ('Yes','No','Unknown') then raise exception 'Answer product category: %',k; end if;
  end loop;
  if d->>'phone'<>'' and d->>'phone' !~ '^\+?[0-9 ()-]{7,40}$' then raise exception 'Invalid phone number'; end if;
  if d->>'email'<>'' and d->>'email' !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Invalid email address'; end if;
  if nullif(d->>'partner_id','') is not null then
    select * into outlet from public.partner_outlets where id=(d->>'partner_id')::uuid and organization_id=p.organization_id;
    if outlet.id is null then raise exception 'Partner not found in this organization' using errcode='42501'; end if;
  else
    identity:=lower(regexp_replace(trim(d->>'company_name'),'\s+',' ','g'))||'|'||lower(regexp_replace(trim(d->>'city'),'\s+',' ','g'))||'|'||lower(d->>'state')||'|'||lower(regexp_replace(trim(d->>'branch'),'\s+',' ','g'));
    insert into public.partner_outlets(organization_id,company_name,city,state,branch,identity_key,created_by)
      values(p.organization_id,trim(d->>'company_name'),trim(d->>'city'),d->>'state',trim(d->>'branch'),identity,p.id)
      on conflict(organization_id,identity_key) do update set identity_key=excluded.identity_key returning * into outlet;
  end if;
  -- Preserve the trusted directory identity in every immutable log snapshot.
  d:=d||jsonb_build_object('partner_id',outlet.id,'company_name',outlet.company_name,'city',outlet.city,'state',outlet.state,'branch',outlet.branch);
  correction:=nullif(d->>'correction_of','')::uuid;
  if correction is not null and not exists(select 1 from public.partner_visit_logs where id=correction and organization_id=p.organization_id and collected_by=p.id and partner_id=outlet.id and reporting_month=report_month) then raise exception 'You can correct only your own log for this outlet and month' using errcode='42501'; end if;
  insert into public.partner_visit_logs(organization_id,partner_id,collected_by,collector_name,visit_date,reporting_month,payload,total_pcs,lenovo_units,correction_of)
    values(p.organization_id,outlet.id,p.id,p.full_name,visit_day,report_month,d,case when complete then total end,(d->'sales'->>'Lenovo')::integer,correction) returning id into log_id;
  result:=jsonb_build_object('id',log_id,'partner_id',outlet.id,'submitted',true);
  insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result) values(p.organization_id,p.id,p_client_request_id,'partner_submit_log',result||jsonb_build_object('request',p_payload));
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(p.organization_id,p.id,case when correction is null then 'partner.log_submitted' else 'partner.log_corrected' end,'partner_visit_log',log_id,jsonb_build_object('partner_id',outlet.id,'reporting_month',report_month,'correction_of',correction));
  return result;
end $$;
revoke all on function public.partner_submit_log(uuid,jsonb) from public,anon;
grant execute on function public.partner_submit_log(uuid,jsonb) to authenticated;

create function public.partner_set_thresholds(p_client_request_id uuid,p_high integer,p_medium integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; r public.operation_receipts; result jsonb;
begin
  p:=private.partner_profile();
  if p.role not in ('organization_admin','super_admin') then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_client_request_id is null or p_high is null or p_medium is null or p_medium<0 or p_high<=p_medium or p_high>10000000 then raise exception 'High threshold must exceed medium threshold; enter nonnegative whole numbers'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_request_id::text,0));
  select * into r from public.operation_receipts where client_request_id=p_client_request_id;
  if found then
    if r.brand_ambassador_id<>p.id or r.organization_id<>p.organization_id or r.operation<>'partner_set_thresholds' then raise exception 'Request ID is already in use' using errcode='42501'; end if;
    if r.result->>'high'<>p_high::text or r.result->>'medium'<>p_medium::text then raise exception 'Retry values changed'; end if;
    return r.result;
  end if;
  insert into public.partner_collection_settings values(p.organization_id,p_high,p_medium) on conflict(organization_id) do update set high_threshold=excluded.high_threshold,medium_threshold=excluded.medium_threshold;
  result:=jsonb_build_object('high',p_high,'medium',p_medium);
  insert into public.operation_receipts(organization_id,brand_ambassador_id,client_request_id,operation,result) values(p.organization_id,p.id,p_client_request_id,'partner_set_thresholds',result);
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,metadata) values(p.organization_id,p.id,'partner.thresholds_updated','partner_collection_settings',result);
  return result;
end $$;
revoke all on function public.partner_set_thresholds(uuid,integer,integer) from public,anon;
grant execute on function public.partner_set_thresholds(uuid,integer,integer) to authenticated;

create function public.partner_directory(p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles;
begin
  p:=private.partner_profile();
  return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select id,company_name,city,state,branch from public.partner_outlets
    where organization_id=p.organization_id and (coalesce(p_search,'')='' or strpos(lower(company_name||' '||city||' '||branch),lower(left(p_search,200)))>0)
    order by company_name,city,branch limit 50
  ) x);
end $$;
revoke all on function public.partner_directory(text) from public,anon;
grant execute on function public.partner_directory(text) to authenticated;

create function public.partner_workspace(p_month date,p_state text default '',p_collector uuid default null,p_search text default '',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.profiles; hi integer:=100; med integer:=30; result jsonb;
begin
  p:=private.partner_profile();
  if p_month is null or extract(day from p_month)<>1 then raise exception 'Select a reporting month'; end if;
  select high_threshold,medium_threshold into hi,med from public.partner_collection_settings where organization_id=p.organization_id;
  hi:=coalesce(hi,100); med:=coalesce(med,30);
  with all_logs as (
    select l.*,case when l.total_pcs is null then 'Unknown' when l.total_pcs>=hi then 'High' when l.total_pcs>=med then 'Medium' else 'Low' end as priority,
      row_number() over(partition by l.partner_id,l.reporting_month order by l.created_at desc,l.id desc) as revision
    from public.partner_visit_logs l where l.organization_id=p.organization_id and l.reporting_month=p_month
  ), scoped as (
    select * from all_logs where (p.role<>'brand_ambassador' or collected_by=p.id)
    and (coalesce(p_state,'')='' or payload->>'state'=p_state)
    and (p_collector is null or collected_by=p_collector)
    and (coalesce(p_search,'')='' or strpos(lower((payload->>'company_name')||' '||(payload->>'city')||' '||(payload->>'branch')),lower(left(p_search,200)))>0)
  ), latest as (select * from scoped where revision=1), complete as (select * from latest where total_pcs is not null),
  brands as (
    select b as label,coalesce(sum((payload->'sales'->>b)::bigint),0) as units,count(*) filter(where (payload->'sales'->>b)::bigint>0) as companies
    from unnest(array['Lenovo','HP','Dell','Apple','Asus','Acer','Other']) b left join complete on true group by b
  ), products as (
    select b as label,count(*) filter(where payload->'products'->>b='Yes') as companies
    from unnest(array['Printers','Projectors','Accessories','Networking','Phones & Tablets','Servers & Storage','Gaming and Gaming Accessories']) b left join latest on true group by b
  ), paged as (select * from scoped order by created_at desc,id desc limit case when p_page=0 then 10001 else 30 end offset (greatest(1,least(coalesce(p_page,1),100000))-1)*30)
  select jsonb_build_object(
    'high',hi,'medium',med,
    'logs_count',(select count(*) from scoped),
    'outlets_count',(select count(distinct partner_id) from scoped),
    'current_count',(select count(*) from latest),
    'complete_count',(select count(*) from complete),
    'unknown_count',(select count(*) from latest where total_pcs is null),
    'estimated_count',(select count(*) from latest where payload->>'sales_basis'='Typical month estimate'),
    'total_pcs',(select coalesce(sum(total_pcs),0) from complete),
    'lenovo_units',(select coalesce(sum(lenovo_units),0) from complete),
    'brands',(select coalesce(jsonb_agg(to_jsonb(brands)),'[]'::jsonb) from brands),
    'products',(select coalesce(jsonb_agg(to_jsonb(products)),'[]'::jsonb) from products),
    'priorities',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select priority as label,count(*) as companies from latest group by priority) x),
    'states',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select payload->>'state' as label,count(*) as companies,coalesce(sum(total_pcs),0) as units from latest group by payload->>'state') x),
    'customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select payload->>'main_customers' as label,count(*) as companies from latest group by payload->>'main_customers') x),
    'mostly',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select payload->>'sells_mostly' as label,count(*) as companies from latest group by payload->>'sells_mostly') x),
    'collectors',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select collected_by as id,collector_name as name,count(*) as logs from all_logs where p.role<>'brand_ambassador' or collected_by=p.id group by collected_by,collector_name) x),
    'logs',(select coalesce(jsonb_agg(to_jsonb(paged) order by created_at desc,id desc),'[]'::jsonb) from paged)
  ) into result;
  return result;
end $$;
revoke all on function public.partner_workspace(date,text,uuid,text,integer) from public,anon;
grant execute on function public.partner_workspace(date,text,uuid,text,integer) to authenticated;
