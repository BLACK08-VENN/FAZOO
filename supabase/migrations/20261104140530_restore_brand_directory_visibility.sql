-- Reconcile live policy helpers with the previously approved authenticator pause.
-- Keep existing approval, role, tenant predicates, RLS and grants unchanged.
CREATE OR REPLACE FUNCTION public.staff_session_verified()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_org(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status in ('approved')
      and (
        role = 'super_admin'
        or (organization_id = p_organization_id
            and role in ('organization_admin','supervisor'))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status = 'approved'
      and (
        role = 'super_admin'
        or (role = 'organization_admin' and organization_id = p_organization_id)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and account_status='approved');
$function$
;

