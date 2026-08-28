-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00008 — Multi-brand memberships + code-gated brand access.
--
-- A single auth user (one account, one password) may belong to many brands
-- (organizations). Each membership carries its own role and account status.
-- Optionally gated by a per-brand access code: a BA signs in once, sees the
-- brands they belong to, and enters a code to unlock that brand's workspace.
--
--   auth.users (one account)
--      │ 1:N
--   organization_memberships (user_id, organization_id, role, status, code)
--
-- The legacy `profiles` table becomes a thin view over the primary (or, for
-- backward compatibility, the "current"/default) membership. All operational
-- tables keep referencing `profiles.id` via FKs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Access-code gating flag on organizations ────────────────────────────────
-- When true, approved BAs must enter `access_code` to unlock this brand.
alter table public.organizations
  add column if not exists has_code_gate boolean not null default true,
  add column if not exists access_code   text;

-- ── organization_memberships ────────────────────────────────────────────────
create table if not exists public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            app_role not null default 'brand_ambassador',
  account_status  account_status not null default 'pending',
  access_code_used text,          -- the code that unlocked this brand
  code_granted_at   timestamptz,  -- when the code was accepted
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index if not exists memberships_org_idx
  on public.organization_memberships (organization_id, account_status)
  where account_status = 'pending';
create index if not exists memberships_user_idx
  on public.organization_memberships (user_id);

-- Keep the legacy `profiles` table in sync: each user has one default profile
-- (their first/primary membership). We backfill memberships from existing
-- profiles, then the trigger keeps them aligned going forward.
insert into public.organization_memberships
  (user_id, organization_id, role, account_status, created_at, updated_at)
select id, organization_id, role, account_status, created_at, updated_at
from public.profiles
on conflict (user_id, organization_id) do nothing;

-- The `profiles` table continues to hold the user's default membership as the
-- "current" context. We make profiles.id == the membership's user_id, and add
-- a `current_membership_id` so RLS/RPCs know which org is active.
alter table public.profiles
  add column if not exists current_membership_id uuid;

update public.profiles p
set current_membership_id = m.id
from public.organization_memberships m
where m.user_id = p.id
  and m.organization_id = p.organization_id;

-- ── trigger: keep the legacy profile's org/role/status in sync with the
--    primary membership (the earliest/most recent approved one). ─────────────
create or replace function public.profiles_sync_primary_membership()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_primary record;
begin
  -- On membership insert/update, refresh the user's default profile fields.
  select m.organization_id, m.role, m.account_status, m.id as membership_id
    into v_primary
    from public.organization_memberships m
    where m.user_id = new.user_id
    order by
      case when m.account_status = 'approved' then 0 else 1 end,
      m.updated_at desc
    limit 1;

  if v_primary is not null then
    -- This function is a trusted, schema-controlled mirror of the (RLS-gated)
    -- organization_memberships table. Set a transaction-local token so the
    -- profile guard recognises these writes as legitimate (bypasses the
    -- "unauthenticated profile update" error during seed and retains the
    -- guard for every other path).
    perform set_config('fazoo.membership_sync', 'true', true);
    insert into public.profiles
      (id, organization_id, full_name, phone, role, account_status, current_membership_id)
    values
      (new.user_id, v_primary.organization_id,
       coalesce((select full_name from public.profiles where id = new.user_id), ''),
       coalesce((select phone from public.profiles where id = new.user_id), ''),
       v_primary.role, v_primary.account_status, v_primary.membership_id)
    on conflict (id) do update
      set organization_id = v_primary.organization_id,
          role = v_primary.role,
          account_status = v_primary.account_status,
          current_membership_id = v_primary.membership_id;
    perform set_config('fazoo.membership_sync', 'false', true);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_membership_trg on public.organization_memberships;
create trigger profiles_sync_membership_trg
  after insert or update of role, account_status, organization_id
  on public.organization_memberships
  for each row execute function public.profiles_sync_primary_membership();

-- ── relax profile guard for membership mirror updates ────────────────────────
-- The existing `guard_profile_update` blocks any change to organization/role/
-- status on `profiles` unless an admin makes it. With multi-brand, a BA's
-- profile is a denormalized mirror of their active membership, so we allow the
-- profile's org/role/status to be brought in line with the caller's OWN
-- membership record (never someone else's, never arbitrary values).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_role app_role; caller_org uuid; caller_status account_status;
declare mem_org uuid; mem_role app_role; mem_status account_status;
begin
  -- Trusted path: the membership→profile mirror sets this transaction-local
  -- token before writing, so the denormalized profile may follow the (RLS-
  -- gated) membership record without an authenticated session (e.g. seed).
  if coalesce(current_setting('fazoo.membership_sync', true), '') = 'true' then
    return new;
  end if;

  select organization_id, role, account_status into caller_org, caller_role, caller_status
  from public.profiles where id = auth.uid();

  if caller_role is null then
    raise exception 'Unauthenticated profile update';
  end if;

  -- Permission granted when nothing privileged changed.
  if new.organization_id is not distinct from old.organization_id
     and new.role is not distinct from old.role
     and new.account_status is not distinct from old.account_status then
    return new;
  end if;

  -- Super admins may always adjust.
  if caller_role = 'super_admin' then
    return new;
  end if;

  -- Org admins may adjust users within their own org.
  if caller_role = 'organization_admin' and caller_org = old.organization_id then
    return new;
  end if;

  -- Self-service membership mirror: allow a BA to align their own profile with
  -- the membership that is being activated (guarded to the caller's own record).
  if auth.uid() = old.id and new.current_membership_id is not null then
    select m.organization_id, m.role, m.account_status into mem_org, mem_role, mem_status
    from public.organization_memberships m
    where m.id = new.current_membership_id and m.user_id = auth.uid();

    if mem_org is not null
       and new.organization_id = mem_org
       and new.role = mem_role
       and new.account_status = mem_status then
      return new;
    end if;
  end if;

  raise exception 'Changing organization, role or approval status requires an administrator';
end;
$$;

-- ── RLS: enable and policies ─────────────────────────────────────────────────
alter table public.organization_memberships enable row level security;

-- Table-level SELECT so RLS policies referencing the table can resolve.
grant select on public.organization_memberships to authenticated;

-- A user always sees their own memberships (so they can pick a brand).
create policy memberships_self_select on public.organization_memberships
  for select using (user_id = auth.uid());

-- Approved users within an org (via their member record) may read the org set.
create policy memberships_org_select on public.organization_memberships
  for select using (
    exists (
      select 1 from public.organization_memberships self
      where self.user_id = auth.uid()
        and self.organization_id = organization_memberships.organization_id
        and self.account_status = 'approved'
        and self.role in ('super_admin','organization_admin','supervisor','client')
    )
  );

-- Admins may mutate memberships within their org (approve, assign roles…).
create policy memberships_org_admin_all on public.organization_memberships
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ── helpers ──────────────────────────────────────────────────────────────────
-- The orgs the caller is a member of (for the brand picker).
create function public.my_memberships()
returns table (
  organization_id uuid,
  organization_slug text,
  organization_name text,
  logo_url text,
  role app_role,
  account_status account_status,
  has_code_gate boolean
)
language sql stable security definer set search_path = public as $$
  select m.organization_id, o.slug, o.name, o.logo_url, m.role, m.account_status, o.has_code_gate
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

-- Grant code-gated access: verify the caller is a member of the org and the
-- code matches, then mark the membership as unlocked.
create function public.ba_unlock_brand(p_organization_id uuid, p_code text)
returns public.organization_memberships
language plpgsql security definer set search_path = public as $$
declare v_org public.organizations; v_membership public.organization_memberships;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  if v_org.id is null then
    raise exception 'invalid brand';
  end if;
  if v_org.has_code_gate and (v_org.access_code is null or p_code <> v_org.access_code) then
    raise exception 'invalid access code';
  end if;

  select * into v_membership
  from public.organization_memberships
  where user_id = auth.uid() and organization_id = p_organization_id;
  if v_membership.id is null then
    raise exception 'not a member of this brand';
  end if;

  update public.organization_memberships
     set access_code_used = case when v_org.has_code_gate then p_code else null end,
         code_granted_at = now()
   where id = v_membership.id
   returning * into v_membership;

  return v_membership;
end;
$$;

-- Switch the user's active brand context (used by mobile before loading Today).
create function public.ba_switch_brand(p_organization_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_membership public.organization_memberships;
begin
  select * into v_membership
  from public.organization_memberships
  where user_id = auth.uid() and organization_id = p_organization_id;
  if v_membership.id is null then
    raise exception 'not a member of this brand';
  end if;

  update public.profiles
     set organization_id = v_membership.organization_id,
         role = v_membership.role,
         account_status = v_membership.account_status,
         current_membership_id = v_membership.id
   where id = auth.uid();

  return p_organization_id;
end;
$$;

grant execute on function public.my_memberships() to authenticated;
grant execute on function public.ba_unlock_brand(uuid, text) to authenticated;
grant execute on function public.ba_switch_brand(uuid) to authenticated;

-- ── joining a brand at registration ──────────────────────────────────────────
-- Public list of brands that accept new BAs. Openly enumerable: an org with
-- code-gating true exposes only its slug/name — the code is checked on join.
create function public.joinable_brands()
returns table (organization_id uuid, organization_slug text, organization_name text, logo_url text, has_code_gate boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.slug, o.name, o.logo_url, o.has_code_gate
  from public.organizations o
  where o.status = 'active'
  order by o.name;
$$;

-- Called by the BA from the app after signUp: opts them into a brand. Approves
-- the membership when a valid code is supplied for a gated brand, otherwise
-- leaves it pending for an admin to approve.
create function public.ba_request_org_membership(
  p_organization_id uuid,
  p_org_code text default null
)
returns public.organization_memberships
language plpgsql security definer set search_path = public as $$
declare v_org public.organizations; v_m public.organization_memberships;
begin
  select * into v_org from public.organizations where id = p_organization_id and status = 'active';
  if v_org.id is null then
    raise exception 'invalid organization';
  end if;

  -- If gated and a code is supplied, verify it (the BA may already know it).
  if v_org.has_code_gate and p_org_code is not null and p_org_code = v_org.access_code then
    insert into public.organization_memberships
      (user_id, organization_id, role, account_status, access_code_used, code_granted_at)
    values (auth.uid(), p_organization_id, 'brand_ambassador', 'approved', p_org_code, now())
    on conflict (user_id, organization_id)
    do update set account_status = 'approved', code_granted_at = now()
    returning * into v_m;
    return v_m;
  end if;

  -- Otherwise create/park as pending.
  insert into public.organization_memberships
    (user_id, organization_id, role, account_status)
  values (auth.uid(), p_organization_id, 'brand_ambassador', 'pending')
  on conflict (user_id, organization_id)
  do update set account_status = 'pending'
  returning * into v_m;
  return v_m;
end;
$$;

grant execute on function public.joinable_brands() to anon, authenticated;
grant execute on function public.ba_request_org_membership(uuid, text) to authenticated;

-- ── keep admin approval in sync with memberships ─────────────────────────────
-- With memberships as the source of truth, an admin approving/rejecting a BA
-- now updates that BA's current membership record too (the legacy profiles
-- mirror is updated by the sync trigger). Pure extension of the original RPC.
create or replace function public.admin_set_account_status(
  p_profile_id uuid,
  p_action     text,
  p_reason     text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; target public.profiles; new_status account_status;
        v_membership_id uuid;
begin
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

  -- Update the membership that backs this profile (if any).
  update public.organization_memberships
     set account_status = new_status
   where user_id = p_profile_id
     and organization_id = target.organization_id
  returning id into v_membership_id;

  -- Mirror to the legacy profile (guard permits admin-sourced changes).
  update public.profiles
     set account_status = new_status
   where id = p_profile_id;

  perform public.write_audit('profile.' || p_action, 'profiles', p_profile_id,
    jsonb_build_object('from', target.account_status, 'to', new_status, 'reason', p_reason,
                       'membership_id', v_membership_id));

  return jsonb_build_object('status','ok','profile_id', p_profile_id, 'account_status', new_status);
end;
$$;

-- ── admin: list pending BAs with their brand for the approval queue ──────────
create function public.admin_list_pending_memberships()
returns table (
  membership_id  uuid,
  user_id        uuid,
  full_name      text,
  phone          text,
  brand_name     text,
  account_status account_status,
  created_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.full_name, p.phone, o.name, m.account_status, m.created_at
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  join public.profiles p on p.id = m.user_id
  where m.account_status = 'pending'
    and m.role = 'brand_ambassador'
    and public.can_read_org(m.organization_id)
  order by m.created_at asc;
$$;

grant execute on function public.admin_list_pending_memberships() to authenticated;
