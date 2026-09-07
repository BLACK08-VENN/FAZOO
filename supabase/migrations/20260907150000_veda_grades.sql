-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00039 — Veda grades + per-grade stationery distributions.
--
-- Adds a grade / class-band dimension to school visits. A BA chooses which
-- grade (e.g. "ECDE (Playgroup, PP1 & PP2)" or "Lower Primary (Grade 1-3)")
-- received which stationery, so a single visit can reach several grades.
--
--   veda_grades              → admin-managed grade/class bands (org-scoped)
--   veda_grade_stationery    → which stationery items are offered per grade
--   veda_session_distributions.grade_id → a distribution now keys on
--                              (session_id, stationery_item_id, grade_id)
--
-- The CSV `migration/data/veda-booklisting-products-2026.csv` defines the
-- default bands (ECDE, Lower Primary, Upper Primary, JSS) and the product
-- list offered per band. We seed that catalogue for every 'schools' org.
--
-- Backward compatible: grade_id is nullable, so existing flat rows and the
-- existing mobile flow continue to work; Postgres treats NULL in a unique
-- index as distinct, so (session, item, NULL) coexists with per-grade rows.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── grades (admin-managed class bands) ───────────────────────────────────────
create table public.veda_grades (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name            text not null,
  code            text not null,
  sort_order      integer not null default 0,
  status          sku_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint veda_grades_unique unique (organization_id, code)
);
create index veda_grades_org_idx on public.veda_grades (organization_id, sort_order);

-- ── grade → stationery offering ──────────────────────────────────────────────
create table public.veda_grade_stationery (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id),
  grade_id           uuid not null references public.veda_grades(id) on delete cascade,
  stationery_item_id uuid not null references public.veda_stationery_items(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint veda_grade_stationery_unique unique (grade_id, stationery_item_id)
);
create index veda_grade_stationery_org_idx on public.veda_grade_stationery (organization_id);
create index veda_grade_stationery_grade_idx on public.veda_grade_stationery (grade_id);

-- ── distributions now carry a grade ──────────────────────────────────────────
alter table public.veda_session_distributions
  add column grade_id uuid;

alter table public.veda_session_distributions
  add constraint veda_session_distributions_grade_fkey
    foreign key (grade_id) references public.veda_grades(id) on delete set null;

alter table public.veda_session_distributions
  drop constraint veda_session_distributions_unique;

alter table public.veda_session_distributions
  add constraint veda_session_distributions_unique
    unique (session_id, stationery_item_id, grade_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed the 2026 book-listing catalogue into every 'schools' organization.
-- Levels → stations per the supplied CSV.
-- ═════════════════════════════════════════════════════════════════════════──

do $$
declare
  v_org      uuid;
  v_ecde     uuid;
  v_lower    uuid;
  v_upper    uuid;
  v_jss      uuid;
  g_ecde     uuid;
  g_lower    uuid;
  g_upper    uuid;
  g_jss      uuid;
  v_item     text;
  v_org_list uuid[];
begin
  select array_agg(o.id) into v_org_list from public.organizations o where o.kind = 'schools';

  foreach v_org in array v_org_list loop
    -- grades
    insert into public.veda_grades (organization_id, name, code, sort_order)
    values (v_org, 'ECDE (Playgroup, PP1 & PP2)', 'ECDE', 1)
    on conflict (organization_id, code) do update set name = excluded.name, sort_order = excluded.sort_order
    returning id into g_ecde;

    insert into public.veda_grades (organization_id, name, code, sort_order)
    values (v_org, 'Lower Primary (Grade 1, 2 & 3)', 'LOWER_PRIMARY', 2)
    on conflict (organization_id, code) do update set name = excluded.name, sort_order = excluded.sort_order
    returning id into g_lower;

    insert into public.veda_grades (organization_id, name, code, sort_order)
    values (v_org, 'Upper Primary (Grade 4, 5 & 6)', 'UPPER_PRIMARY', 3)
    on conflict (organization_id, code) do update set name = excluded.name, sort_order = excluded.sort_order
    returning id into g_upper;

    insert into public.veda_grades (organization_id, name, code, sort_order)
    values (v_org, 'JSS (Grade 7, 8 & 9)', 'JSS', 4)
    on conflict (organization_id, code) do update set name = excluded.name, sort_order = excluded.sort_order
    returning id into g_jss;

    -- ECDE
    foreach v_item in array array[
      'Crayons (CR 8A)', 'Jumbo Crayons', 'Crayons (CR 12A)', 'Extraa Dark Pencils',
      'Modelling Clay MC 1', 'Glue Stick (36 g)', 'Triangular Pencils', 'Spring File',
      'Erasers (ER 40)', 'Activity Books', 'Drawing Book (BCR - A4)', 'Fluorescent Pad',
      'Veda Exercise Books', 'Powder Paints', 'Permanent Marker Pens', 'Black Erasers'
    ]::text[] loop
      insert into public.veda_stationery_items (organization_id, name, code, status)
      values (v_org, v_item, replace(lower(v_item), ' ', '-'), 'active')
      on conflict (organization_id, code) do nothing
      returning id into v_ecde;
      if v_ecde is null then
        select id into v_ecde from public.veda_stationery_items
         where organization_id = v_org and code = replace(lower(v_item), ' ', '-');
      end if;
      insert into public.veda_grade_stationery (organization_id, grade_id, stationery_item_id)
      values (v_org, g_ecde, v_ecde)
      on conflict (grade_id, stationery_item_id) do nothing;
    end loop;

    -- Lower Primary
    foreach v_item in array array[
      'Crayons (CR 12A)', 'Watercolours (WCT 01)', 'Modelling Clay MC 1', 'Ruler',
      'OP Pencils (2800)', 'Clear Glue (GS 10)', 'Erasers (ER 40)', 'Spring File',
      'Glue Stick (36 g)', 'Scissors - SC5/5A', 'OP Pens', 'Permanent Marker Pens',
      'Powder Paints', 'Black Erasers', 'Veda Exercise Books'
    ]::text[] loop
      insert into public.veda_stationery_items (organization_id, name, code, status)
      values (v_org, v_item, replace(lower(v_item), ' ', '-'), 'active')
      on conflict (organization_id, code) do nothing
      returning id into v_lower;
      if v_lower is null then
        select id into v_lower from public.veda_stationery_items
         where organization_id = v_org and code = replace(lower(v_item), ' ', '-');
      end if;
      insert into public.veda_grade_stationery (organization_id, grade_id, stationery_item_id)
      values (v_org, g_lower, v_lower)
      on conflict (grade_id, stationery_item_id) do nothing;
    end loop;

    -- Upper Primary
    foreach v_item in array array[
      'OP Pencils (2800)', 'Mathematical Set - Mat 1', 'Colour Pencils - Full',
      'Watercolours (WCT 01)', 'Modelling Clay MC 1', 'Ruler', 'Erasers (ER 40)',
      'Clear Glue (GS 10)', 'Glue Stick (36 g)', 'OP Pens', 'Scissors - SC5/5A',
      'Marker Pens', 'Veda Exercise Books'
    ]::text[] loop
      insert into public.veda_stationery_items (organization_id, name, code, status)
      values (v_org, v_item, replace(lower(v_item), ' ', '-'), 'active')
      on conflict (organization_id, code) do nothing
      returning id into v_upper;
      if v_upper is null then
        select id into v_upper from public.veda_stationery_items
         where organization_id = v_org and code = replace(lower(v_item), ' ', '-');
      end if;
      insert into public.veda_grade_stationery (organization_id, grade_id, stationery_item_id)
      values (v_org, g_upper, v_upper)
      on conflict (grade_id, stationery_item_id) do nothing;
    end loop;

    -- JSS
    foreach v_item in array array[
      'OP Pencils (2800)', 'Mathematical Set - Mat 5', 'Colour Pencils - Full',
      'Watercolours (WCT 02)', 'Modelling Clay MC 1', 'Ruler', 'Erasers (ER 40)',
      'Clear Glue (GS 10)', 'Glue Stick (36 g)', 'OP Pens', 'Scissors - SC5/5A',
      'Marker Pens', 'Scientific Calculator - SX 82 MS', 'Black Erasers',
      'Veda Exercise Books', 'Graph Books'
    ]::text[] loop
      insert into public.veda_stationery_items (organization_id, name, code, status)
      values (v_org, v_item, replace(lower(v_item), ' ', '-'), 'active')
      on conflict (organization_id, code) do nothing
      returning id into v_jss;
      if v_jss is null then
        select id into v_jss from public.veda_stationery_items
         where organization_id = v_org and code = replace(lower(v_item), ' ', '-');
      end if;
      insert into public.veda_grade_stationery (organization_id, grade_id, stationery_item_id)
      values (v_org, g_jss, v_jss)
      on conflict (grade_id, stationery_item_id) do nothing;
    end loop;
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC layer (rewrites to support the grade dimension)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── veda_record_distribution: per-grade upsert ───────────────────────────────
create or replace function public.veda_record_distribution(
  p_session_id         uuid,
  p_stationery_item_id uuid,
  p_quantity           integer,
  p_client_request_id  uuid,
  p_grade_id           uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  s   record;
  itm record;
  grd record;
  prior jsonb;
  did uuid;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_record_distribution', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select vs.* into s from public.veda_sessions vs
   where vs.id = p_session_id and vs.brand_ambassador_id = p.id
     and vs.organization_id = p.organization_id;
  if not found then raise exception 'Visit not found'; end if;
  if s.status <> 'open' then raise exception 'Visit is not open for recording'; end if;

  select it.* into itm from public.veda_stationery_items it
   where it.id = p_stationery_item_id and it.organization_id = p.organization_id
     and it.status = 'active';
  if not found then raise exception 'Stationery item not found or not active'; end if;

  if p_grade_id is not null then
    select g.* into grd from public.veda_grades g
     where g.id = p_grade_id and g.organization_id = p.organization_id
       and g.status = 'active';
    if grd.id is null then raise exception 'Grade not found or not active'; end if;
  end if;

  if p_quantity < 1 or p_quantity > 100000 then
    raise exception 'Quantity must be between 1 and 100000';
  end if;

  insert into public.veda_session_distributions
    (organization_id, session_id, stationery_item_id, grade_id, quantity, client_request_id)
  values
    (p.organization_id, p_session_id, p_stationery_item_id, p_grade_id, p_quantity, p_client_request_id)
  on conflict (session_id, stationery_item_id, grade_id)
    do update set quantity = excluded.quantity, client_request_id = excluded.client_request_id
  returning id into did;

  perform public.write_audit('veda_session.distribution', 'veda_session_distributions', did,
    jsonb_build_object('session_id', p_session_id, 'stationery_item_id', p_stationery_item_id,
                       'grade_id', p_grade_id, 'quantity', p_quantity));

  prior := jsonb_build_object('status','ok','operation','veda_record_distribution',
    'distribution_id', did);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── veda_remove_distribution: remove a (item, grade) line ────────────────────
create or replace function public.veda_remove_distribution(
  p_session_id         uuid,
  p_stationery_item_id uuid,
  p_client_request_id  uuid,
  p_grade_id           uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  s   record;
  prior jsonb;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'veda_remove_distribution', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select vs.* into s from public.veda_sessions vs
   where vs.id = p_session_id and vs.brand_ambassador_id = p.id
     and vs.organization_id = p.organization_id;
  if not found then raise exception 'Visit not found'; end if;
  if s.status <> 'open' then raise exception 'Visit is not open for editing'; end if;

  delete from public.veda_session_distributions
   where session_id = p_session_id and stationery_item_id = p_stationery_item_id
     and grade_id is not distinct from p_grade_id;

  perform public.write_audit('veda_session.distribution_removed', 'veda_session_distributions', p_session_id,
    jsonb_build_object('stationery_item_id', p_stationery_item_id, 'grade_id', p_grade_id));

  prior := jsonb_build_object('status','ok','operation','veda_remove_distribution');
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── veda_today: include grades (with offerings) and grade on distributions ───
create or replace function public.veda_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p            public.profiles;
  nairobi_d    date;
  dow          int;
  a            record;
  s            public.veda_sessions%rowtype;
  dists        jsonb;
  item_rows    jsonb;
  grade_rows   jsonb;
  result       jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  nairobi_d := (now() at time zone 'Africa/Nairobi')::date;
  dow       := extract(dow from nairobi_d)::int;

  -- Every assignment is its own row; veda_today mirrors ba_today's shape so
  -- both the mobile and web BA dashboards can iterate `assignments`.
  item_rows := '[]'::jsonb;
  grade_rows := '[]'::jsonb;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', it.id, 'name', it.name, 'code', it.code)
           order by it.name), '[]'::jsonb)
    into item_rows
  from public.veda_stationery_items it
  where it.organization_id = p.organization_id
    and it.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'name', g.name, 'code', g.code, 'sort_order', g.sort_order)
           order by g.sort_order), '[]'::jsonb)
    into grade_rows
  from public.veda_grades g
  where g.organization_id = p.organization_id
    and g.status = 'active';

  result := jsonb_build_object(
    'attendance_date', nairobi_d,
    'stationery_items', item_rows,
    'grades', grade_rows,
    'assignments', '[]'::jsonb
  );

  for a in
    select va.*, sch.name as school_name, sch.region as school_region,
           sch.latitude as school_latitude, sch.longitude as school_longitude,
           sch.geofence_radius_metres
    from public.veda_assignments va
    join public.veda_schools sch on sch.id = va.school_id
    where va.brand_ambassador_id = p.id
      and va.organization_id = p.organization_id
      and va.status = 'active'
      and va.start_date <= nairobi_d
      and (va.end_date is null or va.end_date >= nairobi_d)
    order by va.start_date desc, va.created_at desc
  loop
    s := null;
    dists := '[]'::jsonb;

    select * into s from public.veda_sessions
    where brand_ambassador_id = p.id
      and school_id = a.school_id
      and session_date = nairobi_d
      and status <> 'cancelled'
    order by created_at desc limit 1;

    if s.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'stationery_item_id', d.stationery_item_id,
               'item_name', it.name, 'item_code', it.code, 'quantity', d.quantity,
               'grade_id', d.grade_id, 'grade_name', g.name)
               order by g.sort_order nulls last, it.name), '[]'::jsonb)
        into dists
      from public.veda_session_distributions d
      join public.veda_stationery_items it on it.id = d.stationery_item_id
      left join public.veda_grades g on g.id = d.grade_id
      where d.session_id = s.id;
    end if;

    result := jsonb_set(result, '{assignments}',
      coalesce(result->'assignments', '[]'::jsonb)
        || jsonb_build_object(
            'assignment', jsonb_build_object(
              'id', a.id, 'school_id', a.school_id, 'school_name', a.school_name,
              'school_region', a.school_region, 'school_latitude', a.school_latitude,
              'school_longitude', a.school_longitude, 'geofence_radius_metres', a.geofence_radius_metres),
            'weekly_off_day', a.weekly_off_day,
            'is_weekly_off_today', (a.weekly_off_day is not null and a.weekly_off_day = dow),
            'session', case when s.id is null then null else to_jsonb(s) - 'client_request_id' end,
            'distributions', dists,
            'learner_count', s.learner_count,
            'session_status', s.status
          ));
  end loop;

  return result;
end;
$$;

-- ── admin: upsert a grade (with optional product offerings) ──────────────────
create or replace function public.veda_admin_upsert_grade(
  p_name           text,
  p_code           text,
  p_sort_order     integer default 0,
  p_status         sku_status default 'active',
  p_grade_id       uuid default null,
  p_stationery_ids uuid[] default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  v_org uuid;
  v_id  uuid;
  gid   uuid;
  oid   uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role not in ('super_admin','organization_admin') or actor.account_status <> 'approved' then
    raise exception 'Not permitted';
  end if;
  v_org := actor.organization_id;

  if trim(p_name) is null or length(trim(p_name)) < 2 then
    raise exception 'Grade name is required';
  end if;
  if trim(p_code) is null or length(trim(p_code)) < 1 then
    raise exception 'Grade code is required';
  end if;

  if actor.role = 'super_admin' then
    -- super admins may target a specific grade id; otherwise default to own org
    if p_grade_id is not null then
      select organization_id into v_org from public.veda_grades where id = p_grade_id and status <> 'inactive';
      if v_org is null then raise exception 'Grade not found'; end if;
    end if;
  end if;

  if p_grade_id is null then
    insert into public.veda_grades (organization_id, name, code, sort_order, status)
    values (v_org, trim(p_name), trim(p_code), coalesce(p_sort_order, 0), p_status)
    on conflict (organization_id, code) do update set
      name = excluded.name, sort_order = excluded.sort_order, status = excluded.status
    returning id into v_id;
    perform public.write_audit('veda_grade.create', 'veda_grades', v_id,
      jsonb_build_object('name', p_name, 'code', p_code));
  else
    update public.veda_grades set
      name = trim(p_name), code = trim(p_code),
      sort_order = coalesce(p_sort_order, sort_order), status = p_status
     where id = p_grade_id and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is null then raise exception 'Grade not found or not in your organization'; end if;
    perform public.write_audit('veda_grade.update', 'veda_grades', v_id, null);
  end if;

  -- refresh offerings, if supplied
  if p_stationery_ids is not null then
    delete from public.veda_grade_stationery where grade_id = v_id;
    foreach gid in array p_stationery_ids loop
      select id into oid from public.veda_stationery_items
       where id = gid and organization_id = v_org and status = 'active';
      if oid is not null then
        insert into public.veda_grade_stationery (organization_id, grade_id, stationery_item_id)
        values (v_org, v_id, oid)
        on conflict (grade_id, stationery_item_id) do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.veda_record_distribution(uuid, uuid, integer, uuid, uuid),
  public.veda_remove_distribution(uuid, uuid, uuid, uuid),
  public.veda_today(),
  public.veda_admin_upsert_grade(text, text, integer, sku_status, uuid, uuid[])
to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.veda_grades            enable row level security;
alter table public.veda_grade_stationery  enable row level security;

create policy veda_grades_select_org on public.veda_grades
  for select using (public.can_read_org(organization_id));
create policy veda_grade_stationery_select_org on public.veda_grade_stationery
  for select using (public.can_read_org(organization_id));

create policy veda_grades_org_admin_all on public.veda_grades
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy veda_grade_stationery_org_admin_all on public.veda_grade_stationery
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

grant select on public.veda_grades           to authenticated;
grant select on public.veda_grade_stationery to authenticated;

-- ── triggers ─────────────────────────────────────────────────────────────────
create trigger audit_veda_grades after insert or update or delete on public.veda_grades
  for each row execute function public.audit_row_change();
create trigger audit_veda_grade_stationery after insert or update or delete on public.veda_grade_stationery
  for each row execute function public.audit_row_change();

create trigger set_updated_at_veda_grades before update on public.veda_grades
  for each row execute function public.set_updated_at();
create trigger set_updated_at_veda_grade_stationery before update on public.veda_grade_stationery
  for each row execute function public.set_updated_at();

commit;
