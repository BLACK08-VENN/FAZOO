-- Authenticator requirement paused; approval, role and tenant guards remain.
CREATE OR REPLACE FUNCTION public.assert_org_staff()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin','supervisor') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$function$
;

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

CREATE OR REPLACE FUNCTION public.assert_org_admin()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_membership_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE caller public.profiles;
BEGIN
 IF TG_OP IN ('INSERT','UPDATE') AND coalesce(current_setting('fazoo.ba_membership_request',true),'')='true'
 AND NEW.user_id=auth.uid() AND NEW.role='brand_ambassador' AND NEW.account_status IN ('pending','approved') THEN
   IF TG_OP='INSERT' THEN RETURN NEW; END IF;
   IF OLD.user_id=NEW.user_id AND OLD.organization_id=NEW.organization_id AND OLD.id=NEW.id
      AND OLD.role='brand_ambassador' AND OLD.account_status='pending' THEN RETURN NEW; END IF;
 END IF;
 -- Auth provisioning creates only a pending BA membership in its nested trigger.
 IF TG_OP='INSERT' AND pg_trigger_depth()>1 AND NEW.role='brand_ambassador' AND NEW.account_status='pending' THEN RETURN NEW; END IF;
 IF auth.role()='service_role' OR (session_user='postgres' AND auth.uid() IS NULL) THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 SELECT * INTO caller FROM public.profiles WHERE id=auth.uid() AND account_status='approved';
 IF caller.role='super_admin' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF caller.role IS DISTINCT FROM 'organization_admin'::public.app_role THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.organization_id<>caller.organization_id OR NEW.role='super_admin' THEN RAISE EXCEPTION 'Unauthorized membership' USING ERRCODE='42501'; END IF;
 ELSIF TG_OP='UPDATE' THEN
   IF OLD.organization_id<>caller.organization_id OR NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id
   OR NEW.id<>OLD.id OR OLD.role='super_admin' OR NEW.role='super_admin' THEN RAISE EXCEPTION 'Unauthorized membership change' USING ERRCODE='42501'; END IF;
 ELSE
   IF OLD.organization_id<>caller.organization_id OR OLD.role='super_admin' THEN RAISE EXCEPTION 'Unauthorized membership deletion' USING ERRCODE='42501'; END IF;
   RETURN OLD;
 END IF;
 RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE caller public.profiles; mem public.organization_memberships;
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Profile identity is immutable' USING ERRCODE='42501'; END IF;
 IF coalesce(current_setting('fazoo.membership_sync',true),'')='true' THEN RETURN NEW; END IF;
 SELECT * INTO caller FROM public.profiles WHERE id=auth.uid();
 IF caller.id IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
 IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND NEW.role IS NOT DISTINCT FROM OLD.role
 AND NEW.account_status IS NOT DISTINCT FROM OLD.account_status AND NEW.current_membership_id IS NOT DISTINCT FROM OLD.current_membership_id THEN RETURN NEW; END IF;
 IF auth.uid()=OLD.id AND NEW.current_membership_id IS NOT NULL THEN
   SELECT * INTO mem FROM public.organization_memberships WHERE id=NEW.current_membership_id AND user_id=auth.uid();
   IF mem.id IS NOT NULL AND NEW.organization_id=mem.organization_id AND NEW.role=mem.role AND NEW.account_status=mem.account_status THEN RETURN NEW; END IF;
 END IF;
 IF caller.account_status='approved' AND caller.role='super_admin' THEN RETURN NEW; END IF;
 IF caller.account_status='approved' AND caller.role='organization_admin'
 AND caller.organization_id=OLD.organization_id AND NEW.organization_id=OLD.organization_id
 AND OLD.role<>'super_admin' AND NEW.role<>'super_admin'
 AND NEW.current_membership_id IS NOT DISTINCT FROM OLD.current_membership_id THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Unauthorized profile privilege change' USING ERRCODE='42501';
END; $function$
;
