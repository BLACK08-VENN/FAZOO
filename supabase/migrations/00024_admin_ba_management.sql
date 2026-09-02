-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00024 — admin BA management (add / delete)
--
-- Adding a BA:
--   • The server action creates the auth user (never possible in SQL) via the
--     Supabase auth admin API. handle_new_user() drops a transient temp profile
--     defaulting to the first brand; admin_create_ba() then re-points that user
--     to the acting admin's organization, provisions an approved membership and
--     an assignment, all tenant-scoped and audited.
--
-- Deleting a BA:
--   • admin_delete_ba() verifies scope, removes the profile (cascading to its
--     assignments, daily logs, sales entries and leave requests) and audits it.
--     The server action afterwards removes the underlying auth identity so the
--     login itself is gone and their memberships cascade away too.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── admin_create_ba ──────────────────────────────────────────────────────────
create function public.admin_create_ba(
  p_user_id        uuid,
  p_campaign_id    uuid,
  p_store_id       uuid,
  p_weekly_off_day smallint,
  p_start_date     date,
  p_end_date       date default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor     public.profiles;
  target    public.profiles;
  camp      public.campaigns;
  st        public.stores;
  mem_id    uuid;
  v_id      uuid;
begin
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

  select * into camp from public.campaigns
   where id = p_campaign_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if camp.id is null then raise exception 'Campaign not found or inactive.'; end if;

  select * into st from public.stores
   where id = p_store_id and status = 'active'
     and (actor.role = 'super_admin' or organization_id = actor.organization_id);
  if st.id is null then raise exception 'Store not found or inactive.'; end if;

  if p_weekly_off_day not between 0 and 6 then
    raise exception 'Weekly off day must be 0–6.';
  end if;
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

  -- Close any active assignment for the BA, then assign (one active per BA).
  update public.brand_ambassador_assignments
     set status = 'ended', end_date = least(p_start_date - 1, current_date)
   where brand_ambassador_id = p_user_id and status = 'active';

  insert into public.brand_ambassador_assignments
    (organization_id, brand_ambassador_id, campaign_id, store_id,
     weekly_off_day, start_date, end_date, status)
  values
    (actor.organization_id, p_user_id, p_campaign_id, p_store_id,
     p_weekly_off_day, p_start_date, p_end_date, 'active')
  returning id into v_id;

  perform public.write_audit(
    'profile.create_ba', 'profiles', p_user_id,
    jsonb_build_object(
      'membership_id', mem_id,
      'campaign_id', p_campaign_id,
      'store_id', p_store_id,
      'assignment_id', v_id,
      'weekly_off_day', p_weekly_off_day,
      'start_date', p_start_date,
      'end_date', p_end_date
    )
  );

  return jsonb_build_object(
    'status', 'ok',
    'profile_id', p_user_id,
    'membership_id', mem_id,
    'assignment_id', v_id
  );
end;
$$;

-- ── admin_delete_ba ──────────────────────────────────────────────────────────
create function public.admin_delete_ba(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor  public.profiles;
  target public.profiles;
begin
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
$$;

grant execute on function
  public.admin_create_ba(uuid, uuid, uuid, smallint, date, date),
  public.admin_delete_ba(uuid)
  to authenticated;
