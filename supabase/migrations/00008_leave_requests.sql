-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00008 — leave request workflow
-- BA submissions and admin decisions are RPC-only, tenant-scoped and audited.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.leave_type as enum (
  'annual_leave',
  'sick_leave',
  'paternity_leave',
  'maternity_leave',
  'casual_leave',
  'other'
);

create type public.leave_request_status as enum (
  'pending',
  'approved',
  'denied',
  'cancelled'
);

create table public.leave_requests (
  id                              uuid primary key default gen_random_uuid(),
  organization_id                 uuid not null references public.organizations(id),
  brand_ambassador_id             uuid not null references public.profiles(id) on delete cascade,
  store_id                        uuid not null references public.stores(id),
  assignment_id                   uuid not null references public.brand_ambassador_assignments(id),
  leave_type                      public.leave_type not null,
  start_date                      date not null,
  end_date                        date not null,
  expected_return_date            date not null,
  supervisor_informed             boolean not null,
  supervisor_not_informed_reason  text,
  reason                          text not null,
  supporting_document_types       text[] not null default '{}',
  policy_acknowledged_at          timestamptz not null,
  status                          public.leave_request_status not null default 'pending',
  reviewed_by                     uuid references public.profiles(id) on delete set null,
  reviewed_at                     timestamptz,
  review_note                     text,
  client_request_id               uuid not null unique,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint leave_requests_date_order check (start_date <= end_date),
  constraint leave_requests_return_after_leave check (expected_return_date > end_date),
  constraint leave_requests_reason_length check (char_length(btrim(reason)) between 5 and 2000),
  constraint leave_requests_supervisor_reason check (
    supervisor_informed
    or char_length(btrim(coalesce(supervisor_not_informed_reason, ''))) between 5 and 500
  ),
  constraint leave_requests_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index leave_requests_org_status_idx
  on public.leave_requests (organization_id, status, created_at desc);
create index leave_requests_ba_idx
  on public.leave_requests (brand_ambassador_id, created_at desc);
create index leave_requests_store_idx
  on public.leave_requests (store_id, start_date, end_date);

create trigger set_updated_at_leave_requests
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;

create policy leave_requests_select_own on public.leave_requests
  for select using (
    brand_ambassador_id = auth.uid()
    and public.account_status_active()
  );

create policy leave_requests_select_staff on public.leave_requests
  for select using (
    public.can_read_org(organization_id)
    and (
      public.current_user_role_hint() in ('super_admin', 'organization_admin')
      or (
        public.current_user_role_hint() = 'supervisor'
        and public.supervisor_can_see_store(auth.uid(), store_id)
      )
    )
  );

-- No direct INSERT/UPDATE/DELETE policies: all mutations use the RPCs below.

create function public.ba_submit_leave_request(
  p_leave_type                       public.leave_type,
  p_start_date                       date,
  p_end_date                         date,
  p_expected_return_date             date,
  p_supervisor_informed              boolean,
  p_supervisor_not_informed_reason   text,
  p_reason                           text,
  p_supporting_document_types        text[],
  p_policy_acknowledged              boolean,
  p_client_request_id                uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  a          public.brand_ambassador_assignments;
  request_id uuid;
  prior      jsonb;
  lagos_d    date := (now() at time zone 'Africa/Lagos')::date;
begin
  p := public.assert_active_ba();

  if p_client_request_id is null then
    raise exception 'A client request id is required.';
  end if;

  prior := public.try_consume_receipt(p_client_request_id, 'submit_leave_request', p);
  if prior is not null and prior->>'status' = 'ok' then return prior; end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
    prior := public.try_consume_receipt(p_client_request_id, 'submit_leave_request', p);
  elsif prior is not null then
    return prior;
  end if;

  if p_start_date < lagos_d then raise exception 'Leave cannot start in the past.'; end if;
  if p_end_date < p_start_date then raise exception 'End date must be on or after start date.'; end if;
  if p_expected_return_date <= p_end_date then
    raise exception 'Expected return date must be after the leave ends.';
  end if;
  if p_end_date - p_start_date > 365 then raise exception 'Leave period is too long.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 2000 then
    raise exception 'Reason must be between 5 and 2000 characters.';
  end if;
  if not p_supervisor_informed and
     char_length(btrim(coalesce(p_supervisor_not_informed_reason, ''))) not between 5 and 500 then
    raise exception 'Explain why your supervisor has not been informed.';
  end if;
  if not coalesce(p_policy_acknowledged, false) then
    raise exception 'Leave policy acknowledgement is required.';
  end if;

  select * into a
  from public.brand_ambassador_assignments
  where brand_ambassador_id = p.id
    and organization_id = p.organization_id
    and status = 'active'
    and start_date <= p_start_date
    and (end_date is null or end_date >= p_start_date)
  order by start_date desc
  limit 1;

  if a.id is null then raise exception 'You have no active assignment for the leave start date.'; end if;

  if exists (
    select 1 from public.leave_requests lr
    where lr.brand_ambassador_id = p.id
      and lr.status in ('pending', 'approved')
      and daterange(lr.start_date, lr.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'A pending or approved request already overlaps these dates.';
  end if;

  insert into public.leave_requests (
    organization_id, brand_ambassador_id, store_id, assignment_id,
    leave_type, start_date, end_date, expected_return_date,
    supervisor_informed, supervisor_not_informed_reason, reason,
    supporting_document_types, policy_acknowledged_at, client_request_id
  ) values (
    p.organization_id, p.id, a.store_id, a.id,
    p_leave_type, p_start_date, p_end_date, p_expected_return_date,
    p_supervisor_informed,
    case when p_supervisor_informed then null else nullif(btrim(p_supervisor_not_informed_reason), '') end,
    btrim(p_reason),
    coalesce(p_supporting_document_types, '{}'), now(), p_client_request_id
  ) returning id into request_id;

  perform public.write_audit(
    'leave_request.submit', 'leave_requests', request_id,
    jsonb_build_object(
      'leave_type', p_leave_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'store_id', a.store_id
    )
  );

  prior := jsonb_build_object(
    'status', 'ok',
    'operation', 'submit_leave_request',
    'leave_request_id', request_id
  );
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

create function public.admin_review_leave_request(
  p_leave_request_id uuid,
  p_decision         text,
  p_review_note      text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor  public.profiles;
  target public.leave_requests;
  next_status public.leave_request_status;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not permitted.';
  end if;

  select * into target from public.leave_requests where id = p_leave_request_id for update;
  if target.id is null then raise exception 'Leave request not found.'; end if;
  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied.';
  end if;
  if target.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;

  next_status := case lower(btrim(p_decision))
    when 'approve' then 'approved'::public.leave_request_status
    when 'deny' then 'denied'::public.leave_request_status
    else null
  end;
  if next_status is null then raise exception 'Decision must be approve or deny.'; end if;
  if next_status = 'denied' and char_length(btrim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'A denial reason is required.';
  end if;

  update public.leave_requests
  set status = next_status,
      reviewed_by = actor.id,
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), '')
  where id = target.id;

  perform public.write_audit(
    'leave_request.' || next_status::text, 'leave_requests', target.id,
    jsonb_build_object('decision', next_status, 'review_note', nullif(btrim(p_review_note), ''))
  );

  return jsonb_build_object(
    'status', 'ok',
    'leave_request_id', target.id,
    'decision', next_status
  );
end;
$$;

grant select on public.leave_requests to authenticated;
grant execute on function public.ba_submit_leave_request(
  public.leave_type, date, date, date, boolean, text, text, text[], boolean, uuid
) to authenticated;
grant execute on function public.admin_review_leave_request(uuid, text, text) to authenticated;
