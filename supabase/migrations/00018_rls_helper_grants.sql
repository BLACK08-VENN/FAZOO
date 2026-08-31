-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00018 — (Re)grant RLS helper EXECUTE to the authenticated role.
--
-- Healing migration. Earlier deployments of this project (remote project
-- `lcptkprosdmprizvsgsp`) landed RLS + table grants but lost the function
-- EXECUTE grants declared in 00006 (and later per-migration grants), so
-- policy evaluation failed with `permission denied for function
-- is_super_admin` for authenticated users, breaking sign-in and profile
-- reads everywhere.
--
-- Every grant below is conditional on the function existing with that exact
-- signature, so this migration is idempotent and safe to run on any remote,
-- regardless of how far behind its migration history is.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  -- public.schema: signature pairs. to_regprocedure returns NULL when the
  -- overload does not exist (e.g. future signature migrations), so each
  -- grant is applied only if it is meaningful on this database.
  sig text;
  sigs text[] := array[
    -- RLS helpers used inside SELECT policies
    'account_status_active()',
    'current_profile()',
    'can_read_org(uuid)',
    'is_super_admin()',
    'current_user_role_hint()',
    'is_org_admin(uuid)',
    'supervisor_can_see_store(uuid, uuid)',
    'supervisor_can_see_campaign(uuid, uuid)',
    'distance_metres(double precision, double precision, double precision, double precision)',
    -- BA RPCs (ba_checkout included for both pre- and post-photo signatures)
    'ba_today()',
    'ba_checkin(double precision, double precision, text, text, uuid, double precision, text)',
    'ba_checkout(double precision, double precision, uuid, double precision, text)',
    'ba_checkout(double precision, double precision, uuid, text, text, double precision, text)',
    'ba_record_sale(uuid, integer, uuid, timestamp with time zone)',
    'ba_update_sale(uuid, integer, uuid)',
    'ba_delete_sale(uuid, uuid)',
    'ba_mark_sick_leave(text, uuid)',
    'ba_submit_leave_request(public.leave_type, date, date, date, boolean, text, text, text[], boolean, uuid)',
    'ba_my_history(integer)',
    -- Admin RPCs
    'admin_set_account_status(uuid, text, text)',
    'admin_upsert_assignment(uuid, uuid, uuid, smallint, date, date, assignment_status, uuid)',
    'admin_reopen_daily_log(uuid)',
    'admin_review_leave_request(uuid, text, text)',
    'admin_list_pending_memberships()',
    -- Client-role helpers
    'is_client()',
    'is_org_client(uuid)',
    -- Org memberships / brand setup
    'my_memberships()',
    'joinable_brands()',
    'ba_unlock_brand(uuid, text)',
    'ba_switch_brand(uuid)',
    'ba_request_org_membership(uuid, text)',
    'create_brand(text, text, uuid, text, date, text, text, date, text, text, double precision, double precision, int, uuid[], smallint)',
    -- Shared utilities
    'check_rate_limit(text, integer, integer)',
    'write_audit(text, text, uuid, jsonb, uuid, uuid)',
    'complete_receipt(uuid, jsonb)',
    'try_consume_receipt(uuid, text, profiles)'
  ];
begin
  foreach sig in array sigs loop
    if to_regprocedure('public.' || sig) is not null then
      execute 'grant execute on function public.' || sig || ' to authenticated';
    end if;
  end loop;
end $$;

-- joinable_brands is also intentionally callable while unauthenticated.
do $$
declare
  sig text := 'joinable_brands()';
begin
  if to_regprocedure('public.' || sig) is not null then
    execute 'grant execute on function public.' || sig || ' to anon, authenticated';
  end if;
end $$;