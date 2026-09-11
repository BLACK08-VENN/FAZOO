-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — School booklist spreadsheet: due date + board columns.
--
-- The admin spreadsheet needs a per-school target date for when the copies
-- must be dispatched by. Adds `due_date` to `booklist_jobs` and re-creates
-- `admin_pipeline_board()` so it also returns `due_date`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.booklist_jobs
  add column if not exists due_date date;

comment on column public.booklist_jobs.due_date is
  'Target date by which the printed copies must be dispatched to the school.';

create or replace function public.admin_pipeline_board(
  p_query      text default null,
  p_stage      public.booklist_stage default null,
  p_region     text default null,
  p_ba_id      uuid default null,
  p_agency     public.ba_agency default null,
  p_from       date default null,
  p_to         date default null,
  p_limit      integer default 100,
  p_offset     integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  q       text := nullif(btrim(coalesce(p_query, '')), '');
  r       text := nullif(btrim(coalesce(p_region, '')), '');
  v_total integer;
begin
  p := public.assert_org_staff();

  select count(*) into v_total
    from public.booklist_jobs bj
    join public.veda_schools s on s.id = bj.school_id
    left join public.profiles ba on ba.id = bj.owner_ba_id
   where bj.organization_id = p.organization_id
     and (p_stage  is null or bj.stage = p_stage)
     and (p_ba_id  is null or bj.owner_ba_id = p_ba_id)
     and (p_agency is null or ba.agency = p_agency)
     and (r is null or upper(s.region) = upper(r))
     and (p_from is null or bj.created_at::date >= p_from)
     and (p_to   is null or bj.created_at::date <= p_to)
     and (q is null or s.name ilike '%' || q || '%'
                     or coalesce(s.region, '') ilike '%' || q || '%'
                     or coalesce(s.address, '') ilike '%' || q || '%');

  return jsonb_build_object(
    'status', 'ok',
    'total', v_total,
    'limit', v_limit,
    'offset', v_off,
    'stage_counts', (
      select coalesce(jsonb_object_agg(z.stage, z.n), '{}'::jsonb)
      from (
        select bj.stage, count(*) as n
          from public.booklist_jobs bj
         where bj.organization_id = p.organization_id
         group by bj.stage
      ) z
    ),
    'jobs', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.stage_updated_at desc), '[]'::jsonb)
      from (
        select bj.id                    as job_id,
               bj.stage,
               bj.school_id,
               s.name                   as school_name,
               s.region                 as school_region,
               s.address                as school_address,
               bj.owner_ba_id,
               ba.full_name             as owner_ba_name,
               ba.agency                as owner_ba_agency,
               bj.copies_requested,
               bj.copies_to_print,
               bj.due_date,
               bj.is_per_grade,
               bj.ocr_status,
               bj.document_received_at,
               bj.formatted_at,
               bj.approved_by_school_at,
               bj.dispatched_at,
               bj.received_at,
               bj.completed_at,
               bj.stage_updated_at,
               bj.created_at,
               (bj.raw_document_id is not null)       as has_raw_document,
               (bj.formatted_document_id is not null) as has_formatted_document,
               (bj.stamped_document_id is not null)   as has_stamped_copy,
               bj.raw_document_id,
               bj.formatted_document_id,
               bj.stamped_document_id,
               (select po.status || ' · ' || coalesce(po.dispatch_means::text, 'not dispatched')
                  from public.print_orders po
                 where po.job_id = bj.id
                 order by po.created_at desc limit 1)  as latest_print_order,
               (select po.dispatch_means
                  from public.print_orders po
                 where po.job_id = bj.id and po.dispatch_means is not null
                 order by po.created_at desc limit 1)  as print_order_dispatch_means,
               (select count(*) from public.school_visits v
                 where v.school_id = bj.school_id)      as visit_count,
               (select max(v.visit_date) from public.school_visits v
                 where v.school_id = bj.school_id)      as last_visit_date
          from public.booklist_jobs bj
          join public.veda_schools s on s.id = bj.school_id
          left join public.profiles ba on ba.id = bj.owner_ba_id
         where bj.organization_id = p.organization_id
           and (p_stage  is null or bj.stage = p_stage)
           and (p_ba_id  is null or bj.owner_ba_id = p_ba_id)
           and (p_agency is null or ba.agency = p_agency)
           and (r is null or upper(s.region) = upper(r))
           and (p_from is null or bj.created_at::date >= p_from)
           and (p_to   is null or bj.created_at::date <= p_to)
           and (q is null or s.name ilike '%' || q || '%'
                           or coalesce(s.region, '') ilike '%' || q || '%'
                           or coalesce(s.address, '') ilike '%' || q || '%')
         order by bj.stage_updated_at desc
         limit v_limit offset v_off
      ) x
    )
  );
end;
$$;

grant execute on function public.admin_pipeline_board(text, public.booklist_stage, text, uuid, public.ba_agency, date, date, integer, integer) to authenticated;

commit;