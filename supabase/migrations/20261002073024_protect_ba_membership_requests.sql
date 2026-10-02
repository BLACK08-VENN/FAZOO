CREATE OR REPLACE FUNCTION public.ba_request_org_membership(p_organization_id uuid,p_org_code text DEFAULT NULL) RETURNS public.organization_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org public.organizations; member public.organization_memberships; actor public.profiles; approved boolean;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid() AND role='brand_ambassador' AND account_status IN ('pending','approved');
 IF actor.id IS NULL THEN RAISE EXCEPTION 'BA account required' USING ERRCODE='42501'; END IF;
 IF NOT public.check_rate_limit('brand-code:'||auth.uid()::text,10,600) THEN RAISE EXCEPTION 'Too many membership requests' USING ERRCODE='42501'; END IF;
 SELECT * INTO org FROM public.organizations WHERE id=p_organization_id AND status='active';
 IF org.id IS NULL THEN RAISE EXCEPTION 'Invalid organization'; END IF;
 SELECT * INTO member FROM public.organization_memberships WHERE user_id=auth.uid() AND organization_id=p_organization_id FOR UPDATE;
 IF member.id IS NOT NULL THEN
   IF member.role<>'brand_ambassador' OR member.account_status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Membership cannot be changed here' USING ERRCODE='42501'; END IF;
   IF member.account_status='approved' THEN RETURN member; END IF;
 END IF;
 approved:=org.has_code_gate AND p_org_code IS NOT NULL AND p_org_code=org.access_code;
 PERFORM set_config('fazoo.ba_membership_request','true',true);
 INSERT INTO public.organization_memberships(user_id,organization_id,role,account_status,access_code_used,code_granted_at)
 VALUES(auth.uid(),p_organization_id,'brand_ambassador',CASE WHEN approved THEN 'approved'::public.account_status ELSE 'pending'::public.account_status END,CASE WHEN approved THEN p_org_code ELSE NULL END,CASE WHEN approved THEN now() ELSE NULL END)
 ON CONFLICT(user_id,organization_id) DO UPDATE SET account_status=excluded.account_status,access_code_used=excluded.access_code_used,code_granted_at=excluded.code_granted_at
 RETURNING * INTO member;
 PERFORM set_config('fazoo.ba_membership_request','false',true);
 RETURN member;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_membership_privileges() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END; $$;
