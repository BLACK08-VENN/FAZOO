-- Fix is_org_admin so a super admin can read any organization's rows
-- (audit_logs etc.) regardless of their own profiles.organization_id.
-- Previously the function returned false for super admins outside their home
-- org, which hid cross-org audit trails from them. Applied on the remote as a
-- standalone migration because 00002 may already be applied there.
create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status = 'approved'
      and (
        role = 'super_admin'
        or (role = 'organization_admin' and organization_id = p_organization_id)
      )
  );
$$;