-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 20261016 — storage_read_org_admin: include the client role.
--
-- Table-level RLS (photos_select_scoped → can_read_org) has always let the
-- `client` role read their tenant's daily_log_photos rows, and requireStaff()
-- lets client-role users into the portal — but the storage policy only
-- covered super_admin / organization_admin / supervisor. A Lenovo client rep
-- viewing a daily log therefore saw rows and grey "photo unavailable"
-- placeholders, because createSignedUrl is gated by storage.objects RLS.
--
-- This migration aligns storage with table RLS: an approved client may mint
-- signed URLs for their own organization's photos, nothing else. Idempotent —
-- drops and recreates the policy. BAs are unchanged: they still only read
-- their own folder (storage_read_own).
-- ═══════════════════════════════════════════════════════════════════════════

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
                and p.role in ('organization_admin','supervisor','client')
          )
      )
    );
end $$;
