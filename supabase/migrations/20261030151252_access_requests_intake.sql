-- Anonymous access applications are intake records, never auth users or roles.
-- This file is prepared for the isolated test database; do not push to production.
begin;

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null unique,
  full_name text not null check (char_length(full_name) between 2 and 120),
  contact text not null check (
    char_length(contact) between 3 and 254 and
    (contact ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or contact ~ '^\+[1-9][0-9]{7,14}$')
  ),
  organization_name text not null check (char_length(organization_name) between 2 and 160),
  requested_role text not null check (requested_role in ('brand_ambassador', 'client', 'supervisor')),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);
create index access_requests_review_idx on public.access_requests (status, created_at desc);
alter table public.access_requests enable row level security;
revoke all on public.access_requests from public, anon, authenticated;
grant select on public.access_requests to authenticated;
grant select, insert on public.access_requests to service_role;
-- A typed organization name is not proof of membership. Only platform admins
-- may read unverified applications, never other applicants or tenant admins.
create policy access_requests_platform_review on public.access_requests
  for select to authenticated using (public.is_super_admin());

create function public.submit_access_request(
  p_client_request_id uuid,
  p_full_name text,
  p_contact text,
  p_organization_name text,
  p_requested_role text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare request_id uuid;
begin
  -- The server action rate-limits anonymous traffic before using this RPC.
  -- client_request_id is this anonymous operation's receipt: BA receipts require
  -- a real profile and organization, neither of which an applicant has yet.
  insert into public.access_requests
    (client_request_id, full_name, contact, organization_name, requested_role)
  values
    (p_client_request_id, trim(p_full_name), p_contact, trim(p_organization_name), p_requested_role)
  on conflict (client_request_id) do nothing returning id into request_id;

  if request_id is not null then
    insert into public.audit_logs (action, entity_type, entity_id, metadata)
    values ('access_request_submitted', 'access_requests', request_id,
      jsonb_build_object('requested_role', p_requested_role));
  else
    -- Replays are successful only for the same original payload.
    select id into request_id from public.access_requests
    where client_request_id = p_client_request_id
      and full_name = trim(p_full_name) and contact = p_contact
      and organization_name = trim(p_organization_name) and requested_role = p_requested_role;
    if request_id is null then raise exception 'Invalid request receipt'; end if;
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke all on function public.submit_access_request(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_access_request(uuid,text,text,text,text) to service_role;
commit;
