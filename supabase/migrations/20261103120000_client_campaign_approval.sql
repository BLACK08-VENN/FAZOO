-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Brand clients request campaigns; administrators approve them.
--
-- Brand clients are analytics-only stakeholders. Their sole write action is
-- requesting a campaign. Requests land in `pending_approval`, and an
-- organization/super administrator activates or rejects them. Client access to
-- ambassador profile rows is removed so analytics cannot expose personal data.
-- ═══════════════════════════════════════════════════════════════════════════

alter type public.campaign_status add value if not exists 'pending_approval' after 'draft';
alter type public.campaign_status add value if not exists 'rejected' after 'cancelled';

-- The new enum values must be committed before functions can reference them.
commit;
begin;

alter table public.campaigns
  add column if not exists requested_by uuid references public.profiles(id),
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

-- Clients may read only their own profile. Organization-wide profile reads stay
-- available to staff. Photo rows and per-BA assignment rows are withdrawn too:
-- clients only need aggregate activity, never ambassador identities or media.
drop policy if exists client_read_profiles on public.profiles;
drop policy if exists client_read_photos on public.daily_log_photos;
drop policy if exists client_read_assignments on public.brand_ambassador_assignments;

-- Storage follows the same rule: clients no longer mint signed URLs for
-- profile or daily-log photos (those can contain selfies and other personal
-- media). Staff roles keep organization-wide photo access.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists storage_read_org_admin on storage.objects;
  create policy storage_read_org_admin on storage.objects
    for select to authenticated
    using (
      bucket_id in ('profile-photos','daily-log-photos')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.account_status = 'approved'
          and (
            p.role = 'super_admin'
            or (
              p.organization_id::text = (storage.foldername(name))[1]
              and p.role in ('organization_admin','supervisor')
            )
          )
      )
    );
end $$;
drop policy if exists profiles_select_scoped on public.profiles;
create policy profiles_select_scoped on public.profiles
  for select using (
    id = auth.uid()
    or (
      public.can_read_org(organization_id)
      and not public.is_client()
    )
  );

-- ── Client creates a campaign request ───────────────────────────────────────
create or replace function public.client_create_campaign(
  p_client_request_id uuid,
  p_name text,
  p_description text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor        public.profiles;
  receipt      public.operation_receipts;
  operation_key text;
  v_campaign   public.campaigns;
  v_name       text;
  v_desc       text;
  v_start      date;
  result       jsonb;
begin
  select p.* into actor
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = auth.uid()
      and p.account_status = 'approved'
      and o.status = 'active';
  if actor.id is null or actor.role::text <> 'client' then
    raise exception 'Only approved brand clients can request a campaign' using errcode = '42501';
  end if;

  if p_client_request_id is null then
    raise exception 'A request identifier is required' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Campaign name must be between 2 and 120 characters' using errcode = '22023';
  end if;

  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 2000 then
    raise exception 'Description must be 2000 characters or fewer' using errcode = '22023';
  end if;

  v_start := coalesce(p_start_date, (now() at time zone 'Africa/Lagos')::date);
  if p_end_date is not null and p_end_date < v_start then
    raise exception 'End date must be on or after the start date' using errcode = '22023';
  end if;

  operation_key := 'client.campaign.create:' || md5(jsonb_build_object(
    'name', v_name,
    'description', v_desc,
    'start_date', v_start,
    'end_date', p_end_date
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_request_id::text, 0)
  );
  select * into receipt from public.operation_receipts
    where client_request_id = p_client_request_id;
  if found then
    if receipt.brand_ambassador_id <> actor.id
      or receipt.organization_id <> actor.organization_id
      or receipt.operation <> operation_key then
      raise exception 'Request identifier already used' using errcode = '42501';
    end if;
    return receipt.result;
  end if;

  if not public.check_rate_limit('client.campaign:' || actor.id::text, 10, 3600) then
    raise exception 'Too many campaign requests; try again later' using errcode = '42900';
  end if;

  insert into public.campaigns
    (organization_id, name, description, start_date, end_date, status, requested_by)
  values
    (actor.organization_id, v_name, v_desc, v_start, p_end_date, 'pending_approval', actor.id)
  returning * into v_campaign;

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values
    (actor.organization_id, actor.id, 'campaign.request', 'campaigns', v_campaign.id,
     jsonb_build_object('name', v_campaign.name, 'status', v_campaign.status));

  result := jsonb_build_object(
    'status', 'ok',
    'campaign_id', v_campaign.id,
    'campaign_status', v_campaign.status
  );

  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values
    (actor.organization_id, actor.id, p_client_request_id, operation_key, result);

  return result;
end;
$$;

-- ── Administrator activates or rejects a campaign request ───────────────────
create or replace function public.admin_review_campaign(
  p_client_request_id uuid,
  p_campaign_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor         public.profiles;
  receipt       public.operation_receipts;
  operation_key text;
  v_campaign    public.campaigns;
  v_status      public.campaign_status;
  v_note        text;
  result        jsonb;
begin
  select p.* into actor
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = auth.uid()
      and p.account_status = 'approved'
      and o.status = 'active';
  if actor.id is null
    or actor.role::text not in ('super_admin', 'organization_admin') then
    raise exception 'Only administrators can review campaign requests' using errcode = '42501';
  end if;

  if p_client_request_id is null then
    raise exception 'A request identifier is required' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = '42501';
  end if;
  if actor.role::text = 'organization_admin'
    and v_campaign.organization_id <> actor.organization_id then
    raise exception 'Cross-organization access denied' using errcode = '42501';
  end if;
  if v_campaign.status <> 'pending_approval' then
    raise exception 'Campaign is not awaiting approval' using errcode = '40001';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'Review note must be 2000 characters or fewer' using errcode = '22023';
  end if;

  operation_key := 'admin.campaign.review:' || md5(jsonb_build_object(
    'campaign_id', p_campaign_id,
    'decision', p_decision,
    'note', v_note
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_request_id::text, 0)
  );
  select * into receipt from public.operation_receipts
    where client_request_id = p_client_request_id;
  if found then
    if receipt.brand_ambassador_id <> actor.id
      or receipt.organization_id <> actor.organization_id
      or receipt.operation <> operation_key then
      raise exception 'Request identifier already used' using errcode = '42501';
    end if;
    return receipt.result;
  end if;

  if not public.check_rate_limit('admin.campaign.review:' || actor.id::text, 60, 3600) then
    raise exception 'Too many campaign reviews; try again later' using errcode = '42900';
  end if;

  v_status := case when p_decision = 'approve' then 'active' else 'rejected' end;

  update public.campaigns
    set status = v_status,
        reviewed_by = actor.id,
        reviewed_at = now(),
        review_note = v_note,
        updated_at = now()
    where id = v_campaign.id
    returning * into v_campaign;

  insert into public.audit_logs
    (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values
    (v_campaign.organization_id, actor.id,
     case when p_decision = 'approve' then 'campaign.approve' else 'campaign.reject' end,
     'campaigns', v_campaign.id,
     jsonb_build_object('status', v_campaign.status, 'note', v_note));

  result := jsonb_build_object(
    'status', 'ok',
    'campaign_id', v_campaign.id,
    'campaign_status', v_campaign.status
  );

  insert into public.operation_receipts
    (organization_id, brand_ambassador_id, client_request_id, operation, result)
  values
    (actor.organization_id, actor.id, p_client_request_id, operation_key, result);

  return result;
end;
$$;

revoke all on function public.client_create_campaign(uuid, text, text, date, date) from public, anon;
revoke all on function public.admin_review_campaign(uuid, uuid, text, text) from public, anon;
grant execute on function public.client_create_campaign(uuid, text, text, date, date) to authenticated;
grant execute on function public.admin_review_campaign(uuid, uuid, text, text) to authenticated;
