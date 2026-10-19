-- Fazoo 20261019 — leave requests for store-less assignments
--
-- Veda (schools) BAs have no store: brand_ambassador_assignments.store_id was
-- made nullable in 20260909130000, but ba_submit_leave_request (00025) copies
-- the assignment's store straight into leave_requests.store_id. The remote
-- database already accepted NULL here (drifted); this migration makes the
-- canonical schema match so fresh environments can submit leave from
-- store-less assignments instead of failing the NOT NULL constraint.

alter table public.leave_requests alter column store_id drop not null;
