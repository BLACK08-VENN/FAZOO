-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00006 — Grant permissions to the authenticated role.
--
-- PostgREST resolves permissions through role grants + RLS policies.
-- This migration grants the minimum required access so that the
-- SECURITY DEFINER RPCs and RLS SELECT policies work correctly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Table-level SELECT grants ────────────────────────────────────────────────
GRANT SELECT ON public.organizations              TO authenticated;
GRANT SELECT ON public.profiles                   TO authenticated;
GRANT SELECT ON public.campaigns                  TO authenticated;
GRANT SELECT ON public.stores                     TO authenticated;
GRANT SELECT ON public.brand_ambassador_assignments TO authenticated;
GRANT SELECT ON public.skus                       TO authenticated;
GRANT SELECT ON public.daily_logs                 TO authenticated;
GRANT SELECT ON public.sales_entries              TO authenticated;
GRANT SELECT ON public.daily_log_photos           TO authenticated;
GRANT SELECT ON public.supervisor_scopes          TO authenticated;
GRANT SELECT ON public.operation_receipts         TO authenticated;
GRANT SELECT ON public.audit_logs                 TO authenticated;

-- ── Function-level EXECUTE grants ────────────────────────────────────────────
-- Helper functions used in RLS policies
GRANT EXECUTE ON FUNCTION public.account_status_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role_hint() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_can_see_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_can_see_campaign(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distance_metres(double precision, double precision, double precision, double precision) TO authenticated;

-- BA RPCs
GRANT EXECUTE ON FUNCTION public.ba_today() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_checkin(double precision, double precision, text, text, uuid, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_checkout(double precision, double precision, uuid, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_record_sale(uuid, integer, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_update_sale(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_delete_sale(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ba_mark_sick_leave(text, uuid) TO authenticated;

-- Admin RPCs
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_assignment(uuid, uuid, uuid, smallint, date, date, assignment_status, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reopen_daily_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit(text, text, uuid, jsonb, uuid, uuid) TO authenticated;

-- Receipt management
GRANT EXECUTE ON FUNCTION public.complete_receipt(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_consume_receipt(uuid, text, profiles) TO authenticated;
