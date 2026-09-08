-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00040 — Admin management of the Veda stationery catalogue.
--
-- Gives org admins a first-class "Veda SKUs" management surface. Mirrors
-- `veda_admin_upsert_grade`: SECURITY DEFINER, org-scoped, writes audit rows.
--   veda_admin_upsert_stationery_item → create or update an item / toggle status
--   veda_admin_delete_stationery_item → delete (blocked when distributed)
--
-- `veda_grade_stationery` removes on cascade when an item is deleted, but
-- `veda_session_distributions` references items with a plain FK, so an item that
-- has ever been recorded against a visit cannot be hard-deleted.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── upsert a stationery item (create, edit name/code, toggle status) ─────────
create or replace function public.veda_admin_upsert_stationery_item(
  p_name    text,
  p_code    text,
  p_status  sku_status default 'active',
  p_item_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  v_org uuid;
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;
  v_org := actor.organization_id;

  if trim(p_name) is null or length(trim(p_name)) < 2 then
    raise exception 'Stationery item name is required';
  end if;
  if trim(p_code) is null or length(trim(p_code)) < 1 then
    raise exception 'Stationery item code is required';
  end if;

  if actor.role = 'super_admin' and p_item_id is not null then
    select organization_id into v_org from public.veda_stationery_items
     where id = p_item_id and status <> 'inactive';
    if v_org is null then raise exception 'Stationery item not found'; end if;
  end if;

  if p_item_id is null then
    insert into public.veda_stationery_items (organization_id, name, code, status)
    values (v_org, trim(p_name), trim(p_code), p_status)
    on conflict (organization_id, code) do update set
      name = excluded.name, status = excluded.status
    returning id into v_id;
    perform public.write_audit('veda_stationery.create', 'veda_stationery_items', v_id,
      jsonb_build_object('name', p_name, 'code', p_code));
  else
    update public.veda_stationery_items set
      name = trim(p_name), code = trim(p_code), status = p_status
     where id = p_item_id and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is null then raise exception 'Stationery item not found or not in your organization'; end if;
    perform public.write_audit('veda_stationery.update', 'veda_stationery_items', v_id, null);
  end if;

  return v_id;
end;
$$;

-- ── delete a stationery item (refused if recorded against distributions) ─────
create or replace function public.veda_admin_delete_stationery_item(p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor  public.profiles;
  target public.veda_stationery_items;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin', 'organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;

  select * into target from public.veda_stationery_items where id = p_item_id;
  if target.id is null then raise exception 'Stationery item not found'; end if;

  if actor.role = 'organization_admin' and target.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied';
  end if;

  begin
    delete from public.veda_grade_stationery
      where stationery_item_id = p_item_id;
    delete from public.veda_stationery_items where id = p_item_id;
  exception when foreign_key_violation then
    raise exception 'Cannot delete: this item is already recorded against school visits';
  end;

  perform public.write_audit('veda_stationery.delete', 'veda_stationery_items', p_item_id,
    jsonb_build_object('name', target.name, 'code', target.code));

  return jsonb_build_object('status','ok','stationery_item_id', p_item_id);
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.veda_admin_upsert_stationery_item(text, text, sku_status, uuid),
  public.veda_admin_delete_stationery_item(uuid)
to authenticated;

commit;