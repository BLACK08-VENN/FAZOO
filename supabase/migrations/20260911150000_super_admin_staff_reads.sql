-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — let platform super admins read daily logs and assignments
--
-- `can_read_org()` already treats super_admin as staff for every tenant table,
-- and leave_requests_select_staff spells the same intent out as
-- `current_user_role_hint() in ('super_admin','organization_admin')`. These two
-- policies were the exceptions: they enumerated only organization_admin and
-- (scoped) supervisor, so a platform super admin could open a campaign and see
-- its stores, SKUs and assignments but zero daily logs — the board rendered
-- "Daily logs (0 dates)" and every SKU showed 0 units sold.
--
-- drop + create (rather than alter) keeps the statement idempotent and
-- reconciles environments where the policy was hand-edited.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists daily_logs_select_admin on public.daily_logs;
create policy daily_logs_select_admin on public.daily_logs
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() in ('super_admin', 'organization_admin')
      or (
        current_user_role_hint() = 'supervisor'
        and public.supervisor_can_see_store(auth.uid(), store_id)
      )
    )
  );

drop policy if exists assignments_select_admin on public.brand_ambassador_assignments;
create policy assignments_select_admin on public.brand_ambassador_assignments
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() in ('super_admin', 'organization_admin')
      or (
        current_user_role_hint() = 'supervisor'
        and (
          public.supervisor_can_see_store(auth.uid(), store_id)
          or public.supervisor_can_see_campaign(auth.uid(), campaign_id)
        )
      )
    )
  );
