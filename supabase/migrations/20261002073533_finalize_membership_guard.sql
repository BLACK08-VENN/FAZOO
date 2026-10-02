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
