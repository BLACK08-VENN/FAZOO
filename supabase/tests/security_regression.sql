BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated','aal','aal2')::text,true) FROM public.profiles WHERE role='organization_admin' AND account_status='approved' LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$ DECLARE blocked boolean; target uuid; BEGIN
 blocked:=false;
 BEGIN UPDATE public.profiles SET role='super_admin' WHERE id=auth.uid(); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Profile escalation was allowed'; END IF;
 blocked:=false;
 BEGIN UPDATE public.organization_memberships SET role='super_admin' WHERE user_id=auth.uid() AND organization_id=(SELECT organization_id FROM public.profiles WHERE id=auth.uid()); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Membership escalation was allowed'; END IF;
 blocked:=false;
 BEGIN PERFORM public.set_booklist_stage(gen_random_uuid(),'completed',auth.uid(),NULL); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Workflow helper executable'; END IF;
 blocked:=false;
 BEGIN PERFORM public.check_rate_limit('test-untrusted-limit',1,600); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Rate limiter executable'; END IF;
 PERFORM id FROM public.organization_memberships LIMIT 1;
END; $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT public.check_rate_limit('security-regression-'||txid_current(),2,600) THEN RAISE EXCEPTION 'First rate limit request failed'; END IF;
 IF NOT public.check_rate_limit('security-regression-'||txid_current(),2,600) THEN RAISE EXCEPTION 'Second request failed'; END IF;
 IF public.check_rate_limit('security-regression-'||txid_current(),2,600) THEN RAISE EXCEPTION 'Rate limit bypass'; END IF;
END; $$;
ROLLBACK;
SELECT 'passed: profile and membership escalation blocked, helpers inaccessible, membership RLS nonrecursive, limiter enforced; all changes rolled back' result;
