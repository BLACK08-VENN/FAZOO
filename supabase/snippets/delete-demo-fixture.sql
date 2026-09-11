-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE THE DEMO BOOKLIST FIXTURE
--
-- The fictitious logs seeded on 2026-09-11 (so the pipeline could be reviewed
-- before real BAs start using it) all carry ids in the reserved
-- `deadbeef-0000-4000-8000-…` range, and every storage object they uploaded has
-- `deadbeef` in its path. Nothing real matches either pattern, so this removes
-- exactly the fixture and nothing else.
--
-- Run in the Supabase SQL editor against project lcptkprosdmprizvsgsp.
-- It is a single transaction: if anything fails, nothing is deleted.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

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
--   select count(*) from storage.objects
--    where bucket_id in ('booklist-documents','daily-log-photos') and name like '%deadbeef%';
