-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Dismantle the superseded Veda activation machinery.
--
-- The school programme is now the booklist pipeline (school_visits +
-- booklist_jobs + booklist_documents + print_orders). The old activation model
-- recorded a "session" per visit and hung stationery distributions off it; that
-- is fully replaced, and none of it ever accumulated data:
--
--   veda_sessions               0 rows  → school_visits
--   veda_session_photos         0 rows  → school_visits.selfie_photo_path
--                                         + booklist_documents (stamped_copy)
--   veda_session_distributions  0 rows  → removed
--   veda_activities             0 rows  → removed (legacy craft model)
--   veda_grade_stationery       0 rows  → removed
--   veda_stationery_items      29 rows  → removed (product decision)
--
-- Deliberately KEPT
--   veda_schools      4,782 rows — the imported master list the BA picks from.
--   veda_grades            4 rows — booklists may be issued per grade.
--   veda_assignments   BA → region territory, still used for assignment.
--   ba_list_veda_schools / veda_admin_upsert_school — still useful.
--
-- Functions are dropped by name via pg_proc so signature drift across the
-- migration history cannot leave an orphan overload behind.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Drop the RPCs that depend on the tables below ───────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'veda_today',
         'veda_checkin',
         'veda_checkout',
         'veda_record_distribution',
         'veda_remove_distribution',
         'veda_admin_upsert_stationery',
         'veda_admin_upsert_stationery_item',
         'veda_admin_delete_stationery_item',
         'veda_admin_upsert_grade'
       )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

-- ── Drop the superseded tables ──────────────────────────────────────────────
drop table if exists public.veda_session_distributions cascade;
drop table if exists public.veda_activities            cascade;
drop table if exists public.veda_grade_stationery      cascade;
drop table if exists public.veda_stationery_items      cascade;
drop table if exists public.veda_session_photos        cascade;
drop table if exists public.veda_sessions              cascade;

-- ── Drop the now-unused enums ───────────────────────────────────────────────
drop type if exists public.veda_activity_type;
drop type if exists public.veda_photo_type;

-- ── Recreate the grade RPC without the stationery coupling ──────────────────
-- Grades stay because a school booklist may be issued per grade.
create or replace function public.veda_admin_upsert_grade(
  p_name       text,
  p_code       text,
  p_sort_order integer default 0,
  p_status     public.sku_status default 'active',
  p_grade_id   uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles;
  v_org uuid;
  v_id  uuid;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.account_status <> 'approved'
     or actor.role not in ('super_admin','organization_admin') then
    raise exception 'Not permitted';
  end if;
  v_org := actor.organization_id;

  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) < 2 then
    raise exception 'Grade name is required';
  end if;
  if btrim(coalesce(p_code, '')) = '' then
    raise exception 'Grade code is required';
  end if;

  if actor.role = 'super_admin' and p_grade_id is not null then
    select organization_id into v_org
      from public.veda_grades where id = p_grade_id and status <> 'inactive';
    if v_org is null then raise exception 'Grade not found'; end if;
  end if;

  if p_grade_id is null then
    insert into public.veda_grades (organization_id, name, code, sort_order, status)
    values (v_org, btrim(p_name), btrim(p_code), coalesce(p_sort_order, 0), coalesce(p_status, 'active'))
    on conflict (organization_id, code) do update set
      name = excluded.name, sort_order = excluded.sort_order, status = excluded.status
    returning id into v_id;
    perform public.write_audit('veda_grade.create', 'veda_grades', v_id,
      jsonb_build_object('name', p_name, 'code', p_code));
  else
    update public.veda_grades
       set name       = btrim(p_name),
           code       = btrim(p_code),
           sort_order = coalesce(p_sort_order, sort_order),
           status     = coalesce(p_status, status)
     where id = p_grade_id
       and (actor.role = 'super_admin' or organization_id = actor.organization_id)
    returning id into v_id;
    if v_id is null then raise exception 'Grade not found or not in your organization'; end if;
    perform public.write_audit('veda_grade.update', 'veda_grades', v_id, null);
  end if;

  return v_id;
end;
$$;

grant execute on function
  public.veda_admin_upsert_grade(text, text, integer, public.sku_status, uuid)
  to authenticated;

-- ── Per-agency rules for the Veda tenant ────────────────────────────────────
-- AEL BAs must capture a gate selfie; Veda BAs are not held to it. The geofence
-- stays advisory for both until the school list carries coordinates.
update public.organizations
   set settings = settings || jsonb_build_object(
         'default_agency', 'veda',
         'agency_rules', jsonb_build_object(
           'ael', jsonb_build_object(
             'selfie_required', true,
             'geofence_enforced', false,
             'target_schools_per_month', 20
           ),
           'veda', jsonb_build_object(
             'selfie_required', false,
             'geofence_enforced', false,
             'target_schools_per_month', null
           )
         )
       ),
       updated_at = now()
 where kind = 'schools'
   and settings -> 'agency_rules' is null;

commit;
