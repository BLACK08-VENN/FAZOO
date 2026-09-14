-- Approved organization admins may remove an erroneous daily log in their own
-- organization; platform admins may do so across organizations. The audit trail
-- and idempotency receipt remain after the operational record is removed.
begin;

create function public.admin_delete_daily_log(
  p_daily_log_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.profiles%rowtype;
  v_log public.daily_logs%rowtype;
  v_existing public.operation_receipts%rowtype;
  v_sales_count integer;
  v_photo_count integer;
  v_result jsonb;
begin
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
$$;

revoke all on function public.admin_delete_daily_log(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_daily_log(uuid, uuid) to authenticated;
commit;
