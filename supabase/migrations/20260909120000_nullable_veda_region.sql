-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Allow null region on veda_assignments
--
-- Some BAs are assigned without a specific region (e.g. floating / roaming
-- roles).  Making `region` nullable lets admins create assignments where
-- the region is "not applicable" while still enforcing the constraint for
-- all region-specific assignments.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1. Make the column nullable (existing rows keep their region values).
alter table public.veda_assignments
  alter column region drop not null;

-- 2. Relax the RPC validation so it accepts a null/empty region.
drop function if exists public.veda_admin_upsert_assignment(uuid, text, smallint[], date, date, assignment_status, uuid);

create function public.veda_admin_upsert_assignment(
  p_brand_ambassador_id uuid,
  p_region              text,
  p_weekly_off_day      smallint[] default null,
  p_start_date          date default null,
  p_end_date            date default null,
  p_status              assignment_status default 'active',
  p_assignment_id       uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  ba    public.profiles;
  off   smallint[];
  v_id  uuid;
  norm_region text;
begin
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
$$;

-- 3. Re-grant the unchanged signature (types haven't changed, just NULLability).
grant execute on function
  public.veda_admin_upsert_assignment(uuid, text, smallint[], date, date, assignment_status, uuid)
to authenticated;

commit;
