-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00020 — Storage provisioning: private buckets + RLS policies.
--
-- Previously the buckets and their storage.objects policies lived only in
-- supabase/deploy/03_rls.sql, which is NOT part of the ordered migrations set
-- applied by `supabase db push` / `db reset`. As a result fresh and remote
-- projects never created the buckets, so every photo upload from the mobile
-- app (check-in stock/selfie, checkout stock/selfie, profile photo) failed
-- with "bucket not found" / RLS denial.
--
-- This migration repairs that gap. It is:
--   • idempotent — bucket inserts use on conflict do nothing; policies are
--     dropped before (re)creation so re-running is safe.
--   • gated on the storage extension/schema existing, so it can never break
--     a database where storage is not provisioned.
--
-- Folder layout for objects: {organization_id}/{auth_uid}/{filename}. The BA
-- RPCs (ba_checkin / ba_checkout) enforce that photo paths live under
-- {org}/{ba}/ server-side; these policies enforce the same rule at the
-- storage layer for uploads, reads, and deletes.
-- ═══════════════════════════════════════════════════════════════════════════

-- Only run when the storage schema (and its objects table) are present.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('profile-photos', 'profile-photos', false),
         ('daily-log-photos', 'daily-log-photos', false)
  on conflict (id) do nothing;
end $$;

-- ── Upload only into your own folder within your organization ───────────────
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists storage_upload_own_folder on storage.objects;
  create policy storage_upload_own_folder on storage.objects
    for insert to authenticated
    with check (
      bucket_id in ('profile-photos','daily-log-photos')
      and (storage.foldername(name))[2] = auth.uid()::text
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.organization_id::text = (storage.foldername(name))[1]
          and p.account_status in ('pending','approved')
      )
    );
end $$;

-- ── Read your own objects (needed to mint signed URLs / preview) ───────────
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists storage_read_own on storage.objects;
  create policy storage_read_own on storage.objects
    for select to authenticated
    using (
      bucket_id in ('profile-photos','daily-log-photos')
      and (storage.foldername(name))[2] = auth.uid()::text
    );
end $$;

-- ── Org admins / supervisors may mint signed URLs for their tenant's photos ─
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists storage_read_org_admin on storage.objects;
  create policy storage_read_org_admin on storage.objects
    for select to authenticated
    using (
      bucket_id in ('profile-photos','daily-log-photos')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.account_status = 'approved'
          and (
            p.role = 'super_admin'
            or p.organization_id::text = (storage.foldername(name))[1]
                and p.role in ('organization_admin','supervisor')
          )
      )
    );
end $$;

-- ── Replace / delete your own photo while re-taking during registration ─────
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists storage_delete_own on storage.objects;
  create policy storage_delete_own on storage.objects
    for delete to authenticated
    using (
      bucket_id in ('profile-photos','daily-log-photos')
      and (storage.foldername(name))[2] = auth.uid()::text
    );
end $$;
