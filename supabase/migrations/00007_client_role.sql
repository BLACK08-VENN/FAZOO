-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00007 — Add `client` role for the Brand Dashboard.
--
-- The `client` role is a read-only stakeholder view: campaign performance,
-- store metrics, BA activity.  No mutations, no settings, no audit logs.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Extend the enum
alter type public.app_role add value if not exists 'client' after 'brand_ambassador';

-- PostgreSQL requires a newly-added enum value to be committed before it can
-- be referenced by functions and policies later in the migration.
commit;
begin;

-- 2. Helper: is the caller a client?
create function public.is_client()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'client' and account_status = 'approved'
  );
$$;

-- 3. Helper: is the caller a client in this org?
create function public.is_org_client(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and organization_id = p_organization_id
      and role = 'client'
      and account_status = 'approved'
  );
$$;

-- 4. Extend can_read_org so clients can read their org
create or replace function public.can_read_org(p_organization_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status in ('approved')
      and (
        role = 'super_admin'
        or (organization_id = p_organization_id
            and role in ('organization_admin','supervisor','client'))
      )
  );
$$;

-- 5. Client read-only policies (additive — existing policies still apply)
create policy client_read_organizations on public.organizations
  for select using (public.is_org_client(id));

create policy client_read_profiles on public.profiles
  for select using (
    public.is_org_client(organization_id)
    and role = 'brand_ambassador'
  );

create policy client_read_campaigns on public.campaigns
  for select using (public.is_org_client(organization_id));

create policy client_read_stores on public.stores
  for select using (public.is_org_client(organization_id));

create policy client_read_skus on public.skus
  for select using (public.is_org_client(organization_id));

create policy client_read_assignments on public.brand_ambassador_assignments
  for select using (public.is_org_client(organization_id));

create policy client_read_daily_logs on public.daily_logs
  for select using (public.is_org_client(organization_id));

create policy client_read_sales on public.sales_entries
  for select using (public.is_org_client(organization_id));

create policy client_read_photos on public.daily_log_photos
  for select using (public.is_org_client(organization_id));

-- 6. GRANT execute on new functions
grant execute on function public.is_client() to authenticated;
grant execute on function public.is_org_client(uuid) to authenticated;
