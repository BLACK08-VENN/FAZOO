-- Mobile sale edits/deletes are retryable client operations and therefore
-- require the same receipt semantics as creates/check-in/checkout.
drop function if exists public.ba_update_sale(uuid, integer);
drop function if exists public.ba_delete_sale(uuid);

create function public.ba_update_sale(
  p_sales_entry_id uuid,
  p_quantity integer,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l record; prior jsonb; result jsonb;
begin
  if p_client_request_id is null then raise exception 'client_request_id is required'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1.'; end if;
  p := public.assert_active_ba();
  prior := public.try_consume_receipt(p_client_request_id, 'sale.update', p);
  if prior is not null then return prior; end if;

  select d.* into l from public.daily_logs d
   join public.sales_entries e on e.daily_log_id = d.id
   where e.id = p_sales_entry_id and e.organization_id = p.organization_id
     and d.brand_ambassador_id = p.id;
  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  update public.sales_entries set quantity = p_quantity where id = p_sales_entry_id;
  perform public.write_audit('sales.update', 'sales_entries', p_sales_entry_id,
    jsonb_build_object('quantity', p_quantity));
  result := jsonb_build_object('status','ok','operation','sale.update','sales_entry_id',p_sales_entry_id,'quantity',p_quantity);
  perform public.complete_receipt(p_client_request_id, result);
  return result;
exception when others then
  delete from public.operation_receipts where client_request_id = p_client_request_id;
  raise;
end;
$$;

create function public.ba_delete_sale(
  p_sales_entry_id uuid,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; l record; prior jsonb; result jsonb;
begin
  if p_client_request_id is null then raise exception 'client_request_id is required'; end if;
  p := public.assert_active_ba();
  prior := public.try_consume_receipt(p_client_request_id, 'sale.delete', p);
  if prior is not null then return prior; end if;

  select d.* into l from public.daily_logs d
   join public.sales_entries e on e.daily_log_id = d.id
   where e.id = p_sales_entry_id and e.organization_id = p.organization_id
     and d.brand_ambassador_id = p.id;
  if l.id is null then raise exception 'Sale not found.'; end if;
  if l.status <> 'open' then raise exception 'This day is locked — ask an admin to reopen it.'; end if;

  delete from public.sales_entries where id = p_sales_entry_id;
  perform public.write_audit('sales.delete', 'sales_entries', p_sales_entry_id, null);
  result := jsonb_build_object('status','ok','operation','sale.delete','sales_entry_id',p_sales_entry_id);
  perform public.complete_receipt(p_client_request_id, result);
  return result;
exception when others then
  delete from public.operation_receipts where client_request_id = p_client_request_id;
  raise;
end;
$$;

revoke all on function public.ba_update_sale(uuid, integer, uuid) from public;
revoke all on function public.ba_delete_sale(uuid, uuid) from public;
grant execute on function public.ba_update_sale(uuid, integer, uuid) to authenticated;
grant execute on function public.ba_delete_sale(uuid, uuid) to authenticated;
