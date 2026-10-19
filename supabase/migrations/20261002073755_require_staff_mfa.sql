-- Apply after the staff enrollment flow is deployed.
-- Existing RPCs that immediately use assert_org_* inherit MFA there.
CREATE OR REPLACE FUNCTION public.admin_campaign_stock_counts(p_campaign_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(daily_log_id uuid, attendance_date date, ba_id uuid, ba_name text, store_name text, sku_id uuid, sku_name text, sku_code text, opening integer, closing integer, sold integer, log_status daily_log_status)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org   uuid;
  v_role  public.app_role;
begin
  perform public.assert_org_staff();
  select organization_id into v_org from public.campaigns where id = p_campaign_id;
  if v_org is null then
    raise exception 'Campaign not found';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (
    v_role = 'super_admin'
    or (v_role = 'organization_admin' and (select organization_id from public.profiles where id = auth.uid()) = v_org)
    or (v_role = 'supervisor' and public.supervisor_can_see_campaign(auth.uid(), p_campaign_id))
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    l.id            as daily_log_id,
    l.attendance_date,
    pr.id           as ba_id,
    pr.full_name    as ba_name,
    coalesce(st.name, 'Unknown') as store_name,
    k.id            as sku_id,
    k.name          as sku_name,
    k.code          as sku_code,
    o.quantity      as opening,
    c.quantity      as closing,
    (o.quantity - c.quantity) as sold,
    l.status        as log_status
  from public.daily_logs l
  join public.profiles pr          on pr.id = l.brand_ambassador_id
  left join public.stores st       on st.id = l.store_id
  join public.stock_snapshots o    on o.daily_log_id = l.id and o.count_type = 'opening'
  join public.stock_snapshots c    on c.daily_log_id = l.id and c.count_type = 'closing'
  join public.skus k               on k.id = o.sku_id
  where l.campaign_id = p_campaign_id
    and l.status <> 'cancelled'
    and (p_from is null or l.attendance_date >= p_from)
    and (p_to   is null or l.attendance_date <= p_to)
  order by l.attendance_date desc, pr.full_name asc, k.name asc;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_create_ba(p_user_id uuid, p_weekly_off_day smallint[], p_start_date date, p_end_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor  public.profiles;
  target public.profiles;
  off    smallint[];
  mem_id uuid;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not permitted.';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if target.id is null then raise exception 'BA account not found.'; end if;
  if target.role not in ('brand_ambassador') then
    raise exception 'Only brand ambassadors can be provisioned here.';
  end if;

  off := public.normalize_off_days(p_weekly_off_day);
  if p_start_date is null then raise exception 'Start date is required.'; end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date must be on or after start date.';
  end if;

  -- Provision the membership (trusted sync re-points the temp profile to the
  -- admin's org, role brand_ambassador, status approved — bypasses the guard).
  insert into public.organization_memberships
    (user_id, organization_id, role, account_status, code_granted_at)
  values
    (p_user_id, actor.organization_id, 'brand_ambassador', 'approved', now())
  on conflict (user_id, organization_id)
  do update set role = 'brand_ambassador', account_status = 'approved', code_granted_at = now()
  returning id into mem_id;

  -- No assignment is created here: the BA becomes assignable by an admin to
  -- one or more campaigns/stores later (see admin_upsert_assignment).

  perform public.write_audit(
    'profile.create_ba', 'profiles', p_user_id,
    jsonb_build_object(
      'membership_id', mem_id,
      'weekly_off_day', off,
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'profile_id', p_user_id,
    'membership_id', mem_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_create_campaign(p_organization_id uuid, p_name text, p_description text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor       public.profiles;
  v_org       public.organizations;
  v_status    public.campaign_status;
  v_start     date;
  v_campaign  public.campaigns;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  if p_organization_id is null then
    raise exception 'A brand is required';
  end if;

  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'Brand not found';
  end if;

  if actor.role = 'organization_admin' and v_org.id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  if trim(p_name) is null or length(trim(p_name)) < 2 then
    raise exception 'Campaign name is required';
  end if;

  begin
    v_status := p_status::public.campaign_status;
  exception when others then
    raise exception 'Invalid campaign status';
  end;

  v_start := coalesce(p_start_date, CURRENT_DATE);

  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status, created_at, updated_at)
  values
    (v_org.id, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_start, p_end_date, v_status, now(), now())
  returning * into v_campaign;

  perform public.write_audit(
    'campaign.create',
    'campaigns',
    v_campaign.id,
    jsonb_build_object('organization_id', v_org.id, 'name', v_campaign.name, 'status', v_status),
    auth.uid(),
    v_org.id
  );

  return jsonb_build_object('status', 'ok', 'campaign_id', v_campaign.id, 'organization_id', v_org.id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_ba(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor  public.profiles;
  target public.profiles;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not permitted.';
  end if;

  if p_profile_id = actor.id then
    raise exception 'You cannot delete your own account.';
  end if;

  select * into target from public.profiles where id = p_profile_id;
  if target.id is null then raise exception 'Brand ambassador not found.'; end if;
  if target.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can be deleted here.';
  end if;
  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied.';
  end if;

  -- Cascades to assignments, daily logs, sales entries and leave requests.
  delete from public.profiles where id = p_profile_id;

  perform public.write_audit(
    'profile.delete_ba', 'profiles', p_profile_id,
    jsonb_build_object('organization_id', target.organization_id)
  );

  return jsonb_build_object('status', 'ok', 'profile_id', p_profile_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_campaign(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  target public.campaigns;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.campaigns where id = p_campaign_id;
  if target.id is null then
    raise exception 'Campaign not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows (order respects FK chains)
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.campaign_id = p_campaign_id;

  delete from public.daily_logs where campaign_id = p_campaign_id;
  delete from public.brand_ambassador_assignments where campaign_id = p_campaign_id;
  delete from public.skus where campaign_id = p_campaign_id;
  delete from public.supervisor_scopes where campaign_id = p_campaign_id;
  delete from public.campaign_unlocks where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;

  perform public.write_audit(
    'campaign.delete',
    'campaigns',
    p_campaign_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'campaign_id', p_campaign_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_daily_log(p_daily_log_id uuid, p_client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_log public.daily_logs%rowtype;
  v_existing public.operation_receipts%rowtype;
  v_sales_count integer;
  v_photo_count integer;
  v_result jsonb;
begin
  perform public.assert_org_staff();
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not authorized to delete daily logs' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_daily_log_id is null then
    raise exception 'Log and request IDs are required' using errcode = '22023';
  end if;

  select * into v_existing from public.operation_receipts
    where client_request_id = p_client_request_id for update;
  if found then
    if v_existing.operation <> 'admin_delete_daily_log'
       or v_existing.brand_ambassador_id <> v_actor.id
       or v_existing.result->>'daily_log_id' <> p_daily_log_id::text then
      raise exception 'Request ID has already been used' using errcode = '23505';
    end if;
    return v_existing.result;
  end if;

  select * into v_log from public.daily_logs where id = p_daily_log_id for update;
  if not found then
    raise exception 'Daily log not found' using errcode = 'P0002';
  end if;
  if v_actor.role = 'organization_admin'
     and v_actor.organization_id <> v_log.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  select count(*) into v_sales_count from public.sales_entries where daily_log_id = v_log.id;
  select count(*) into v_photo_count from public.daily_log_photos where daily_log_id = v_log.id;
  v_result := jsonb_build_object('status', 'deleted', 'daily_log_id', v_log.id);

  delete from public.daily_logs where id = v_log.id;
  perform public.write_audit(
    'daily_log.delete', 'daily_logs', v_log.id,
    jsonb_build_object(
      'attendance_date', v_log.attendance_date,
      'brand_ambassador_id', v_log.brand_ambassador_id,
      'campaign_id', v_log.campaign_id,
      'store_id', v_log.store_id,
      'sales_entries_deleted', v_sales_count,
      'photo_records_deleted', v_photo_count
    ), v_actor.id, v_log.organization_id
  );
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values
    (v_log.organization_id, v_actor.id, p_client_request_id,
     'admin_delete_daily_log', v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_organization(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  target public.organizations;
  v_name text;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'super_admin' or actor.account_status <> 'approved' then
    raise exception 'Only super admins can delete brands';
  end if;

  select * into target from public.organizations where id = p_org_id;
  if target.id is null then
    raise exception 'Brand not found';
  end if;

  v_name := target.name;

  -- sales_entries (via daily_logs chain)
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.organization_id = p_org_id;

  -- daily_logs
  delete from public.daily_logs where organization_id = p_org_id;

  -- brand_ambassador_assignments
  delete from public.brand_ambassador_assignments where organization_id = p_org_id;

  -- leave_requests
  delete from public.leave_requests where organization_id = p_org_id;

  -- supervisor_scopes
  delete from public.supervisor_scopes where organization_id = p_org_id;

  -- campaign_unlocks
  delete from public.campaign_unlocks cu
    using public.campaigns c
    where cu.campaign_id = c.id and c.organization_id = p_org_id;

  -- SKUs
  delete from public.skus where organization_id = p_org_id;

  -- campaigns
  delete from public.campaigns where organization_id = p_org_id;

  -- stores
  delete from public.stores where organization_id = p_org_id;

  -- veda data
  delete from public.veda_sessions where organization_id = p_org_id;
  delete from public.veda_schools where organization_id = p_org_id;
  delete from public.veda_stationery_items where organization_id = p_org_id;

  -- organization_memberships (cascades via FK)
  delete from public.organization_memberships where organization_id = p_org_id;

  -- profiles scoped to this org
  delete from public.profiles where organization_id = p_org_id;

  -- the org itself
  delete from public.organizations where id = p_org_id;

  perform public.write_audit(
    'organization.delete',
    'organizations',
    p_org_id,
    jsonb_build_object('name', v_name),
    auth.uid(),
    p_org_id
  );

  return jsonb_build_object('status', 'ok', 'organization_id', p_org_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_sku(p_sku_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  target public.skus;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.skus where id = p_sku_id;
  if target.id is null then
    raise exception 'SKU not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows
  delete from public.sales_entries where sku_id = p_sku_id;

  delete from public.skus where id = p_sku_id;

  perform public.write_audit(
    'sku.delete',
    'skus',
    p_sku_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name, 'code', target.code),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'sku_id', p_sku_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_delete_store(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  target public.stores;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.stores where id = p_store_id;
  if target.id is null then
    raise exception 'Store not found';
  end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  -- Clean up child rows
  delete from public.sales_entries se
    using public.daily_logs dl
    where se.daily_log_id = dl.id and dl.store_id = p_store_id;

  delete from public.daily_logs where store_id = p_store_id;
  delete from public.brand_ambassador_assignments where store_id = p_store_id;
  delete from public.leave_requests where store_id = p_store_id;
  delete from public.supervisor_scopes where store_id = p_store_id;

  delete from public.stores where id = p_store_id;

  perform public.write_audit(
    'store.delete',
    'stores',
    p_store_id,
    jsonb_build_object('organization_id', target.organization_id, 'name', target.name),
    auth.uid(),
    target.organization_id
  );

  return jsonb_build_object('status', 'ok', 'store_id', p_store_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_grade_print_orders(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_orders jsonb;
begin
  perform public.assert_org_staff();
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin', 'supervisor') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into v_orders
  from (
    select
      gr.id                      as grade_request_id,
      gr.job_id,
      bj.school_id,
      s.name                     as school_name,
      s.region                   as school_region,
      gr.grade_label,
      gr.copies_requested,
      gr.copies_to_print,
      gr.due_date::text          as due_date,
      gr.source_format,
      gr.storage_path            as raw_storage_path,
      gr.mime_type               as raw_mime_type,
      gr.conversion_status,
      gr.conversion_provider,
      gr.conversion_confidence,
      gr.conversion_error,
      gr.word_storage_path,
      gr.word_mime_type,
      gr.word_published_at,
      gr.printables_shipped,
      gr.created_at,
      p.id                       as ba_id,
      p.full_name                as ba_name,
      p.agency                   as ba_agency
    from public.booklist_grade_requests gr
    join public.booklist_jobs bj on bj.id = gr.job_id
    join public.veda_schools s   on s.id = bj.school_id
    left join public.profiles p  on p.id = gr.created_by
    where (v_actor.role = 'super_admin'
           or public.can_read_org(gr.organization_id))
    order by gr.created_at desc
    limit greatest(1, least(p_limit, 500))
  ) t;

  return jsonb_build_object('status', 'ok', 'orders', v_orders);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_publish_grade_word(p_grade_request_id uuid, p_storage_path text, p_file_size_bytes bigint, p_client_request_id uuid, p_mime_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
  v_prior public.operation_receipts%rowtype;
  v_mime  text;
  v_result jsonb;
begin
  perform public.assert_org_staff();
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can publish documents' using errcode = '42501';
  end if;
  if p_client_request_id is null then raise exception 'Request ID is required'; end if;
  select * into v_prior from public.operation_receipts where client_request_id = p_client_request_id for update;
  if found then
    if v_prior.operation <> 'admin_publish_grade_word'
       or v_prior.brand_ambassador_id <> v_actor.id
       or v_prior.result->>'grade_request_id' <> p_grade_request_id::text then
      raise exception 'Request ID already used' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;
  select * into v_grade from public.booklist_grade_requests where id = p_grade_request_id for update;
  if not found then raise exception 'Grade request not found'; end if;
  if v_actor.role = 'organization_admin' and v_actor.organization_id <> v_grade.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  -- Derive the authoritative MIME from the extension, unless the caller's hint
  -- is one of the three allowed values (still checked against the extension).
  v_mime := lower(nullif(btrim(coalesce(p_mime_type, '')), ''));
  if v_mime not in (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf'
  ) then
    v_mime := case
      when lower(p_storage_path) like '%.pdf' then 'application/pdf'
      when lower(p_storage_path) like '%.doc' then 'application/msword'
      else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    end;
  end if;

  if p_storage_path is null
     or p_storage_path not like v_grade.organization_id::text || '/grade-requests/' || v_grade.id::text || '/manual-%'
     or (lower(p_storage_path) not like '%.docx'
         and lower(p_storage_path) not like '%.doc'
         and lower(p_storage_path) not like '%.pdf')
     or not (
        (v_mime = 'application/pdf' and lower(p_storage_path) like '%.pdf')
        or (v_mime = 'application/msword' and lower(p_storage_path) like '%.doc')
        or (v_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            and lower(p_storage_path) like '%.docx')
     )
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then
    raise exception 'Invalid document';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'booklist-documents' and name = p_storage_path) then
    raise exception 'Document was not uploaded';
  end if;
  update public.booklist_grade_requests set
    word_storage_bucket = 'booklist-documents', word_storage_path = p_storage_path,
    word_mime_type = v_mime,
    word_size_bytes = p_file_size_bytes, word_published_at = now(), word_published_by = v_actor.id,
    conversion_status = 'succeeded', conversion_provider = 'manual', conversion_error = null,
    conversion_finished_at = now()
  where id = v_grade.id;
  if not exists (
    select 1 from public.booklist_grade_requests
    where job_id = v_grade.job_id and word_storage_path is null
  ) then
    perform public.set_booklist_stage(v_grade.job_id, 'formatted', v_actor.id, 'All grade documents published');
  end if;
  perform public.write_audit('booklist_grade.word_published', 'booklist_grade_requests', v_grade.id,
    jsonb_build_object('storage_path', p_storage_path, 'mime_type', v_mime, 'file_size_bytes', p_file_size_bytes),
    v_actor.id, v_grade.organization_id);
  v_result := jsonb_build_object('status', 'ok', 'grade_request_id', v_grade.id, 'word_ready', true);
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values (v_grade.organization_id, v_actor.id, p_client_request_id, 'admin_publish_grade_word', v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_publish_grade_word(p_grade_request_id uuid, p_storage_path text, p_file_size_bytes bigint, p_client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
  v_prior public.operation_receipts%rowtype;
  v_result jsonb;
  v_mime_type text;
begin
  perform public.assert_org_staff();
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can publish corrected documents' using errcode = '42501';
  end if;
  if p_client_request_id is null then raise exception 'Request ID is required'; end if;
  select * into v_prior from public.operation_receipts where client_request_id = p_client_request_id for update;
  if found then
    if v_prior.operation <> 'admin_publish_grade_word'
       or v_prior.brand_ambassador_id <> v_actor.id
       or v_prior.result->>'grade_request_id' <> p_grade_request_id::text then
      raise exception 'Request ID already used' using errcode = '23505';
    end if;
    return v_prior.result;
  end if;
  select * into v_grade from public.booklist_grade_requests where id = p_grade_request_id for update;
  if not found then raise exception 'Grade request not found'; end if;
  if v_actor.role = 'organization_admin' and v_actor.organization_id <> v_grade.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;
  if p_storage_path is null
     or p_storage_path not like v_grade.organization_id::text || '/grade-requests/' || v_grade.id::text || '/manual-%'
     or lower(p_storage_path) !~ '\.(doc|docx|pdf)$'
     or p_file_size_bytes is null or p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then
    raise exception 'Invalid corrected document';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'booklist-documents' and name = p_storage_path) then
    raise exception 'Corrected document was not uploaded';
  end if;

  v_mime_type := case
    when lower(p_storage_path) like '%.pdf' then 'application/pdf'
    when lower(p_storage_path) like '%.doc' then 'application/msword'
    else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  end;

  update public.booklist_grade_requests set
    word_storage_bucket = 'booklist-documents', word_storage_path = p_storage_path,
    word_mime_type = v_mime_type,
    word_size_bytes = p_file_size_bytes, word_published_at = now(), word_published_by = v_actor.id,
    conversion_status = 'succeeded', conversion_provider = 'manual', conversion_error = null,
    conversion_finished_at = now()
  where id = v_grade.id;
  if not exists (
    select 1 from public.booklist_grade_requests
    where job_id = v_grade.job_id and word_storage_path is null
  ) then
    perform public.set_booklist_stage(v_grade.job_id, 'formatted', v_actor.id, 'All corrected grade documents published');
  end if;
  perform public.write_audit('booklist_grade.word_published', 'booklist_grade_requests', v_grade.id,
    jsonb_build_object('storage_path', p_storage_path, 'file_size_bytes', p_file_size_bytes, 'mime_type', v_mime_type),
    v_actor.id, v_grade.organization_id);
  v_result := jsonb_build_object('status', 'ok', 'grade_request_id', v_grade.id, 'word_ready', true);
  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values (v_grade.organization_id, v_actor.id, p_client_request_id, 'admin_publish_grade_word', v_result);
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_reopen_daily_log(p_daily_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles; l record;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into l from public.daily_logs where id = p_daily_log_id;
  if l.id is null then raise exception 'Log not found'; end if;
  if actor.role = 'organization_admin' and l.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  update public.daily_logs set status = 'open', reopened_by = actor.id
   where id = p_daily_log_id;

  perform public.write_audit('daily_log.reopen', 'daily_logs', p_daily_log_id, null);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_review_leave_request(p_leave_request_id uuid, p_decision text, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor  public.profiles;
  target public.leave_requests;
  next_status public.leave_request_status;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Not permitted.';
  end if;

  select * into target from public.leave_requests where id = p_leave_request_id for update;
  if target.id is null then raise exception 'Leave request not found.'; end if;
  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied.';
  end if;
  if target.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;

  next_status := case lower(btrim(p_decision))
    when 'approve' then 'approved'::public.leave_request_status
    when 'deny' then 'denied'::public.leave_request_status
    else null
  end;
  if next_status is null then raise exception 'Decision must be approve or deny.'; end if;
  if next_status = 'denied' and char_length(btrim(coalesce(p_review_note, ''))) < 3 then
    raise exception 'A denial reason is required.';
  end if;

  update public.leave_requests
  set status = next_status,
      reviewed_by = actor.id,
      reviewed_at = now(),
      review_note = nullif(btrim(p_review_note), '')
  where id = target.id;

  perform public.write_audit(
    'leave_request.' || next_status::text, 'leave_requests', target.id,
    jsonb_build_object('decision', next_status, 'review_note', nullif(btrim(p_review_note), ''))
  );

  return jsonb_build_object(
    'status', 'ok',
    'leave_request_id', target.id,
    'decision', next_status
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_profile_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles; target public.profiles; new_status account_status;
        v_membership_id uuid;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;
  select * into target from public.profiles where id = p_profile_id;
  if target.id is null then raise exception 'Profile not found'; end if;
  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;
  if target.role = 'super_admin' then
    raise exception 'Super administrators are managed by the platform only';
  end if;
  case p_action
    when 'approve'    then new_status := 'approved'::account_status;
    when 'reject'     then new_status := 'rejected'::account_status;
    when 'suspend'    then new_status := 'suspended'::account_status;
    when 'reactivate' then new_status := 'approved'::account_status;
    when 'deactivate' then new_status := 'inactive'::account_status;
    else raise exception 'Unknown action %', p_action;
  end case;
  update public.organization_memberships
     set account_status = new_status
   where user_id = p_profile_id
     and organization_id = target.organization_id
  returning id into v_membership_id;
  update public.profiles
     set account_status = new_status
   where id = p_profile_id;
  perform public.write_audit('profile.' || p_action, 'profiles', p_profile_id,
    jsonb_build_object('from', target.account_status, 'to', new_status, 'reason', p_reason,
                       'membership_id', v_membership_id));
  return jsonb_build_object('status','ok','profile_id', p_profile_id, 'account_status', new_status);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_grade_printables_shipping_status(p_grade_request_id uuid, p_shipped boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_grade public.booklist_grade_requests%rowtype;
begin
  perform public.assert_org_staff();
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.account_status <> 'approved'
     or v_actor.role not in ('super_admin', 'organization_admin') then
    raise exception 'Only approved admins can update shipping status' using errcode = '42501';
  end if;

  select * into v_grade
    from public.booklist_grade_requests
   where id = p_grade_request_id
   for update;
  if v_grade.id is null then
    raise exception 'Grade print order not found' using errcode = 'P0002';
  end if;
  if v_actor.role = 'organization_admin' and v_actor.organization_id <> v_grade.organization_id then
    raise exception 'Not authorized for this organization' using errcode = '42501';
  end if;

  update public.booklist_grade_requests
     set printables_shipped = p_shipped,
         printables_shipping_updated_at = now(),
         printables_shipping_updated_by = v_actor.id,
         updated_at = now()
   where id = v_grade.id;

  perform public.write_audit(
    'booklist_grade.printables_shipping_status',
    'booklist_grade_requests',
    v_grade.id,
    jsonb_build_object('printables_shipped', p_shipped),
    v_actor.id,
    v_grade.organization_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'operation', 'admin_set_grade_printables_shipping_status',
    'grade_request_id', v_grade.id,
    'printables_shipped', p_shipped
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_organization_status(p_org_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor   public.profiles;
  target  public.organizations;
  new_status public.organization_status;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'super_admin' or actor.account_status <> 'approved' then
    raise exception 'Only super admins can pause or resume brands';
  end if;

  select * into target from public.organizations where id = p_org_id;
  if target.id is null then
    raise exception 'Brand not found';
  end if;

  begin
    new_status := p_status::public.organization_status;
  exception when others then
    raise exception 'Invalid status. Use "active" or "suspended".';
  end;

  if new_status = target.status then
    return jsonb_build_object('status', 'ok', 'organization_id', p_org_id, 'unchanged', true);
  end if;

  update public.organizations
     set status = new_status, updated_at = now()
   where id = p_org_id;

  perform public.write_audit(
    'organization.' || new_status,
    'organizations',
    p_org_id,
    jsonb_build_object('name', target.name, 'previous_status', target.status, 'new_status', new_status),
    auth.uid(),
    p_org_id
  );

  return jsonb_build_object('status', 'ok', 'organization_id', p_org_id, 'new_status', new_status);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_upsert_assignment(p_brand_ambassador_id uuid, p_campaign_id uuid, p_store_id uuid, p_weekly_off_day smallint[], p_start_date date, p_end_date date DEFAULT NULL::date, p_status assignment_status DEFAULT 'active'::assignment_status, p_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor public.profiles; ba record; camp record; st record; v_id uuid;
  off smallint[];
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into ba from public.profiles
   where id = p_brand_ambassador_id and role = 'brand_ambassador';
  if actor.role = 'organization_admin' then
    if ba.id is null or ba.organization_id <> actor.organization_id then
      raise exception 'Brand ambassador not in your organization';
    end if;
  elsif ba.id is null then
    raise exception 'Brand ambassador not found';
  end if;

  select * into camp from public.campaigns
   where id = p_campaign_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if camp.id is null then raise exception 'Campaign not found or inactive'; end if;

  if p_store_id is not null then
    select * into st from public.stores
     where id = p_store_id and status = 'active'
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);
    if st.id is null then raise exception 'Store not found or inactive'; end if;
  end if;

  off := public.normalize_off_days(p_weekly_off_day);

  if p_assignment_id is null then
    insert into public.brand_ambassador_assignments
      (organization_id, brand_ambassador_id, campaign_id, store_id,
       weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, p_campaign_id, p_store_id,
       off, p_start_date, p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('assignment.create', 'brand_ambassador_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'campaign', p_campaign_id,
                         'store', p_store_id, 'weekly_off_day', off));
  else
    update public.brand_ambassador_assignments set
      campaign_id = p_campaign_id, store_id = p_store_id,
      weekly_off_day = off, start_date = p_start_date,
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;

    if v_id is not null then
      perform public.write_audit('assignment.update', 'brand_ambassador_assignments', v_id, null);
    end if;
  end if;

  if v_id is null then raise exception 'Assignment not found'; end if;
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_brand(p_name text, p_slug text, p_brand_admin_user_id uuid, p_campaign_name text, p_campaign_start date, p_timezone text DEFAULT 'Africa/Lagos'::text, p_access_code text DEFAULT NULL::text, p_campaign_end date DEFAULT NULL::date, p_store_name text DEFAULT NULL::text, p_store_address text DEFAULT NULL::text, p_store_lat double precision DEFAULT NULL::double precision, p_store_lng double precision DEFAULT NULL::double precision, p_store_radius integer DEFAULT 200, p_ba_user_ids uuid[] DEFAULT '{}'::uuid[], p_weekly_off_day smallint[] DEFAULT '{0}'::smallint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller public.profiles;
  v_org_id uuid;
  v_campaign_id uuid;
  v_store_id uuid;
  v_gate boolean;
  v_code text;
  v_name text;
  ba uuid;
  off smallint[];
  v_added_bas integer := 0;
  v_assigned integer := 0;
begin
  perform public.assert_org_staff();
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.account_status <> 'approved'
     or caller.role <> 'super_admin' then
    raise exception 'Not permitted';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Brand name is required';
  end if;
  if nullif(trim(p_slug), '') is null then
    raise exception 'Brand slug is required';
  end if;
  if p_slug !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'Brand slug must be 2-60 lowercase letters, digits or dashes';
  end if;
  if exists (select 1 from public.organizations where slug = lower(trim(p_slug))) then
    raise exception 'That brand slug is already in use';
  end if;
  if p_brand_admin_user_id is null then
    raise exception 'A brand admin account is required';
  end if;
  if not exists (select 1 from auth.users where id = p_brand_admin_user_id) then
    raise exception 'Brand admin account does not exist';
  end if;

  v_gate := p_access_code is not null and nullif(trim(p_access_code), '') is not null;
  v_code := case when v_gate then trim(p_access_code) else null end;

  insert into public.organizations
    (name, slug, timezone, has_code_gate, access_code, status)
  values
    (trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_timezone), ''), 'Africa/Lagos'),
     v_gate, v_code, 'active')
  returning id into v_org_id;

  v_name := coalesce(nullif(trim(p_campaign_name), ''), 'Brand Launch');
  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status)
  values
    (v_org_id, v_name,
     'Initial campaign for ' || trim(p_name),
     coalesce(p_campaign_start, current_date),
     p_campaign_end, 'active')
  returning id into v_campaign_id;

  insert into public.organization_memberships
    (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
  values
    (p_brand_admin_user_id, v_org_id, 'organization_admin', 'approved', v_code,
     case when v_gate then now() else null end);

  if nullif(trim(p_store_name), '') is not null then
    if p_store_lat is null or p_store_lng is null then
      raise exception 'Store coordinates are required';
    end if;
    insert into public.stores
      (organization_id, name, address, latitude, longitude, geofence_radius_metres, status)
    values
      (v_org_id, trim(p_store_name),
       nullif(trim(coalesce(p_store_address, '')), ''),
       p_store_lat, p_store_lng,
       coalesce(p_store_radius, 200)::int, 'active')
    returning id into v_store_id;
  end if;

  off := public.normalize_off_days(p_weekly_off_day);

  foreach ba in array (select coalesce(p_ba_user_ids, '{}'::uuid[])) loop
    if not exists (
      select 1 from public.organization_memberships m
      where m.user_id = ba
        and m.role = 'brand_ambassador'
        and m.account_status = 'approved'
    ) then
      continue;
    end if;

    insert into public.organization_memberships
      (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
    values
      (ba, v_org_id, 'brand_ambassador', 'approved', v_code,
       case when v_gate then now() else null end);

    v_added_bas := v_added_bas + 1;

    if v_store_id is not null then
      insert into public.brand_ambassador_assignments
        (organization_id, brand_ambassador_id, campaign_id, store_id,
         weekly_off_day, start_date, end_date, status)
      values
        (v_org_id, ba, v_campaign_id, v_store_id,
         off, coalesce(p_campaign_start, current_date),
         p_campaign_end, 'active');
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  perform public.write_audit(
    'organization.create', 'organizations', v_org_id,
    jsonb_build_object(
      'name', trim(p_name), 'slug', lower(trim(p_slug)),
      'has_code_gate', v_gate,
      'brand_admin_user_id', p_brand_admin_user_id,
      'campaign_id', v_campaign_id,
      'store_id', v_store_id,
      'bas_linked', v_added_bas,
      'assignments_created', v_assigned
    ),
    auth.uid(), v_org_id
  );

  return jsonb_build_object(
    'status', 'ok',
    'organization_id', v_org_id,
    'organization_slug', lower(trim(p_slug)),
    'campaign_id', v_campaign_id,
    'store_id', v_store_id,
    'brand_admin_user_id', p_brand_admin_user_id,
    'bas_linked', v_added_bas,
    'assignments_created', v_assigned,
    'access_code', v_code
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.veda_admin_upsert_assignment(p_brand_ambassador_id uuid, p_region text, p_weekly_off_day smallint[] DEFAULT NULL::smallint[], p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_status assignment_status DEFAULT 'active'::assignment_status, p_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  ba    public.profiles;
  off   smallint[];
  v_id  uuid;
  norm_region text;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into ba from public.profiles
   where id = p_brand_ambassador_id and role = 'brand_ambassador';
  if actor.role = 'organization_admin' then
    if ba.id is null or ba.organization_id <> actor.organization_id then
      raise exception 'Brand ambassador not in your organization';
    end if;
  elsif ba.id is null then
    raise exception 'Brand ambassador not found';
  end if;

  norm_region := nullif(btrim(p_region), '');

  off := public.normalize_off_days(p_weekly_off_day);
  if off = '{}'::smallint[] then off := null; end if;

  -- One active row per (BA, region).  Null regions are allowed; only
  -- non-null regions are checked for duplicates.
  if p_assignment_id is null then
    if norm_region is not null and exists (
      select 1 from public.veda_assignments
       where brand_ambassador_id = p_brand_ambassador_id
         and region = norm_region
         and status = 'active'
    ) then
      raise exception '% is already assigned for this brand ambassador.', norm_region;
    end if;

    insert into public.veda_assignments
      (organization_id, brand_ambassador_id, region, weekly_off_day, start_date, end_date, status)
    values
      (ba.organization_id, p_brand_ambassador_id, norm_region, off,
       coalesce(p_start_date, current_date), p_end_date, p_status)
    returning id into v_id;

    perform public.write_audit('veda_assignment.create', 'veda_assignments', v_id,
      jsonb_build_object('ba', p_brand_ambassador_id, 'region', norm_region,
                         'weekly_off_day', off));
  else
    update public.veda_assignments set
      region = norm_region, weekly_off_day = off,
      start_date = coalesce(p_start_date, start_date),
      end_date = p_end_date, status = p_status
     where id = p_assignment_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id);

    if not found then raise exception 'Assignment not found'; end if;

    v_id := p_assignment_id;
    perform public.write_audit('veda_assignment.update', 'veda_assignments', v_id, null);
  end if;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.veda_admin_upsert_grade(p_name text, p_code text, p_sort_order integer DEFAULT 0, p_status sku_status DEFAULT 'active'::sku_status, p_grade_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  v_org uuid;
  v_id  uuid;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin','organization_admin') then
    raise exception 'Not permitted';
  end if;
  v_org := actor.organization_id;

  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) < 2 then
    raise exception 'Grade name is required';
  end if;
  if btrim(coalesce(p_code, '')) = '' then
    raise exception 'Grade code is required';
  end if;

  if actor.role = 'super_admin' and p_grade_id is not null then
    select organization_id into v_org
      from public.veda_grades where id = p_grade_id and status <> 'inactive';
    if v_org is null then raise exception 'Grade not found'; end if;
  end if;

  if p_grade_id is null then
    insert into public.veda_grades (organization_id, name, code, sort_order, status)
    values (v_org, btrim(p_name), btrim(p_code), coalesce(p_sort_order, 0), coalesce(p_status, 'active'))
    on conflict (organization_id, code) do update set
      name = excluded.name, sort_order = excluded.sort_order, status = excluded.status
    returning id into v_id;
    perform public.write_audit('veda_grade.create', 'veda_grades', v_id,
      jsonb_build_object('name', p_name, 'code', p_code));
  else
    update public.veda_grades
       set name       = btrim(p_name),
           code       = btrim(p_code),
           sort_order = coalesce(p_sort_order, sort_order),
           status     = coalesce(p_status, status)
     where id = p_grade_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is null then raise exception 'Grade not found or not in your organization'; end if;
    perform public.write_audit('veda_grade.update', 'veda_grades', v_id, null);
  end if;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.veda_admin_upsert_school(p_name text, p_region text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_geofence_radius_metres integer DEFAULT 200, p_school_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor public.profiles;
  v_id  uuid;
begin
  perform public.assert_org_staff();
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  if p_geofence_radius_metres not between 20 and 2000 then
    raise exception 'Geofence radius must be 20–2000 m';
  end if;

  if p_school_id is null then
    insert into public.veda_schools
      (organization_id, name, region, latitude, longitude, geofence_radius_metres)
    values
      (actor.organization_id, p_name, nullif(p_region, ''), p_latitude, p_longitude, p_geofence_radius_metres)
    returning id into v_id;
    perform public.write_audit('veda_school.create', 'veda_schools', v_id,
      jsonb_build_object('name', p_name, 'region', p_region));
  else
    update public.veda_schools set
      name = p_name, region = nullif(p_region, ''),
      latitude = p_latitude, longitude = p_longitude,
      geofence_radius_metres = p_geofence_radius_metres
     where id = p_school_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is not null then
      perform public.write_audit('veda_school.update', 'veda_schools', v_id, null);
    end if;
  end if;

  if v_id is null then raise exception 'School not found'; end if;
  return v_id;
end;
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
  if (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'Staff MFA required' using errcode='42501'; end if;
  return p;
end;
$function$
;
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
  if (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'Staff MFA required' using errcode='42501'; end if;
  return p;
end;
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
    where id = auth.uid() and (auth.jwt()->>'aal')='aal2'
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
    where id = auth.uid() and (auth.jwt()->>'aal')='aal2'
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
  select exists (select 1 from public.profiles where id = auth.uid() and (auth.jwt()->>'aal')='aal2' and role = 'super_admin' and account_status='approved');
$function$
;
CREATE OR REPLACE FUNCTION public.staff_session_verified() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (auth.jwt()->>'aal')='aal2' OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('super_admin','organization_admin','supervisor'));
$$;
REVOKE ALL ON FUNCTION public.staff_session_verified() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_session_verified() TO authenticated;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'profiles' LOOP
   EXECUTE format('CREATE POLICY staff_mfa ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.staff_session_verified()) WITH CHECK (public.staff_session_verified())',t.tablename);
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE caller public.profiles; mem public.organization_memberships;
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Profile identity is immutable' USING ERRCODE='42501'; END IF;
 IF coalesce(current_setting('fazoo.membership_sync',true),'')='true' THEN RETURN NEW; END IF;
 SELECT * INTO caller FROM public.profiles WHERE id=auth.uid();
 IF caller.role IN ('super_admin','organization_admin','supervisor') AND (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'Staff MFA required' USING ERRCODE='42501'; END IF;
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
 IF caller.role IN ('super_admin','organization_admin','supervisor') AND (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN RAISE EXCEPTION 'Staff MFA required' USING ERRCODE='42501'; END IF;
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
CREATE POLICY staff_mfa_storage ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(public.staff_session_verified()) WITH CHECK(public.staff_session_verified());
