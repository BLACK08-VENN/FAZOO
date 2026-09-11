-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Daily school targets for brand ambassadors.
--
-- AEL brand ambassadors are held to a minimum number of SCHOOLS A DAY (7 by
-- default). Veda BAs have no daily target. The daily figure is read through
-- `ba_visit_rules` (organizations.settings -> 'agency_rules' -> agency ->
-- 'target_daily_schools', defaulting to 7 for AEL), with a per-BA, per-period
-- override stored on `ba_school_targets.target_daily_schools` alongside the
-- existing monthly target.
--
-- New surfaces:
--   • `ba_visit_rules`            gains target_daily_schools
--   • `ba_school_targets`         gains target_daily_schools (nullable override)
--   • `admin_set_ba_target`       accepts + stores the daily override
--   • `admin_ba_daily_targets`    staff dashboard: who hit today's number
--   • `ba_visit_stats`            BA's own scoreboard gains today's distinct
--                                 schools and their effective daily target
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── ba_visit_rules: daily target per agency ─────────────────────────────────
-- Default 7 for AEL, none for Veda; an organization can override via
-- settings -> agency_rules -> <agency> -> target_daily_schools.
create or replace function public.ba_visit_rules(p_organization_id uuid, p_agency public.ba_agency)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agency', coalesce(p_agency, 'veda'),
    'selfie_required', coalesce(
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'selfie_required')::boolean
         from public.organizations o where o.id = p_organization_id),
      coalesce(p_agency, 'veda') = 'ael'
    ),
    'geofence_enforced', coalesce(
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'geofence_enforced')::boolean
         from public.organizations o where o.id = p_organization_id),
      false
    ),
    'target_schools_per_month',
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'target_schools_per_month')::integer
         from public.organizations o where o.id = p_organization_id),
    'target_daily_schools', coalesce(
      (select (o.settings -> 'agency_rules' -> coalesce(p_agency, 'veda')::text ->> 'target_daily_schools')::integer
         from public.organizations o where o.id = p_organization_id),
      case when coalesce(p_agency, 'veda') = 'ael' then 7 end
    )
  );
$$;

-- ── ba_school_targets: per-BA daily override ────────────────────────────────
alter table public.ba_school_targets
  add column if not exists target_daily_schools integer check (target_daily_schools >= 0);

-- ── admin_set_ba_target: accept the daily override ──────────────────────────
-- A null daily value clears the override and lets the agency default apply.
drop function if exists public.admin_set_ba_target(uuid, date, date, integer, uuid);
create or replace function public.admin_set_ba_target(
  p_ba_id              uuid,
  p_period_start       date,
  p_period_end         date,
  p_target_schools     integer,
  p_target_id          uuid default null,
  p_target_daily_schools integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p    public.profiles;
  v_id uuid;
  v_daily integer := nullif(p_target_daily_schools, -1);
begin
  p := public.assert_org_admin();

  if p_period_end < p_period_start then
    raise exception 'The target period must end after it starts';
  end if;
  if p_target_schools is null or p_target_schools < 0 then
    raise exception 'Target schools must be zero or more';
  end if;
  if v_daily is not null and v_daily < 0 then
    raise exception 'Daily target schools must be zero or more';
  end if;

  perform 1 from public.profiles pr
   where pr.id = p_ba_id and pr.organization_id = p.organization_id
     and pr.role = 'brand_ambassador';
  if not found then
    raise exception 'Brand ambassador not found in your organization';
  end if;

  if p_target_id is null then
    insert into public.ba_school_targets (
      organization_id, brand_ambassador_id, agency, period_start, period_end,
      target_schools, target_daily_schools, created_by
    )
    select p.organization_id, p_ba_id, pr.agency, p_period_start, p_period_end,
           p_target_schools, v_daily, p.id
      from public.profiles pr where pr.id = p_ba_id
    on conflict (brand_ambassador_id, period_start, period_end)
    do update set target_schools       = excluded.target_schools,
                  target_daily_schools = excluded.target_daily_schools,
                  agency               = excluded.agency,
                  updated_at           = now()
    returning id into v_id;
  else
    update public.ba_school_targets
       set period_start         = p_period_start,
           period_end           = p_period_end,
           target_schools       = p_target_schools,
           target_daily_schools = case when p_target_daily_schools = -1
                                       then null else coalesce(v_daily, target_daily_schools) end,
           updated_at           = now()
     where id = p_target_id and organization_id = p.organization_id
     returning id into v_id;
    if v_id is null then raise exception 'Target not found'; end if;
  end if;

  perform public.write_audit('ba_school_target.upsert', 'ba_school_targets', v_id,
    jsonb_build_object('ba_id', p_ba_id, 'period_start', p_period_start,
                       'period_end', p_period_end, 'target_schools', p_target_schools,
                       'target_daily_schools', v_daily),
    p.id, p.organization_id);

  return jsonb_build_object('status', 'ok', 'operation', 'admin_set_ba_target',
                            'target_id', v_id, 'ba_id', p_ba_id,
                            'target_schools', p_target_schools,
                            'target_daily_schools', v_daily);
end;
$$;

-- ── Daily progress board (admin / supervisor) ───────────────────────────────
-- Per approved BA: their effective daily target for the date, how many
-- distinct schools they reached that day (what the target is measured
-- against), how many visits that took, and how many of the trailing seven
-- days they met their daily number.
create or replace function public.admin_ba_daily_targets(
  p_date date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p     public.profiles;
  org   public.organizations;
  v_date date;
begin
  p := public.assert_org_staff();
  select * into org from public.organizations where id = p.organization_id;
  v_date := coalesce(p_date, (now() at time zone coalesce(org.timezone, 'UTC'))::date);

  return (
    with base as (
      select
        pr.id                     as ba_id,
        pr.full_name,
        pr.phone,
        pr.agency,
        tgt.target_daily_schools,
        tgt.days_met_last_7_days,
        coalesce((select count(distinct v.school_id) from public.school_visits v
                   where v.brand_ambassador_id = pr.id and v.visit_date = v_date), 0)
                                    as schools_visited_today,
        coalesce((select count(*) from public.school_visits v
                   where v.brand_ambassador_id = pr.id and v.visit_date = v_date), 0)
                                    as visits_today
        from public.profiles pr
        left join lateral (
          select coalesce(bt.target_daily_schools,
                   (public.ba_visit_rules(pr.organization_id, pr.agency)->>'target_daily_schools')::integer)
                    as target_daily_schools,
                 coalesce((
                   select count(*)
                     from (
                       select v2.visit_date
                         from public.school_visits v2
                        where v2.brand_ambassador_id = pr.id
                          and v2.visit_date between v_date - 6 and v_date
                        group by v2.visit_date
                       having count(distinct v2.school_id) >= coalesce(
                            bt.target_daily_schools,
                            (public.ba_visit_rules(pr.organization_id, pr.agency)->>'target_daily_schools')::integer)
                     ) met
                 ), 0)            as days_met_last_7_days
            from public.ba_school_targets bt
           where bt.brand_ambassador_id = pr.id
             and bt.period_start <= v_date and bt.period_end >= v_date
           order by bt.period_start desc
           limit 1
        ) tgt on true
       where pr.organization_id = p.organization_id
         and pr.role = 'brand_ambassador'
         and pr.account_status = 'approved'
    )
    select jsonb_build_object(
      'status', 'ok',
      'date', v_date,
      'default_target_daily_schools',
        (select (public.ba_visit_rules(p.organization_id, 'ael')->>'target_daily_schools')::integer),
      'rows', (
        select coalesce(jsonb_agg(to_jsonb(base)::jsonb
                           order by base.agency nulls last, base.full_name), '[]'::jsonb)
          from base
      ),
      'summary', (
        select jsonb_build_object(
          'bas_on_roster',        count(*),
          'bas_with_daily_target', count(*) filter (where base.target_daily_schools is not null),
          'bas_active_today',     count(*) filter (where base.schools_visited_today > 0),
          'bas_on_target_today',  count(*) filter (where base.target_daily_schools is not null
                                                    and base.schools_visited_today >= base.target_daily_schools),
          'bas_missed_today',     count(*) filter (where base.target_daily_schools is not null
                                                    and base.schools_visited_today < base.target_daily_schools),
          'schools_logged_today', coalesce(sum(base.schools_visited_today), 0),
          'compliance_pct', case when count(*) filter (where base.target_daily_schools is not null) = 0
                                 then null
                                 else round(100.0 * count(*) filter (where base.target_daily_schools is not null
                                                                       and base.schools_visited_today >= base.target_daily_schools)
                                             / count(*) filter (where base.target_daily_schools is not null)) end
        ) from base
      )
    )
  );
end;
$$;

-- ── BA's own scoreboard: today's distinct schools + effective daily target ──
drop function if exists public.ba_visit_stats();
create or replace function public.ba_visit_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p        public.profiles;
  org      public.organizations;
  rules    jsonb;
  v_today  date;
  m_start  date;
  m_end    date;
  tgt      record;
  v_daily  integer;
begin
  p := public.assert_school_ba();
  select * into org from public.organizations where id = p.organization_id;
  rules   := public.ba_visit_rules(p.organization_id, p.agency);
  v_today := (now() at time zone coalesce(org.timezone, 'UTC'))::date;
  m_start := date_trunc('month', v_today)::date;
  m_end   := (m_start + interval '1 month - 1 day')::date;

  select t.* into tgt
    from public.ba_school_targets t
   where t.brand_ambassador_id = p.id
     and t.period_start <= v_today and t.period_end >= v_today
   order by t.period_start desc
   limit 1;

  v_daily := coalesce(tgt.target_daily_schools, (rules->>'target_daily_schools')::integer);

  return jsonb_build_object(
    'status', 'ok',
    'agency', p.agency,
    'selfie_required', (rules->>'selfie_required')::boolean,
    'geofence_enforced', coalesce((rules->>'geofence_enforced')::boolean, false),
    'today', v_today,
    'visits_today', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date = v_today
    ),
    'schools_visited_today', (
      select count(distinct v.school_id) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date = v_today
    ),
    'target_daily_schools', v_daily,
    'visits_this_month', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date between m_start and m_end
    ),
    'schools_visited_total', (
      select count(distinct v.school_id) from public.school_visits v
       where v.brand_ambassador_id = p.id
    ),
    'schools_visited_this_month', (
      select count(distinct v.school_id) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.visit_date between m_start and m_end
    ),
    'booklists_collected', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.outcome = 'booklist_offered'
    ),
    'declines_recorded', (
      select count(*) from public.school_visits v
       where v.brand_ambassador_id = p.id and v.outcome = 'declined'
    ),
    'selfie_compliance', (
      select jsonb_build_object(
        'required', count(*) filter (where v.selfie_required),
        'captured', count(*) filter (where v.selfie_required and v.selfie_photo_path is not null),
        'missing',  count(*) filter (where v.selfie_required and v.selfie_photo_path is null)
      )
      from public.school_visits v where v.brand_ambassador_id = p.id
    ),
    'target', case when tgt.id is null then null else jsonb_build_object(
        'period_start', tgt.period_start, 'period_end', tgt.period_end,
        'target_schools', tgt.target_schools
      ) end,
    'default_target_schools_per_month', rules->'target_schools_per_month'
  );
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.admin_set_ba_target(uuid, date, date, integer, uuid, integer) to authenticated;
grant execute on function public.admin_ba_daily_targets(date) to authenticated;
grant execute on function public.ba_visit_stats() to authenticated;
grant execute on function public.ba_visit_rules(uuid, public.ba_agency) to authenticated;

revoke execute on function public.assert_org_staff() from public, anon;
revoke execute on function public.assert_org_admin() from public, anon;

commit;