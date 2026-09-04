-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00029 — Campaign & Veda school self-serve access via passcode.
--
-- A BA now browses ALL of their org's campaigns / schools (not just the ones
-- they are pre-assigned to) and unlocks a given one with a per-entity access
-- code before adding logs. The access code is stored server-side only and is
-- NEVER returned to the client; listing + unlocking go through SECURITY
-- DEFINER RPCs and grant/revoke nothing beyond a recorded, scoped unlock.
--
-- Non-negotiable rules honoured: RLS everywhere, mutations via SECURITY
-- DEFINER RPCs, no trust of client-supplied codes, unlock rows audited.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Optional per-entity access codes ─────────────────────────────────────
alter table public.campaigns
  add column if not exists access_code text;

alter table public.veda_schools
  add column if not exists access_code text;

-- ── 2. Unlock ledger: one row per BA + entity, idempotent ───────────────────
create table if not exists public.campaign_unlocks (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.veda_school_unlocks (
  school_id   uuid not null references public.veda_schools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

alter table public.campaign_unlocks     enable row level security;
alter table public.veda_school_unlocks  enable row level security;

-- A BA may read / write only their own unlock rows (self-service).
create policy campaign_unlocks_self on public.campaign_unlocks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy veda_school_unlocks_self on public.veda_school_unlocks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Org admins may inspect unlocks in their org for support/auditing.
create policy campaign_unlocks_admin on public.campaign_unlocks
  for select using (public.is_org_admin(
    (select organization_id from public.campaigns where id = campaign_id)
  ));
create policy veda_school_unlocks_admin on public.veda_school_unlocks
  for select using (public.is_org_admin(
    (select organization_id from public.veda_schools where id = school_id)
  ));

grant select, insert, update, delete on public.campaign_unlocks, public.veda_school_unlocks
  to authenticated;

-- ── 3. List ALL active campaigns in the BA's org (never the codes) ───────────
create or replace function public.ba_list_campaigns()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p    public.profiles;
  rows jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  select coalesce(
           jsonb_agg(j order by j->>'start_date' desc),
           '[]'::jsonb
         )
    into rows
  from (
    select jsonb_build_object(
             'campaign_id', c.id,
             'campaign_name', c.name,
             'status', c.status,
             'start_date', c.start_date,
             'end_date', c.end_date,
             'stores', coalesce(st.stores, '[]'::jsonb),
             'locked', (c.access_code is not null and nullif(trim(c.access_code), '') is not null),
             'unlocked', exists (
               select 1 from public.campaign_unlocks u
               where u.campaign_id = c.id and u.user_id = p.id
             )
           ) j
    from public.campaigns c
    left join lateral (
      select jsonb_agg(distinct s.name) as stores
        from public.brand_ambassador_assignments a
        join public.stores s on s.id = a.store_id
       where a.campaign_id = c.id and a.status = 'active'
    ) st on true
    where c.organization_id = p.organization_id
      and c.status = 'active'
  ) t;

  return coalesce(rows, '[]'::jsonb);
end;
$$;

grant execute on function public.ba_list_campaigns() to authenticated;

-- ── 4. List ALL active schools in the BA's org (never the codes) ─────────────
create or replace function public.ba_list_veda_schools()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p    public.profiles;
  rows jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  select coalesce(
           jsonb_agg(j order by j->>'school_name'),
           '[]'::jsonb
         )
    into rows
  from (
    select jsonb_build_object(
             'school_id', c.id,
             'school_name', c.name,
             'school_region', c.region,
             'status', c.status,
             'locked', (c.access_code is not null and nullif(trim(c.access_code), '') is not null),
             'unlocked', exists (
               select 1 from public.veda_school_unlocks u
               where u.school_id = c.id and u.user_id = p.id
             )
           ) j
    from public.veda_schools c
    where c.organization_id = p.organization_id
      and c.status = 'active'
  ) t;

  return coalesce(rows, '[]'::jsonb);
end;
$$;

grant execute on function public.ba_list_veda_schools() to authenticated;

-- ── 5. Unlock a campaign with its access code ────────────────────────────────
create or replace function public.ba_unlock_campaign(p_campaign_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p    public.profiles;
  c    public.campaigns;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  select * into c from public.campaigns where id = p_campaign_id;
  if c.id is null or c.organization_id <> p.organization_id then
    raise exception 'Campaign not found in your organization';
  end if;
  if c.status <> 'active' then
    raise exception 'Campaign is not active';
  end if;

  -- Only enforce a code when one is actually set for the campaign.
  if c.access_code is not null and nullif(trim(c.access_code), '') is not null
     and (p_code is null or trim(p_code) <> trim(c.access_code)) then
    raise exception 'invalid access code';
  end if;

  insert into public.campaign_unlocks (campaign_id, user_id)
  values (p_campaign_id, p.id)
  on conflict (campaign_id, user_id) do nothing;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p.organization_id, p.id, 'campaign_unlock', 'campaign', p_campaign_id,
          jsonb_build_object('reason', 'self_serve_passcode'));
end;
$$;

grant execute on function public.ba_unlock_campaign(uuid, text) to authenticated;

-- ── 6. Unlock a Veda school with its access code ─────────────────────────────
create or replace function public.ba_unlock_veda_school(p_school_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  c public.veda_schools;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  select * into c from public.veda_schools where id = p_school_id;
  if c.id is null or c.organization_id <> p.organization_id then
    raise exception 'School not found in your organization';
  end if;
  if c.status <> 'active' then
    raise exception 'School is not active';
  end if;

  if c.access_code is not null and nullif(trim(c.access_code), '') is not null
     and (p_code is null or trim(p_code) <> trim(c.access_code)) then
    raise exception 'invalid access code';
  end if;

  insert into public.veda_school_unlocks (school_id, user_id)
  values (p_school_id, p.id)
  on conflict (school_id, user_id) do nothing;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p.organization_id, p.id, 'school_unlock', 'veda_school', p_school_id,
          jsonb_build_object('reason', 'self_serve_passcode'));
end;
$$;

grant execute on function public.ba_unlock_veda_school(uuid, text) to authenticated;
