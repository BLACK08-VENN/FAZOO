-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00013 — Create a brand (tenant) end-to-end from the admin portal.
--
-- Adds:
--   • an `organizations_insert` RLS policy scoped to approved super admins
--     so the create-brand wizard can insert a tenant row directly
--   • a `create_brand` SECURITY DEFINER RPC that, in one audited transaction,
--     creates the organization, its first campaign, an org-admin membership
--     for the supplied brand admin, approved brand_ambassador memberships for
--     a list of existing BAs, and optionally a first store + assignments.
--
-- Auth-user creation (the brand admin account) can never happen in SQL, so
-- the admin app creates that auth user via the Auth Admin API BEFORE calling
-- this RPC and passes the resulting user id as `p_brand_admin_user_id`.
--
-- All business rules are enforced server-side: caller must be an approved
-- admin; BA ids must reference real, approved brand ambassadors; the slug
-- must be unique and well-formed.
-- ═══════════════════════════════════════════════════════════════════════════

-- Direct tenant INSERT: only approved super admins may add a brand.
create policy organizations_insert_super_admin on public.organizations
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.account_status = 'approved'
        and p.role = 'super_admin'
    )
  );

-- ── create_brand ────────────────────────────────────────────────────────────
create or replace function public.create_brand(
  p_name text,
  p_slug text,
  p_brand_admin_user_id uuid,
  p_campaign_name text,
  p_campaign_start date,
  p_timezone text default 'Africa/Lagos',
  p_access_code text default null,
  p_campaign_end date default null,
  p_store_name text default null,
  p_store_address text default null,
  p_store_lat double precision default null,
  p_store_lng double precision default null,
  p_store_radius int default 200,
  p_ba_user_ids uuid[] default '{}',
  p_weekly_off_day smallint default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  caller public.profiles;
  v_org_id uuid;
  v_campaign_id uuid;
  v_store_id uuid;
  v_gate boolean;
  v_code text;
  v_name text;
  ba uuid;
  v_added_bas integer := 0;
  v_assigned integer := 0;
begin
  -- ── authorize ──────────────────────────────────────────────────────────────
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or caller.account_status <> 'approved'
     or caller.role <> 'super_admin' then
    raise exception 'Not permitted';
  end if;

  -- ── validate inputs ────────────────────────────────────────────────────────
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

  -- ── organization ──────────────────────────────────────────────────────────
  v_gate := p_access_code is not null and nullif(trim(p_access_code), '') is not null;
  v_code := case when v_gate then trim(p_access_code) else null end;

  insert into public.organizations
    (name, slug, timezone, has_code_gate, access_code, status)
  values
    (trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_timezone), ''), 'Africa/Lagos'),
     v_gate, v_code, 'active')
  returning id into v_org_id;

  -- ── campaign ──────────────────────────────────────────────────────────────
  v_name := coalesce(nullif(trim(p_campaign_name), ''), 'Brand Launch');
  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status)
  values
    (v_org_id, v_name,
     'Initial campaign for ' || trim(p_name),
     coalesce(p_campaign_start, current_date),
     p_campaign_end, 'active')
  returning id into v_campaign_id;

  -- ── brand-admin membership (drives their profile to org_admin/approved) ───
  insert into public.organization_memberships
    (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
  values
    (p_brand_admin_user_id, v_org_id, 'organization_admin', 'approved', v_code,
     case when v_gate then now() else null end);

  -- ── first store (optional) ────────────────────────────────────────────────
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

  -- ── link existing BAs ─────────────────────────────────────────────────────
  foreach ba in array (select coalesce(p_ba_user_ids, '{}'::uuid[])) loop
    -- Only real, approved brand ambassadors may be linked.
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

    -- Optionally assign to the first store + campaign so they are immediately usable.
    if v_store_id is not null then
      insert into public.brand_ambassador_assignments
        (organization_id, brand_ambassador_id, campaign_id, store_id,
         weekly_off_day, start_date, end_date, status)
      values
        (v_org_id, ba, v_campaign_id, v_store_id,
         p_weekly_off_day, coalesce(p_campaign_start, current_date),
         p_campaign_end, 'active');
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  -- ── audit ─────────────────────────────────────────────────────────────────
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
$$;

grant execute on function public.create_brand(
  text, text, uuid, text, date,
  text, text, date, text, text, double precision, double precision, int, uuid[], smallint
) to authenticated;
