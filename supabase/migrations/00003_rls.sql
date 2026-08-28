-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00003 — Row-Level Security on every table + private storage buckets.
--
-- Model:
--   • BA mutations NEVER touch tables directly — they run through the
--     SECURITY DEFINER RPCs in 00004, which authorize internally.
--   • SELECT policies below give each role the narrowest read it needs.
--   • Admin-curated tables (campaigns/stores/skus/assignments) accept direct
--     writes from org admins; audit triggers record every change.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organizations                  enable row level security;
alter table public.profiles                       enable row level security;
alter table public.campaigns                      enable row level security;
alter table public.stores                         enable row level security;
alter table public.brand_ambassador_assignments   enable row level security;
alter table public.skus                           enable row level security;
alter table public.daily_logs                     enable row level security;
alter table public.sales_entries                  enable row level security;
alter table public.daily_log_photos               enable row level security;
alter table public.supervisor_scopes              enable row level security;
alter table public.operation_receipts             enable row level security;
alter table public.audit_logs                     enable row level security;

-- No RLS on private.rate_limits (never exposed via PostgREST; not in the
-- `public` schema so the API cannot reach it at all).

-- ── organizations ───────────────────────────────────────────────────────────
create policy organizations_read_member on public.organizations
  for select using (
    public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organizations.id
    )
  );

create policy organizations_update_super on public.organizations
  for update using (public.is_super_admin());

-- ── profiles ────────────────────────────────────────────────────────────────
create policy profiles_select_scoped on public.profiles
  for select using (
    id = auth.uid()
    or public.can_read_org(organization_id)
  );
create policy profiles_select_super on public.profiles
  for select using (public.is_super_admin());

create policy profiles_update_self_limited on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- Column safety is enforced by trigger guard_profile_update (00002).
create policy profiles_update_org_admin on public.profiles
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy profiles_update_super on public.profiles
  for update using (public.is_super_admin());

-- INSERT/DELETE: none for authenticated users. Rows are created by the
-- definer signup trigger or by platform provisioning only.

-- ── campaigns ───────────────────────────────────────────────────────────────
create policy campaigns_select_scoped on public.campaigns
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() <> 'supervisor'
      or public.supervisor_can_see_campaign(auth.uid(), id)
    )
  );
create policy campaigns_write_admin on public.campaigns
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── stores ──────────────────────────────────────────────────────────────────
create policy stores_select_scoped on public.stores
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() <> 'supervisor'
      or public.supervisor_can_see_store(auth.uid(), id)
    )
  );
create policy stores_write_admin on public.stores
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── skus ────────────────────────────────────────────────────────────────────
create policy skus_select_scoped on public.skus
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() <> 'supervisor'
      or public.supervisor_can_see_campaign(auth.uid(), campaign_id)
    )
  );
create policy skus_write_admin on public.skus
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── assignments ─────────────────────────────────────────────────────────────
create policy assignments_select_own on public.brand_ambassador_assignments
  for select using (brand_ambassador_id = auth.uid());
create policy assignments_select_admin on public.brand_ambassador_assignments
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() = 'organization_admin'
      or (
        current_user_role_hint() = 'supervisor'
        and (
          public.supervisor_can_see_store(auth.uid(), store_id)
          or public.supervisor_can_see_campaign(auth.uid(), campaign_id)
        )
      )
    )
  );
create policy assignments_write_admin on public.brand_ambassador_assignments
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── daily_logs (read-only through RLS; writes via RPC) ──────────────────────
create policy daily_logs_select_own on public.daily_logs
  for select using (
    brand_ambassador_id = auth.uid()
    and account_status_active()
  );
create policy daily_logs_select_admin on public.daily_logs
  for select using (
    public.can_read_org(organization_id)
    and (
      current_user_role_hint() = 'organization_admin'
      or (
        current_user_role_hint() = 'supervisor'
        and public.supervisor_can_see_store(auth.uid(), store_id)
      )
    )
  );

-- ── sales_entries (read via parent log scoping; writes via RPC) ────────────
create policy sales_entries_select_scoped on public.sales_entries
  for select using (
    exists (
      select 1 from public.daily_logs d
      where d.id = daily_log_id
        and (
          (d.brand_ambassador_id = auth.uid() and account_status_active())
          or public.can_read_org(sales_entries.organization_id)
        )
    )
  );

-- ── daily_log_photos ────────────────────────────────────────────────────────
create policy photos_select_scoped on public.daily_log_photos
  for select using (
    exists (
      select 1 from public.daily_logs d
      where d.id = daily_log_id
        and (
          (d.brand_ambassador_id = auth.uid() and account_status_active())
          or public.can_read_org(daily_log_photos.organization_id)
        )
    )
  );

-- ── supervisor_scopes ───────────────────────────────────────────────────────
create policy scopes_select_admin on public.supervisor_scopes
  for select using (public.is_org_admin(organization_id) or supervisor_id = auth.uid());
create policy scopes_write_admin on public.supervisor_scopes
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── operation_receipts ──────────────────────────────────────────────────────
create policy receipts_select_own on public.operation_receipts
  for select using (brand_ambassador_id = auth.uid());
create policy receipts_select_admin on public.operation_receipts
  for select using (public.can_read_org(organization_id));

-- ── audit_logs (read-only; written by definer functions) ────────────────────
create policy audit_select_admin on public.audit_logs
  for select using (public.is_org_admin(organization_id));

-- Storage policies are in 00008_storage.sql (conditional on storage schema).
