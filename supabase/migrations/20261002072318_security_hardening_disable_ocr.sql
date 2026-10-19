-- Disable OCR and restrict privileged implementation helpers.
REVOKE EXECUTE ON FUNCTION public.account_status_active() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_advance_stage(uuid,booklist_stage,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_ba_daily_targets(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_ba_performance(ba_agency,date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_booklist_queue(ocr_status,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_campaign_stock_counts(uuid,date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_ba(uuid,smallint[],date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_campaign(uuid,text,text,date,date,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_print_order(uuid,integer,text,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_ba(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_campaign(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_daily_log(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_organization(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_sku(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_store(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_grade_print_orders(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_memberships() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_pipeline_board(text,booklist_stage,text,uuid,ba_agency,date,date,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_publish_formatted_document(uuid,text,text,bigint,integer,boolean,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_publish_grade_word(uuid,text,bigint,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_publish_grade_word(uuid,text,bigint,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_record_ocr_result(uuid,ocr_status,text,numeric,text,text,text,bigint,integer,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reopen_daily_log(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_leave_request(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_school_dossier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_account_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_ba_agency(uuid,ba_agency) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_ba_target(uuid,date,date,integer,uuid,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_grade_printables_shipping_status(uuid,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_organization_status(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_printables_shipping_status(uuid,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_print_order(uuid,print_order_status,text,text,integer,dispatch_means,text,text,timestamp with time zone,text,timestamp with time zone,text,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_school(uuid,text,text,text,double precision,double precision,integer,text,text,text,text,store_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_assignment(uuid,uuid,uuid,smallint[],date,date,assignment_status,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_active_ba() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_org_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_org_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_own_storage_path(text,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_school_ba() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_approve_existing_booklist_quantities(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_brand_options() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_capture_booklist_request(uuid,integer,date,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_checkin(double precision,double precision,text,text,uuid,uuid,double precision,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_checkout(double precision,double precision,uuid,uuid,text,text,double precision,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_confirm_copies(uuid,integer,uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_create_school(text,text,text,double precision,double precision,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_delete_sale(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_list_campaigns() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_list_veda_schools() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_mark_pending_school_approval(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_mark_sick_leave(text,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_my_campaigns() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_my_history(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_record_sale(uuid,integer,uuid,timestamp with time zone,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_record_visit_outcome(uuid,visit_outcome,uuid,text,text,text,text,text,boolean,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_request_org_membership(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_save_print_request(uuid,integer,date,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_schedule_booklist_follow_up(uuid,date,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_school_job_detail(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_school_pipeline(text,booklist_stage,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_school_pipeline_v2(text,booklist_stage,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_search_schools(text,text,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_start_school_visit(uuid,uuid,double precision,double precision,double precision,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_submit_booklist_document(uuid,text,uuid,text,bigint,integer,text,boolean,boolean,text,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_submit_grade_booklist(uuid,uuid,text,integer,date,text,uuid,text,bigint,text,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_submit_leave_request(uuid,leave_type,date,date,date,boolean,text,text,text[],boolean,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_submit_stamped_copy(uuid,text,uuid,text,bigint,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_switch_brand(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_today() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_unlock_brand(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_unlock_campaign(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_update_sale(uuid,integer,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_visit_rules(uuid,ba_agency) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ba_visit_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.backfill_school_coordinates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_booklist_document(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_org(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_receipt(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_brand(text,text,uuid,text,date,text,text,date,text,text,double precision,double precision,integer,uuid[],smallint[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_org_kind() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role_hint() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.joinable_brands() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_memberships() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_primary_membership() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_stock_snapshot(uuid,uuid,text,integer,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_school_visit(uuid,uuid,profiles) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_booklist_stage(uuid,booklist_stage,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisor_can_see_campaign(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supervisor_can_see_store(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.try_consume_receipt(uuid,text,profiles) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_booklist_print_order() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.veda_admin_upsert_assignment(uuid,text,smallint[],date,date,assignment_status,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.veda_admin_upsert_grade(text,text,integer,sku_status,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.veda_admin_upsert_school(text,text,double precision,double precision,integer,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit(text,text,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_active_ba() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_org_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_org_staff() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_own_storage_path(text,uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_school_ba() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_school_coordinates() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,integer,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_receipt(uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_update() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_primary_membership() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_school_visit(uuid,uuid,profiles) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_booklist_stage(uuid,booklist_stage,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.try_consume_receipt(uuid,text,profiles) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_booklist_print_order() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit(text,text,uuid,jsonb,uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,integer,integer) TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.admin_record_ocr_result(p_job_id uuid, p_status ocr_status, p_provider text DEFAULT NULL::text, p_confidence numeric DEFAULT NULL::numeric, p_error text DEFAULT NULL::text, p_draft_storage_path text DEFAULT NULL::text, p_draft_mime_type text DEFAULT NULL::text, p_draft_size_bytes bigint DEFAULT NULL::bigint, p_page_count integer DEFAULT NULL::integer, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN RAISE EXCEPTION 'OCR is temporarily disabled' USING ERRCODE='0A000'; END; $function$;
REVOKE EXECUTE ON FUNCTION public.admin_record_ocr_result(uuid,ocr_status,text,numeric,text,text,text,bigint,integer,uuid) FROM authenticated, service_role;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and account_status = 'approved');
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END; $$;
CREATE OR REPLACE FUNCTION public.guard_membership_privileges() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE caller public.profiles;
BEGIN
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
REVOKE ALL ON FUNCTION public.guard_membership_privileges() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_membership_privileges BEFORE INSERT OR UPDATE OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.guard_membership_privileges();
-- Avoid a recursive RLS self-query and limit colleague access to staff.
ALTER POLICY memberships_org_select ON public.organization_memberships USING (public.can_read_org(organization_id));
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text,p_max integer,p_window_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE hits integer; now_ts timestamptz:=clock_timestamp();
BEGIN
 IF p_key IS NULL OR length(p_key)>512 OR p_max NOT BETWEEN 1 AND 100000 OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
 INSERT INTO private.rate_limits AS r(key,window_start,hit_count) VALUES(p_key,now_ts,1)
 ON CONFLICT(key) DO UPDATE SET
 window_start=CASE WHEN now_ts-r.window_start>=make_interval(secs=>p_window_seconds) THEN now_ts ELSE r.window_start END,
 hit_count=CASE WHEN now_ts-r.window_start>=make_interval(secs=>p_window_seconds) THEN 1 ELSE least(r.hit_count+1,p_max+1) END
 RETURNING hit_count INTO hits;
 RETURN hits<=p_max;
END; $$;
ALTER FUNCTION public.distance_metres(double precision,double precision,double precision,double precision) SET search_path=public;
ALTER FUNCTION public.set_updated_at() SET search_path=public;
UPDATE storage.buckets SET file_size_limit=8388608,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id IN ('profile-photos','daily-log-photos');
UPDATE storage.buckets SET file_size_limit=20971520,allowed_mime_types=ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp','image/heic','image/tiff','text/plain'] WHERE id='booklist-documents';
ALTER POLICY storage_read_own ON storage.objects USING(bucket_id IN ('profile-photos','daily-log-photos') AND (storage.foldername(name))[2]=auth.uid()::text AND public.account_status_active());
ALTER POLICY booklist_docs_read_own ON storage.objects USING(bucket_id='booklist-documents' AND (storage.foldername(name))[2]=auth.uid()::text AND public.account_status_active());
ALTER POLICY booklist_docs_upload_own_folder ON storage.objects WITH CHECK(bucket_id='booklist-documents' AND (storage.foldername(name))[2]=auth.uid()::text AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.organization_id::text=(storage.foldername(name))[1] AND p.account_status='approved'));
