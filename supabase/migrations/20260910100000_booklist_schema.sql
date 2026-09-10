-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — School booklist pipeline: core schema.
--
-- Models the whole engagement from the moment a BA approaches a school to the
-- point where the school-stamped "+1" copy is uploaded as proof of a complete
-- log:
--
--   approach school → gate selfie → ask the principal → DECLINED (record it)
--     or BOOKLIST OFFERED → upload the raw list (photo / scan / PDF /
--     handwritten) → converted to an editable Word document → BA downloads and
--     prints it → school approves and states how many copies it needs →
--     copies ordered → dispatched (means + time) → received → stamped +1 copy
--     uploaded → completed.
--
-- Design notes
--   • `school_visits`  — one row per physical approach. Evidence lives here
--                        (selfie, GPS, person met, decline reason).
--   • `booklist_jobs`  — one row per school engagement: the searchable pipeline
--                        record. At most one non-terminal job per school, so
--                        searching a school always answers "where are they?".
--   • `booklist_documents` — every artefact version (raw, OCR draft, formatted
--                        Word file, stamped proof). One `is_current` per kind.
--   • `print_orders`   — printed-copy lifecycle: order → production → dispatch
--                        (means, carrier, time) → receipt.
--   • `ba_school_targets` — per-BA, per-period school targets.
--
-- Agency: BAs are employed either by Advert Eyes Limited ('ael') or by Veda
-- ('veda'). Both work the same school list; only the strictness differs, so
-- agency is a flag on `profiles` and the rules are per-tenant settings, not a
-- separate organization. AEL = mandatory gate selfie.
--
-- Geofence is ADVISORY: the imported master list has no coordinates, so GPS is
-- captured on every visit and written back to the school the first time.
-- Distance is only enforced once a school actually has coordinates.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Enumerated types ────────────────────────────────────────────────────────
do $$ begin
  create type public.ba_agency as enum ('ael','veda');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_outcome as enum ('pending','booklist_offered','declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.geofence_outcome as enum ('inside','outside','no_coordinates','not_checked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booklist_stage as enum (
    'engaged',                  -- BA approached; selfie + GPS captured
    'declined',                 -- school turned us down (revisitable)
    'booklist_offered',         -- school agreed; raw document not yet uploaded
    'document_received',        -- raw booklist uploaded
    'awaiting_conversion',      -- queued for OCR / admin formatting
    'converting',               -- OCR running, or admin is formatting
    'formatted',                -- editable Word document ready to download
    'pending_school_approval',  -- BA printed it and took it back to the school
    'school_approved',          -- school acknowledged; copy count captured
    'in_production',            -- print order raised with the printer
    'dispatched',               -- sent to the school (means + time recorded)
    'received',                 -- arrived at the school
    'completed',                -- stamped +1 copy uploaded → complete log
    'on_hold',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booklist_document_kind as enum (
    'raw_upload',    -- BA's original: photo, scan, softcopy or handwritten
    'ocr_draft',     -- machine-generated editable draft
    'formatted',     -- admin-finished Word document (the one BAs print)
    'printed_proof', -- photo of the printed run
    'stamped_copy'   -- the school-stamped +1 copy (completion evidence)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ocr_status as enum (
    'not_required','queued','processing','succeeded','failed','manual_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.print_order_status as enum (
    'draft','ordered','in_production','ready','dispatched','received','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispatch_means as enum (
    'courier','boda_boda','own_fleet','ba_pickup','postal','third_party','other'
  );
exception when duplicate_object then null; end $$;

-- ── Agency on profiles ──────────────────────────────────────────────────────
-- Nullable: retail (Lenovo) BAs have no agency. School BAs are backfilled to
-- 'veda' below; admins flip individual BAs to 'ael'.
alter table public.profiles
  add column if not exists agency public.ba_agency;

create index if not exists profiles_agency_idx
  on public.profiles (organization_id, agency)
  where agency is not null;

-- Existing school-org BAs default to Veda. `guard_profile_update` rejects any
-- profiles write whose `auth.uid()` resolves to no profile, and a migration runs
-- as the deploy role, so use the guard's own transaction-local bypass token.
select set_config('fazoo.membership_sync', 'true', true);
update public.profiles pr
   set agency = 'veda'
  from public.organizations o
 where o.id = pr.organization_id
   and o.kind = 'schools'
   and pr.agency is null;
select set_config('fazoo.membership_sync', 'false', true);

-- ── Per-agency visit rules ──────────────────────────────────────────────────
-- Read from organizations.settings -> 'agency_rules' -> <agency>, with safe
-- defaults baked in (AEL requires a selfie; geofence stays advisory).
create or replace function public.ba_visit_rules(p_organization_id uuid, p_agency public.ba_agency)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agency', coalesce(p_agency, 'veda'),
    'selfie_required', coalesce(
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'selfie_required')::boolean
         from public.organizations o where o.id = p_organization_id),
      coalesce(p_agency, 'veda') = 'ael'
    ),
    'geofence_enforced', coalesce(
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'geofence_enforced')::boolean
         from public.organizations o where o.id = p_organization_id),
      false
    ),
    'target_schools_per_month',
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'target_schools_per_month')::integer
         from public.organizations o where o.id = p_organization_id)
  );
$$;

-- ── school_visits ───────────────────────────────────────────────────────────
create table if not exists public.school_visits (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  school_id             uuid not null references public.veda_schools(id) on delete cascade,
  brand_ambassador_id   uuid not null references public.profiles(id) on delete cascade,
  -- Snapshots, so reports stay truthful if agency or rules change later.
  agency                public.ba_agency,
  selfie_required       boolean not null default false,
  visit_date            date not null,
  arrived_at            timestamptz not null default now(),
  outcome               public.visit_outcome not null default 'pending',
  -- presence evidence
  selfie_photo_path     text,
  selfie_captured_at    timestamptz,
  latitude              double precision,
  longitude             double precision,
  accuracy_metres       double precision,
  distance_metres       double precision,
  geofence_status       public.geofence_outcome not null default 'not_checked',
  -- the principal / person in charge actually met
  contact_person_name   text,
  contact_person_role   text,
  contact_person_phone  text,
  -- decline capture
  declined_reason_code  text,
  declined_reason_notes text,
  notes                 text,
  client_request_id     uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint school_visits_lat_range check (latitude  is null or (latitude  between  -90 and  90)),
  constraint school_visits_lng_range check (longitude is null or (longitude between -180 and 180)),
  -- A selfie is mandatory when the agency rule says so.
  constraint school_visits_selfie_enforced
    check (not selfie_required or selfie_photo_path is not null)
);

create unique index if not exists school_visits_client_request_uidx
  on public.school_visits (client_request_id) where client_request_id is not null;
create index if not exists school_visits_org_date_idx
  on public.school_visits (organization_id, visit_date desc);
create index if not exists school_visits_ba_idx
  on public.school_visits (brand_ambassador_id, visit_date desc);
create index if not exists school_visits_school_idx
  on public.school_visits (school_id, visit_date desc);
create index if not exists school_visits_outcome_idx
  on public.school_visits (organization_id, outcome);

-- ── booklist_jobs ───────────────────────────────────────────────────────────
create table if not exists public.booklist_jobs (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  school_id               uuid not null references public.veda_schools(id) on delete cascade,
  stage                   public.booklist_stage not null default 'engaged',
  owner_ba_id             uuid references public.profiles(id) on delete set null,
  latest_visit_id         uuid references public.school_visits(id) on delete set null,
  -- booklist shape (per-grade or one list for the whole school)
  is_per_grade            boolean not null default false,
  grade_notes             text,
  -- copy counts: the school always needs one extra stamped copy.
  copies_requested        integer check (copies_requested is null or copies_requested >= 0),
  copies_to_print         integer generated always as (copies_requested + 1) stored,
  copies_confirmed_at     timestamptz,
  copies_confirmed_by     uuid references public.profiles(id) on delete set null,
  school_acknowledged_by  text,
  approved_by_school_at   timestamptz,
  -- conversion
  ocr_status              public.ocr_status not null default 'not_required',
  converted_at            timestamptz,
  converted_by            uuid references public.profiles(id) on delete set null,
  -- lifecycle stamps
  document_received_at    timestamptz,
  formatted_at            timestamptz,
  dispatched_at           timestamptz,
  received_at             timestamptz,
  completed_at            timestamptz,
  stage_updated_at        timestamptz not null default now(),
  stage_updated_by        uuid references public.profiles(id) on delete set null,
  on_hold_reason          text,
  cancelled_reason        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- At most one live job per school: searching a school must return exactly one
-- "where are they in the process?" answer. Terminal jobs free the slot so a
-- school can be re-engaged in a later term.
create unique index if not exists booklist_jobs_one_active_per_school
  on public.booklist_jobs (organization_id, school_id)
  where stage not in ('completed','cancelled');
create index if not exists booklist_jobs_org_stage_idx
  on public.booklist_jobs (organization_id, stage);
create index if not exists booklist_jobs_owner_idx
  on public.booklist_jobs (owner_ba_id, stage);
create index if not exists booklist_jobs_school_idx
  on public.booklist_jobs (school_id);

-- ── booklist_documents ──────────────────────────────────────────────────────
create table if not exists public.booklist_documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  job_id            uuid not null references public.booklist_jobs(id) on delete cascade,
  visit_id          uuid references public.school_visits(id) on delete set null,
  kind              public.booklist_document_kind not null,
  storage_bucket    text not null default 'booklist-documents',
  storage_path      text not null,
  mime_type         text,
  file_size_bytes   bigint check (file_size_bytes is null or file_size_bytes >= 0),
  page_count        integer check (page_count is null or page_count >= 0),
  -- how the school handed it over
  source_format     text,
  captured_on_site  boolean not null default false,
  uploaded_by       uuid references public.profiles(id) on delete set null,
  is_current        boolean not null default true,
  ocr_status        public.ocr_status not null default 'not_required',
  ocr_provider      text,
  ocr_confidence    numeric(5,2) check (ocr_confidence is null or (ocr_confidence between 0 and 100)),
  ocr_error         text,
  ocr_started_at    timestamptz,
  ocr_finished_at   timestamptz,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One current artefact per kind; superseded versions are kept for the audit
-- trail with is_current = false.
create unique index if not exists booklist_documents_one_current_per_kind
  on public.booklist_documents (job_id, kind) where is_current;
create unique index if not exists booklist_documents_client_request_uidx
  on public.booklist_documents (client_request_id) where client_request_id is not null;
create index if not exists booklist_documents_job_idx
  on public.booklist_documents (job_id, kind);
create index if not exists booklist_documents_ocr_queue_idx
  on public.booklist_documents (organization_id, ocr_status, created_at)
  where kind = 'raw_upload' and is_current;

alter table public.booklist_jobs
  add column if not exists raw_document_id       uuid references public.booklist_documents(id) on delete set null,
  add column if not exists formatted_document_id uuid references public.booklist_documents(id) on delete set null,
  add column if not exists stamped_document_id   uuid references public.booklist_documents(id) on delete set null;

-- ── print_orders ────────────────────────────────────────────────────────────
create table if not exists public.print_orders (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  job_id                uuid not null references public.booklist_jobs(id) on delete cascade,
  reference             text,
  printer_name          text,
  quantity              integer not null check (quantity > 0),
  includes_stamped_copy boolean not null default true,
  status                public.print_order_status not null default 'draft',
  ordered_by            uuid references public.profiles(id) on delete set null,
  ordered_at            timestamptz,
  production_started_at timestamptz,
  ready_at              timestamptz,
  -- dispatch: by which means, and when
  dispatched_at         timestamptz,
  dispatch_means        public.dispatch_means,
  dispatch_carrier      text,
  dispatch_tracking_ref text,
  dispatched_by         uuid references public.profiles(id) on delete set null,
  dispatch_notes        text,
  -- receipt
  received_at           timestamptz,
  received_by           uuid references public.profiles(id) on delete set null,
  receipt_notes         text,
  cancelled_reason      text,
  client_request_id     uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint print_orders_dispatch_coherent
    check (dispatched_at is null or (dispatch_means is not null and dispatched_by is not null))
);

create unique index if not exists print_orders_client_request_uidx
  on public.print_orders (client_request_id) where client_request_id is not null;
create index if not exists print_orders_job_idx
  on public.print_orders (job_id, created_at desc);
create index if not exists print_orders_org_status_idx
  on public.print_orders (organization_id, status);

-- ── booklist_stage_events (pipeline timeline) ───────────────────────────────
create table if not exists public.booklist_stage_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id          uuid not null references public.booklist_jobs(id) on delete cascade,
  from_stage      public.booklist_stage,
  to_stage        public.booklist_stage not null,
  changed_by      uuid references public.profiles(id) on delete set null,
  changed_by_role public.app_role,
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists booklist_stage_events_job_idx
  on public.booklist_stage_events (job_id, created_at);

-- ── ba_school_targets ───────────────────────────────────────────────────────
create table if not exists public.ba_school_targets (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  brand_ambassador_id uuid not null references public.profiles(id) on delete cascade,
  agency              public.ba_agency,
  period_start        date not null,
  period_end          date not null,
  target_schools      integer not null check (target_schools >= 0),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ba_school_targets_period_valid check (period_end >= period_start)
);
create unique index if not exists ba_school_targets_one_per_period_uidx
  on public.ba_school_targets (brand_ambassador_id, period_start, period_end);
create index if not exists ba_school_targets_org_idx
  on public.ba_school_targets (organization_id, period_start, period_end);

-- ── Triggers: updated_at + audit ────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'school_visits','booklist_jobs','booklist_documents',
    'print_orders','ba_school_targets'
  ] loop
    execute format('drop trigger if exists set_updated_at_%s on public.%I', t, t);
    execute format('create trigger set_updated_at_%s before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ── School coordinate backfill ──────────────────────────────────────────────
-- The imported master list has no GPS. The first visit that carries a fix
-- enriches the school, so geofencing becomes meaningful over time without
-- blocking anyone on day one.
create or replace function public.backfill_school_coordinates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.latitude is not null and new.longitude is not null then
    update public.veda_schools s
       set latitude  = new.latitude,
           longitude = new.longitude,
           updated_at = now()
     where s.id = new.school_id
       and s.latitude is null
       and s.longitude is null;
  end if;
  return new;
end;
$$;

drop trigger if exists school_visits_backfill_coords on public.school_visits;
create trigger school_visits_backfill_coords
  after insert on public.school_visits
  for each row execute function public.backfill_school_coordinates();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.school_visits         enable row level security;
alter table public.booklist_jobs         enable row level security;
alter table public.booklist_documents    enable row level security;
alter table public.print_orders          enable row level security;
alter table public.booklist_stage_events enable row level security;
alter table public.ba_school_targets     enable row level security;

-- Operational tables are SELECT-only: every mutation flows through the
-- SECURITY DEFINER RPCs, which derive identity from the JWT and write audit.

drop policy if exists school_visits_select on public.school_visits;
create policy school_visits_select on public.school_visits
  for select to authenticated using (
    public.can_read_org(organization_id)
    or brand_ambassador_id = auth.uid()
  );

drop policy if exists booklist_jobs_select on public.booklist_jobs;
create policy booklist_jobs_select on public.booklist_jobs
  for select to authenticated using (
    public.can_read_org(organization_id)
    or owner_ba_id = auth.uid()
    or exists (
      select 1 from public.school_visits v
      where v.id = latest_visit_id and v.brand_ambassador_id = auth.uid()
    )
  );

-- Documents may be read by org staff and by the BA who owns the job, so a BA
-- can download the formatted Word file the admin produced.
drop policy if exists booklist_documents_select on public.booklist_documents;
create policy booklist_documents_select on public.booklist_documents
  for select to authenticated using (
    public.can_read_org(organization_id)
    or exists (
      select 1 from public.booklist_jobs j
      where j.id = job_id and j.owner_ba_id = auth.uid()
    )
  );

drop policy if exists print_orders_select on public.print_orders;
create policy print_orders_select on public.print_orders
  for select to authenticated using (
    public.can_read_org(organization_id)
    or exists (
      select 1 from public.booklist_jobs j
      where j.id = job_id and j.owner_ba_id = auth.uid()
    )
  );

drop policy if exists booklist_stage_events_select on public.booklist_stage_events;
create policy booklist_stage_events_select on public.booklist_stage_events
  for select to authenticated using (
    public.can_read_org(organization_id)
    or exists (
      select 1 from public.booklist_jobs j
      where j.id = job_id and j.owner_ba_id = auth.uid()
    )
  );

drop policy if exists ba_school_targets_select on public.ba_school_targets;
create policy ba_school_targets_select on public.ba_school_targets
  for select to authenticated using (
    public.can_read_org(organization_id)
    or brand_ambassador_id = auth.uid()
  );

-- ── Storage: private documents bucket ───────────────────────────────────────
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  insert into storage.buckets (id, name, public)
  values ('booklist-documents', 'booklist-documents', false)
  on conflict (id) do nothing;
end $$;

-- Path convention mirrors the photo buckets: {organization_id}/{auth_uid}/{file}
drop policy if exists booklist_docs_upload_own_folder on storage.objects;
create policy booklist_docs_upload_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booklist-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id::text = (storage.foldername(name))[1]
        and p.account_status in ('pending','approved')
    )
  );

-- Read your own uploads.
drop policy if exists booklist_docs_read_own on storage.objects;
create policy booklist_docs_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booklist-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Read a document attached to a job you are allowed to see. SECURITY DEFINER
-- helper avoids RLS recursion between storage.objects and the public tables.
create or replace function public.can_read_booklist_document(p_object_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.booklist_documents d
    join public.booklist_jobs j on j.id = d.job_id
    join public.profiles p      on p.id = auth.uid()
    where d.storage_path = p_object_name
      and d.organization_id = p.organization_id
      and p.account_status = 'approved'
      and (
        p.role in ('super_admin','organization_admin','supervisor')
        or (p.role = 'brand_ambassador' and j.owner_ba_id = p.id)
      )
  );
$$;

drop policy if exists booklist_docs_read_job on storage.objects;
create policy booklist_docs_read_job on storage.objects
  for select to authenticated
  using (
    bucket_id = 'booklist-documents'
    and public.can_read_booklist_document(name)
  );

-- Replace your own upload while re-taking it on site.
drop policy if exists booklist_docs_delete_own on storage.objects;
create policy booklist_docs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'booklist-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Fuzzy school search support (best effort) ───────────────────────────────
-- 4,782 schools today and growing as BAs add their own. pg_trgm makes the
-- infix ILIKE search index-backed; if the extension is unavailable the RPC
-- still works, just with a sequential scan.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    return;
  end if;
  begin
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension pg_trgm with schema extensions;
    else
      create extension pg_trgm;
    end if;
  exception when others then
    raise notice 'pg_trgm unavailable (%); school search falls back to ILIKE scan.', sqlerrm;
  end;
end $$;

do $$
declare trgm_schema text;
begin
  create index if not exists veda_schools_region_idx
    on public.veda_schools (organization_id, region);

  -- Supabase installs pg_trgm into `extensions`, which is not on the migration
  -- role's search_path, so the operator class has to be schema-qualified.
  select n.nspname into trgm_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if trgm_schema is null then
    raise notice 'pg_trgm not installed; school search falls back to an ILIKE scan.';
    return;
  end if;

  begin
    execute format(
      'create index if not exists veda_schools_name_trgm_idx
         on public.veda_schools using gin (name %I.gin_trgm_ops)',
      trgm_schema
    );
  exception when others then
    raise notice 'trigram index skipped (%); school search falls back to an ILIKE scan.', sqlerrm;
  end;
end $$;

commit;
