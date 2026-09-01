-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00022 — Veda Activations (school visits + stationery + proof photos)
--
-- Veda activates schools by sending Brand Ambassadors to visit them: the BA
-- checks in at the school (GPS geofence + site selfie + stamped-document
-- photo), records how much stationery was distributed to learners, then checks
-- out. This migration turns the read-only Veda schema from 00010 into the live
-- activation model:
--
--   veda_assignments          → pre-assigned school visits for a BA (period)
--   veda_sessions [+cols]     → a live school visit with check-in/out, GPS,
--                                notes and idempotent client_request_id
--   veda_stationery_items     → the stationery catalogue (org-scoped)
--   veda_session_distributions→ what was handed out per item per session
--   veda_session_photos       → site selfie + stamped document (private)
--   organizations.kind        → 'retail' | 'schools' so clients can branch
--
-- Conventions mirrored from the retail core (00001–00021): SECURITY DEFINER
-- RPCs derive identity from the JWT, recompute the Africa/Nairobi date and
-- haversine geofence server-side, write audit_logs + operation_receipts, and
-- RLS protects every new table. No client-supplied value is trusted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── organization kind (drives the client flow) ──────────────────────────────
alter table public.organizations
  add column if not exists kind text not null default 'retail'
  check (kind in ('retail','schools'));

update public.organizations set kind = 'schools' where slug = 'veda';

-- ── veda_photo_type (proof-of-visit photographs) ────────────────────────────
create type public.veda_photo_type as enum (
  'site_selfie',
  'stamped_document'
);

-- ── assignments: which school a BA must visit, and when ────────────────────
create table public.veda_assignments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  brand_ambassador_id uuid not null references public.profiles(id) on delete cascade,
  school_id           uuid not null references public.veda_schools(id),
  weekly_off_day      smallint check (weekly_off_day between 0 and 6),
  start_date          date not null,
  end_date            date,
  status              assignment_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index veda_assignments_org_idx   on public.veda_assignments (organization_id, status);
create index veda_assignments_ba_idx    on public.veda_assignments (brand_ambassador_id, status);
create index veda_assignments_school_idx on public.veda_assignments (school_id);
-- One active assignment per BA (mirrors assignments_one_active_idx).
create unique index veda_assignments_one_active_idx
  on public.veda_assignments (brand_ambassador_id, organization_id)
  where status = 'active';

-- ── extend veda_sessions into a live activation record ──────────────────────
-- legacy_id only exists for imported history; live sessions do not use it.
-- The existing unique(organization_id, legacy_id) is kept so the CSV importer's
-- ON CONFLICT keeps working — Postgres treats NULL legacy_id rows as distinct.
alter table public.veda_sessions alter column legacy_id drop not null;

alter table public.veda_sessions
  add column checkin_at              timestamptz,
  add column checkout_at             timestamptz,
  add column checkin_latitude        double precision,
  add column checkin_longitude       double precision,
  add column checkout_latitude       double precision,
  add column checkout_longitude      double precision,
  add column checkin_distance_metres double precision,
  add column notes                   text,
  add column client_request_id       uuid;

-- One open (non-cancelled) activation per BA+school+Nairobi date.
create unique index veda_sessions_day_unique_idx
  on public.veda_sessions (brand_ambassador_id, school_id, session_date)
  where status <> 'cancelled';
-- Idempotent offline retries for live activations.
create unique index veda_sessions_client_request_idx
  on public.veda_sessions (client_request_id)
  where client_request_id is not null;

-- ── stationery catalogue ────────────────────────────────────────────────────
create table public.veda_stationery_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name            text not null,
  code            text,
  status          sku_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint veda_stationery_items_unique unique (organization_id, code)
);
create index veda_stationery_items_org_idx on public.veda_stationery_items (organization_id, status);

-- ── what stationery was distributed in a session ────────────────────────────
create table public.veda_session_distributions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id),
  session_id         uuid not null references public.veda_sessions(id) on delete cascade,
  stationery_item_id uuid not null references public.veda_stationery_items(id),
  quantity           integer not null check (quantity between 1 and 100000),
  client_request_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint veda_session_distributions_unique unique (session_id, stationery_item_id)
);
create index veda_session_distributions_org_idx  on public.veda_session_distributions (organization_id);
create index veda_session_distributions_ba_idx   on public.veda_session_distributions (session_id);
create unique index veda_session_distributions_client_request_idx
  on public.veda_session_distributions (client_request_id)
  where client_request_id is not null;

-- ── proof-of-visit photographs (selfie + stamped document) ──────────────────
create table public.veda_session_photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id      uuid not null references public.veda_sessions(id) on delete cascade,
  photo_type      public.veda_photo_type not null,
  storage_path    text not null,
  captured_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint veda_session_photos_unique unique (session_id, photo_type)
);
create index veda_session_photos_org_idx on public.veda_session_photos (organization_id);
create index veda_session_photos_session_idx on public.veda_session_photos (session_id);

-- ── audit + updated_at triggers (mirror platform conventions) ───────────────
create trigger audit_veda_assignments after insert or update or delete on public.veda_assignments
  for each row execute function public.audit_row_change();
create trigger audit_veda_stationery after insert or update or delete on public.veda_stationery_items
  for each row execute function public.audit_row_change();
create trigger audit_veda_distributions after insert or update or delete on public.veda_session_distributions
  for each row execute function public.audit_row_change();
create trigger audit_veda_photos after insert or update or delete on public.veda_session_photos
  for each row execute function public.audit_row_change();

create trigger set_updated_at_veda_assignments before update on public.veda_assignments
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_stationery before update on public.veda_stationery_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_distributions before update on public.veda_session_distributions
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_photos before update on public.veda_session_photos
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.veda_assignments           enable row level security;
alter table public.veda_stationery_items      enable row level security;
alter table public.veda_session_distributions enable row level security;
alter table public.veda_session_photos        enable row level security;

-- Staff of the org may read the org's Veda data.
create policy veda_assignments_select_org on public.veda_assignments
  for select using (public.can_read_org(organization_id));
create policy veda_stationery_select_org on public.veda_stationery_items
  for select using (public.can_read_org(organization_id));
create policy veda_distributions_select_org on public.veda_session_distributions
  for select using (public.can_read_org(organization_id));
create policy veda_photos_select_org on public.veda_session_photos
  for select using (public.can_read_org(organization_id));

-- A session's own BA may read their own activations (self-service).
create policy veda_assignments_self_read on public.veda_assignments
  for select using (brand_ambassador_id = auth.uid());
create policy veda_distributions_self_read on public.veda_session_distributions
  for select using (
    exists (
      select 1 from public.veda_sessions s
      where s.id = session_id and s.brand_ambassador_id = auth.uid()
    )
  );
create policy veda_photos_self_read on public.veda_session_photos
  for select using (
    exists (
      select 1 from public.veda_sessions s
      where s.id = session_id and s.brand_ambassador_id = auth.uid()
    )
  );

-- Org admins may mutate Veda data within their org.
create policy veda_assignments_org_admin_all on public.veda_assignments
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_stationery_org_admin_all on public.veda_stationery_items
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_distributions_org_admin_all on public.veda_session_distributions
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_photos_org_admin_all on public.veda_session_photos
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── grants (authenticated) ──────────────────────────────────────────────────
grant select on public.veda_assignments           to authenticated;
grant select on public.veda_stationery_items      to authenticated;
grant select on public.veda_session_distributions to authenticated;
grant select on public.veda_session_photos        to authenticated;

-- ── schools need a geofence radius to enforce presence; legacy_id is only
-- for imported history, so admin-created schools must not require it ─────────
alter table public.veda_schools alter column legacy_id drop not null;
alter table public.veda_schools
  add column if not exists geofence_radius_metres integer not null default 200
  check (geofence_radius_metres between 20 and 2000);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC layer
-- ═══════════════════════════════════════════════════════════════════════════

-- ── veda_today: what the BA dashboard needs in one call ─────────────────────
create function public.veda_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p            public.profiles;
  nairobi_d    date;
  dow          int;
  a            record;
  s            public.veda_sessions%rowtype;
  dists        jsonb;
  item_rows    jsonb;
  result       jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  nairobi_d := (now() at time zone 'Africa/Nairobi')::date;
  dow       := extract(dow from nairobi_d)::int;

  select va.*, sch.name as school_name, sch.region as school_region,
         sch.latitude as school_latitude, sch.longitude as school_longitude,
         sch.geofence_radius_metres
    into a
  from public.veda_assignments va
  join public.veda_schools sch on sch.id = va.school_id
  where va.brand_ambassador_id = p.id
    and va.organization_id = p.organization_id
    and va.status = 'active'
    and va.start_date <= nairobi_d
    and (va.end_date is null or va.end_date >= nairobi_d)
  order by va.start_date desc
  limit 1;

  if a.id is not null then
    select * into s from public.veda_sessions
    where brand_ambassador_id = p.id
      and school_id = a.school_id
      and session_date = nairobi_d
      and status <> 'cancelled'
    order by created_at desc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'stationery_item_id', d.stationery_item_id,
             'item_name', it.name, 'item_code', it.code, 'quantity', d.quantity)
             order by it.name), '[]'::jsonb)
      into dists
    from public.veda_session_distributions d
    join public.veda_stationery_items it on it.id = d.stationery_item_id
    where d.session_id = s.id;
  else
    dists := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', it.id, 'name', it.name, 'code', it.code)
           order by it.name), '[]'::jsonb)
    into item_rows
  from public.veda_stationery_items it
  where it.organization_id = p.organization_id
    and it.status = 'active';

  result := jsonb_build_object(
    'attendance_date', nairobi_d,
    'weekly_off_day',  a.weekly_off_day,
    'is_weekly_off_today', (a.weekly_off_day is not null and a.weekly_off_day = dow),
    'assignment', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'school_id', a.school_id, 'school_name', a.school_name,
        'school_region', a.school_region, 'school_latitude', a.school_latitude,
        'school_longitude', a.school_longitude, 'geofence_radius_metres', a.geofence_radius_metres) end,
    'session', case when s.id is null then null else to_jsonb(s) - 'client_request_id' end,
    'distributions', dists,
    'stationery_items', item_rows,
    'session_status', s.status,
    'learner_count', s.learner_count
  );
  return result;
end;
$$;

-- ── veda_checkin: open an activation at the assigned school ─────────────────
create function public.veda_checkin(
  p_latitude               double precision,
  p_longitude              double precision,
  p_selfie_photo_path      text,
  p_stamped_document_path  text,
  p_client_request_id      uuid,
  p_accuracy_metres        double precision default null,
  p_learner_count          integer default 0,
  p_notes                  text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.profiles;
  nairobi_d  date;
  dow        int;
  a          record;
  dist       double precision;
  radius     int;
  prior      jsonb;
  session_id uuid;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_checkin', p);
  if prior is not null and prior->>'session_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  nairobi_d := (now() at time zone 'Africa/Nairobi')::date;
  dow       := extract(dow from nairobi_d)::int;

  select va.*, sch.name as school_name, sch.latitude as school_latitude,
         sch.longitude as school_longitude, sch.geofence_radius_metres
    into a
  from public.veda_assignments va
  join public.veda_schools sch on sch.id = va.school_id
  where va.brand_ambassador_id = p.id
    and va.organization_id = p.organization_id
    and va.status = 'active'
    and va.start_date <= nairobi_d
    and (va.end_date is null or va.end_date >= nairobi_d)
  order by va.start_date desc limit 1;

  if a.id is null then
    raise exception 'You have no active school visit today. Please contact your supervisor.';
  end if;

  if a.weekly_off_day = dow then
    raise exception 'Today is your weekly off day (%)',
      (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[a.weekly_off_day + 1];
  end if;

  perform 1 from public.veda_sessions
   where brand_ambassador_id = p.id and school_id = a.school_id
     and session_date = nairobi_d and status <> 'cancelled'
   limit 1;
  if found then
    raise exception 'You have already checked in for this school visit today.';
  end if;

  if not (p_selfie_photo_path like p.organization_id::text || '/' || p.id::text || '/%')
     or not (p_stamped_document_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;

  dist   := public.distance_metres(p_latitude, p_longitude, a.school_latitude, a.school_longitude);
  radius := a.geofence_radius_metres;
  if dist > radius then
    raise exception 'You are % m from % — check-in requires % m or less.',
      round(dist)::int, a.school_name, radius;
  end if;

  insert into public.veda_sessions (
    organization_id, school_id, brand_ambassador_id, session_date,
    learner_count, status, checkin_at,
    checkin_latitude, checkin_longitude, checkin_distance_metres,
    notes, client_request_id
  ) values (
    p.organization_id, a.school_id, p.id, nairobi_d,
    greatest(0, coalesce(p_learner_count, 0)), 'open', now(),
    p_latitude, p_longitude, round(dist::numeric, 1),
    nullif(p_notes, ''), p_client_request_id
  ) returning id into session_id;

  insert into public.veda_session_photos
    (organization_id, session_id, photo_type, storage_path, captured_at)
  values
    (p.organization_id, session_id, 'site_selfie', p_selfie_photo_path, now()),
    (p.organization_id, session_id, 'stamped_document', p_stamped_document_path, now());

  perform public.write_audit('veda_session.checkin', 'veda_sessions', session_id,
    jsonb_build_object('school_id', a.school_id, 'distance_metres', round(dist::numeric,1),
                       'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','veda_checkin',
    'session_id', session_id, 'school_id', a.school_id, 'school_name', a.school_name);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── veda_record_distribution: upsert stationery given out in a session ──────
create function public.veda_record_distribution(
  p_session_id         uuid,
  p_stationery_item_id uuid,
  p_quantity           integer,
  p_client_request_id  uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  s   record;
  itm record;
  prior jsonb;
  did uuid;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_record_distribution', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select vs.* into s from public.veda_sessions vs
   where vs.id = p_session_id and vs.brand_ambassador_id = p.id
     and vs.organization_id = p.organization_id;
  if not found then raise exception 'Visit not found'; end if;
  if s.status <> 'open' then raise exception 'Visit is not open for recording'; end if;

  select it.* into itm from public.veda_stationery_items it
   where it.id = p_stationery_item_id and it.organization_id = p.organization_id
     and it.status = 'active';
  if not found then raise exception 'Stationery item not found or not active'; end if;

  if p_quantity < 1 or p_quantity > 100000 then
    raise exception 'Quantity must be between 1 and 100000';
  end if;

  insert into public.veda_session_distributions
    (organization_id, session_id, stationery_item_id, quantity, client_request_id)
  values
    (p.organization_id, p_session_id, p_stationery_item_id, p_quantity, p_client_request_id)
  on conflict (session_id, stationery_item_id)
    do update set quantity = excluded.quantity, client_request_id = excluded.client_request_id
  returning id into did;

  perform public.write_audit('veda_session.distribution', 'veda_session_distributions', did,
    jsonb_build_object('session_id', p_session_id, 'stationery_item_id', p_stationery_item_id,
                       'quantity', p_quantity));

  prior := jsonb_build_object('status','ok','operation','veda_record_distribution',
    'distribution_id', did);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── veda_remove_distribution: take a line off a session ─────────────────────
create function public.veda_remove_distribution(
  p_session_id         uuid,
  p_stationery_item_id uuid,
  p_client_request_id  uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  s   record;
  prior jsonb;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_remove_distribution', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select vs.* into s from public.veda_sessions vs
   where vs.id = p_session_id and vs.brand_ambassador_id = p.id
     and vs.organization_id = p.organization_id;
  if not found then raise exception 'Visit not found'; end if;
  if s.status <> 'open' then raise exception 'Visit is not open for editing'; end if;

  delete from public.veda_session_distributions
   where session_id = p_session_id and stationery_item_id = p_stationery_item_id;

  perform public.write_audit('veda_session.distribution_removed', 'veda_session_distributions', p_session_id,
    jsonb_build_object('stationery_item_id', p_stationery_item_id));

  prior := jsonb_build_object('status','ok','operation','veda_remove_distribution');
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── veda_checkout: complete the activation ──────────────────────────────────
create function public.veda_checkout(
  p_session_id        uuid,
  p_latitude          double precision,
  p_longitude         double precision,
  p_client_request_id uuid,
  p_accuracy_metres   double precision default null,
  p_notes             text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  s   record;
  did uuid;
  prior jsonb;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_checkout', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select vs.*, sch.latitude as school_latitude, sch.longitude as school_longitude,
         sch.geofence_radius_metres as school_radius
    into s
  from public.veda_sessions vs
  join public.veda_schools sch on sch.id = vs.school_id
   where vs.id = p_session_id and vs.brand_ambassador_id = p.id
     and vs.organization_id = p.organization_id;
  if s.id is null then raise exception 'Visit not found'; end if;
  if s.status <> 'open' then raise exception 'This visit is already complete'; end if;

  if public.distance_metres(p_latitude, p_longitude, s.school_latitude, s.school_longitude)
      > s.school_radius then
    raise exception 'You are too far from the school to check out. Move back within % m.',
      s.school_radius;
  end if;

  update public.veda_sessions set
    status = 'completed',
    checkout_at = now(),
    checkout_latitude = p_latitude,
    checkout_longitude = p_longitude,
    notes = coalesce(nullif(p_notes, ''), notes)
  where id = p_session_id
  returning id into did;

  perform public.write_audit('veda_session.checkout', 'veda_sessions', did,
    jsonb_build_object('accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','veda_checkout',
    'session_id', did, 'school_id', s.school_id);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── admin: upsert a Veda visit assignment ───────────────────────────────────
create function public.veda_admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_school_id           uuid,
  p_weekly_off_day      smallint default null,
  p_start_date          date default null,
  p_end_date            date default null,
  p_status              assignment_status default 'active',
  p_assignment_id       uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  ba    public.profiles;
  sch   record;
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into ba from public.profiles
   where id = p_brand_ambassador_id and role = 'brand_ambassador';
  if actor.role = 'organization_admin' then
    if ba.id is null or ba.organization_id <> actor.organization_id then
      raise exception 'Brand ambassador not in your organization';
    end if;
  elsif ba.id is null then
    raise exception 'Brand ambassador not found';
  end if;

  select * into sch from public.veda_schools
   where id = p_school_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if sch.id is null then raise exception 'School not found or inactive'; end if;

  if p_weekly_off_day is not null and p_weekly_off_day not between 0 and 6 then
    raise exception 'Weekly off day must be 0–6';
  end if;

  if p_assignment_id is null then
    update public.veda_assignments
       set status = 'ended', end_date = least(coalesce(p_start_date - 1, current_date), current_date)
     where brand_ambassador_id = p_brand_ambassador_id and status = 'active';

    insert into public.veda_assignments
      (organization_id, brand_ambassador_id, school_id, weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, p_school_id, p_weekly_off_day,
       coalesce(p_start_date, current_date), p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('veda_assignment.create', 'veda_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'school', p_school_id,
                         'weekly_off_day', p_weekly_off_day));
  else
    update public.veda_assignments set
      school_id = p_school_id, weekly_off_day = p_weekly_off_day,
      start_date = coalesce(p_start_date, start_date),
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);

    v_id := p_assignment_id;
    perform public.write_audit('veda_assignment.update', 'veda_assignments', v_id, null);
  end if;

  return v_id;
end;
$$;

-- ── admin: upsert a stationery catalogue item ───────────────────────────────
create function public.veda_admin_upsert_stationery(
  p_name        text,
  p_code        text default null,
  p_status      sku_status default 'active',
  p_item_id     uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  if p_item_id is null then
    insert into public.veda_stationery_items (organization_id, name, code, status)
    values (actor.organization_id, p_name, nullif(p_code, ''), p_status)
    returning id into v_id;
    perform public.write_audit('veda_stationery.create', 'veda_stationery_items', v_id,
      jsonb_build_object('name', p_name, 'code', p_code));
  else
    update public.veda_stationery_items set
      name = p_name, code = nullif(p_code, ''), status = p_status
     where id = p_item_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is not null then
      perform public.write_audit('veda_stationery.update', 'veda_stationery_items', v_id, null);
    end if;
  end if;

  if v_id is null then raise exception 'Stationery item not found'; end if;
  return v_id;
end;
$$;

-- ── admin: upsert a school venue ────────────────────────────────────────────
create function public.veda_admin_upsert_school(
  p_name                  text,
  p_region                text default null,
  p_latitude              double precision default null,
  p_longitude             double precision default null,
  p_geofence_radius_metres integer default 200,
  p_school_id             uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  if p_geofence_radius_metres not between 20 and 2000 then
    raise exception 'Geofence radius must be 20–2000 m';
  end if;

  if p_school_id is null then
    insert into public.veda_schools
      (organization_id, name, region, latitude, longitude, geofence_radius_metres)
    values
      (actor.organization_id, p_name, nullif(p_region, ''), p_latitude, p_longitude, p_geofence_radius_metres)
    returning id into v_id;
    perform public.write_audit('veda_school.create', 'veda_schools', v_id,
      jsonb_build_object('name', p_name, 'region', p_region));
  else
    update public.veda_schools set
      name = p_name, region = nullif(p_region, ''),
      latitude = p_latitude, longitude = p_longitude,
      geofence_radius_metres = p_geofence_radius_metres
     where id = p_school_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is not null then
      perform public.write_audit('veda_school.update', 'veda_schools', v_id, null);
    end if;
  end if;

  if v_id is null then raise exception 'School not found'; end if;
  return v_id;
end;
$$;

-- ── current_user_org_kind: lets clients pick the right BA flow ──────────────
-- Returns the active organization's kind ('retail' | 'schools') derived from
-- the JWT identity, never from the client.
create function public.current_user_org_kind()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p    public.profiles;
  kind text;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select o.kind into kind from public.organizations o where o.id = p.organization_id;
  return coalesce(kind, 'retail');
end;
$$;

-- ── my_memberships now also reports each brand's kind ───────────────────────
drop function if exists public.my_memberships();
create function public.my_memberships()
returns table (
  organization_id   uuid,
  organization_slug text,
  organization_name text,
  logo_url          text,
  role              app_role,
  account_status    account_status,
  has_code_gate     boolean,
  kind              text
)
language sql stable security definer set search_path = public as $$
  select m.organization_id, o.slug, o.name, o.logo_url,
         m.role, m.account_status, o.has_code_gate, o.kind
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.veda_today(),
  public.veda_checkin(double precision, double precision, text, text, uuid, double precision, integer, text),
  public.veda_record_distribution(uuid, uuid, integer, uuid),
  public.veda_remove_distribution(uuid, uuid, uuid),
  public.veda_checkout(uuid, double precision, double precision, uuid, double precision, text),
  public.veda_admin_upsert_assignment(uuid, uuid, smallint, date, date, assignment_status, uuid),
  public.veda_admin_upsert_stationery(text, text, sku_status, uuid),
  public.veda_admin_upsert_school(text, text, double precision, double precision, integer, uuid),
  public.current_user_org_kind(),
  public.my_memberships()
to authenticated;