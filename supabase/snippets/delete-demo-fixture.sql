-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE THE DEMO FIXTURES
--
-- Two sets of fictitious rows were seeded on 2026-09-11 so the screens could be
-- reviewed before real BAs start using them:
--
--   deadbeef-0000-4000-8000-…  the booklist pipeline fixture (school visits,
--                              jobs, documents, print orders, stage events,
--                              BA targets) plus every storage object it
--                              uploaded - those all carry `deadbeef` in the path.
--   deadbeef-0001-4000-8000-…  the VEDA campaign-board fixture (three [DEMO]
--                              territory hubs, daily logs, sales entries).
--
-- Nothing real matches either pattern, so this removes exactly the fixtures and
-- nothing else.
--
-- Run in the Supabase SQL editor against project lcptkprosdmprizvsgsp.
-- It is a single transaction: if anything fails, nothing is deleted.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── booklist pipeline fixture ───────────────────────────────────────────────
-- Children first: stage events and orders/documents reference jobs.
delete from public.booklist_stage_events
 where job_id::text like 'deadbeef-%';

delete from public.print_orders
 where id::text like 'deadbeef-%';

delete from public.booklist_documents
 where id::text like 'deadbeef-%';

delete from public.booklist_jobs
 where id::text like 'deadbeef-%';

delete from public.ba_school_targets
 where id::text like 'deadbeef-%';

delete from public.school_visits
 where id::text like 'deadbeef-%';

-- ── campaign-board fixture ──────────────────────────────────────────────────
-- sales_entries -> daily_logs -> stores, so the hubs go last.
delete from public.sales_entries
 where daily_log_id::text like 'deadbeef-%';

delete from public.daily_logs
 where id::text like 'deadbeef-%';

delete from public.stores
 where id::text like 'deadbeef-%';

-- The audit_stores trigger logged the three demo hubs as they were created.
delete from public.audit_logs
 where entity_type = 'stores'
   and entity_id::text like 'deadbeef-%';

-- The uploaded artefacts: gate selfies and booklist documents.
delete from storage.objects
 where bucket_id in ('booklist-documents', 'daily-log-photos')
   and name like '%deadbeef%';

commit;

-- Sanity check afterwards — every one of these should return 0:
--   select count(*) from public.school_visits       where id::text like 'deadbeef-%';
--   select count(*) from public.booklist_jobs       where id::text like 'deadbeef-%';
--   select count(*) from public.booklist_documents  where id::text like 'deadbeef-%';
--   select count(*) from public.print_orders        where id::text like 'deadbeef-%';
--   select count(*) from public.booklist_stage_events where job_id::text like 'deadbeef-%';
--   select count(*) from public.ba_school_targets   where id::text like 'deadbeef-%';
--   select count(*) from public.sales_entries       where daily_log_id::text like 'deadbeef-%';
--   select count(*) from public.daily_logs          where id::text like 'deadbeef-%';
--   select count(*) from public.stores              where id::text like 'deadbeef-%';
--   select count(*) from public.audit_logs          where entity_id::text like 'deadbeef-%';
--   select count(*) from storage.objects
--    where bucket_id in ('booklist-documents','daily-log-photos') and name like '%deadbeef%';
