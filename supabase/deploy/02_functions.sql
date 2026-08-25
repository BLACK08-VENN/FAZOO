-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00002 — helper functions, triggers, updated_at maintenance, audit.
-- SECURITY DEFINER helpers resolve identity from the JWT — the client never
-- supplies organization ids, roles or approval status.
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety: ensure no stale functions from a prior partial run
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.current_profile() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role_hint() CASCADE;
DROP FUNCTION IF EXISTS public.account_status_active() CASCADE;
DROP FUNCTION IF EXISTS public.is_org_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.supervisor_can_see_store(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.supervisor_can_see_campaign(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_read_org(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.distance_metres(double precision, double precision, double precision, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.write_audit(text, text, uuid, jsonb, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.audit_row_change() CASCADE;
DROP FUNCTION IF EXISTS public.guard_profile_update() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- ── updated_at maintenance ──────────────────────────────────────────────────
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','campaigns','stores','brand_ambassador_assignments',
    'skus','daily_logs','sales_entries'
  ] loop
    execute format('create trigger set_updated_at_%s before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ── current profile (SECURITY DEFINER to avoid RLS recursion) ───────────────
create function public.current_profile()
returns table (
  id              uuid,
  organization_id uuid,
  role            app_role,
  account_status  account_status
)
language sql stable security definer set search_path = public as $$
  select p.id, p.organization_id, p.role, p.account_status
  from public.profiles p
  where p.id = auth.uid();
$$;

create function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

-- Role of the caller, or null when unauthenticated (used in RLS policies).
create function public.current_user_role_hint()
returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Approved-account guard for self-service reads.
create function public.account_status_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'approved'
  );
$$;

create function public.is_org_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and organization_id = p_organization_id
      and role in ('super_admin','organization_admin')
      and account_status = 'approved'
  );
$$;

-- Supervisor visibility scope (stores / campaigns explicitly assigned).
-- Store-scoped rows grant the store; campaign-scoped rows grant every store
-- carrying an assignment under that campaign.
create function public.supervisor_can_see_store(p_supervisor_id uuid, p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.supervisor_scopes s
    where s.supervisor_id = p_supervisor_id
      and s.store_id = p_store_id
  ) or exists (
    select 1
    from public.supervisor_scopes s
    join public.brand_ambassador_assignments a on a.campaign_id = s.campaign_id
    where s.supervisor_id = p_supervisor_id
      and a.store_id = p_store_id
  );
$$;

create function public.supervisor_can_see_campaign(p_supervisor_id uuid, p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.supervisor_scopes s
    where s.supervisor_id = p_supervisor_id
      and (s.campaign_id = p_campaign_id or s.campaign_id is null)
  );
$$;

-- Can the caller read operational data belonging to this organization?
create function public.can_read_org(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_status in ('approved')
      and (
        role = 'super_admin'
        or (organization_id = p_organization_id
            and role in ('organization_admin','supervisor'))
      )
  );
$$;

-- ── haversine distance (authoritative geofence maths) ───────────────────────
create function public.distance_metres(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql immutable strict parallel safe as $$
  select 2 * 6371008.8 * asin(
    least(1.0, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  );
$$;

-- ── audit helper ────────────────────────────────────────────────────────────
create function public.write_audit(
  p_action       text,
  p_entity_type  text,
  p_entity_id    uuid default null,
  p_metadata     jsonb default null,
  p_actor        uuid default auth.uid(),
  p_organization uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  v_org := coalesce(
    p_organization,
    (select organization_id from public.profiles where id = p_actor)
  );
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, p_actor, p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

-- Generic change-audit trigger for admin-curated tables
create function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_id  := old.id;
    v_org := old.organization_id;
    perform public.write_audit(lower(tg_table_name) || '.delete', tg_table_name, v_id,
      to_jsonb(old) - 'id' - 'organization_id', auth.uid(), v_org);
    return old;
  else
    v_id  := new.id;
    v_org := new.organization_id;
    perform public.write_audit(lower(tg_table_name) || '.' || lower(tg_op), tg_table_name, v_id,
      jsonb_build_object('after', to_jsonb(new) - 'updated_at'), auth.uid(), v_org);
    return new;
  end if;
end;
$$;

create trigger audit_campaigns  after insert or update or delete on public.campaigns
  for each row execute function public.audit_row_change();
create trigger audit_stores     after insert or update or delete on public.stores
  for each row execute function public.audit_row_change();
create trigger audit_skus       after insert or update or delete on public.skus
  for each row execute function public.audit_row_change();

-- ── profile lifecycle guards ────────────────────────────────────────────────
-- Non-admins may edit only their own display fields; they can never touch
-- organization, role or account_status (privilege-escalation guard).
create function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller_role app_role; caller_org uuid; caller_status account_status;
begin
  select organization_id, role, account_status into caller_org, caller_role, caller_status
  from public.profiles where id = auth.uid();

  if caller_role is null then
    raise exception 'Unauthenticated profile update';
  end if;

  if caller_role not in ('super_admin') then
    if new.organization_id is distinct from old.organization_id
       or new.role is distinct from old.role
       or new.account_status is distinct from old.account_status then
      if not (caller_role in ('organization_admin') and caller_org = old.organization_id) then
        raise exception 'Changing organization, role or approval status requires an administrator';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── auto-create profile on signup ───────────────────────────────────────────
-- Registration supplies full_name/phone/organization_slug via user_metadata.
-- New accounts always start pending; admins approve through admin RPCs.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org
  from public.organizations
  where slug = coalesce(nullif(new.raw_user_meta_data->>'organization_slug', ''), 'lenovo-nigeria')
  limit 1;

  insert into public.profiles (id, organization_id, full_name, phone, role, account_status)
  values (
    new.id,
    v_org,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'brand_ambassador',
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
