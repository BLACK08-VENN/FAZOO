-- Fix admin_ba_performance: using `->` on a JSONB key whose value is null
-- (the org has no target_schools_per_month agency rule) returns JSONB null,
-- and casting jsonb null to integer raises 22023 "cannot cast jsonb null to
-- type integer", crashing the BA performance board for every admin.
--
-- Switch to `->>` which returns a proper SQL NULL for a missing rule, so the
-- coalesce falls back cleanly. Mirrors the already-correct ->> usage for
-- selfie_required on the line above.
create or replace function public.admin_ba_performance(
  p_agency       public.ba_agency default null,
  p_period_start date default null,
  p_period_end   date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p       public.profiles;
  org     public.organizations;
  v_start date;
  v_end   date;
begin
  p := public.assert_org_staff();
  select * into org from public.organizations where id = p.organization_id;

  v_end   := coalesce(p_period_end, (now() at time zone coalesce(org.timezone, 'UTC'))::date);
  v_start := coalesce(p_period_start, date_trunc('month', v_end)::date);

  return jsonb_build_object(
    'status', 'ok',
    'period_start', v_start,
    'period_end', v_end,
    'brand_ambassadors', (
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.agency nulls last, x.full_name), '[]'::jsonb)
      from (
        select pr.id                        as ba_id,
               pr.full_name,
               pr.phone,
               pr.agency,
               pr.account_status,
               (public.ba_visit_rules(pr.organization_id, pr.agency)->>'selfie_required')::boolean
                                            as selfie_required,
               coalesce(t.target_schools,
                 (public.ba_visit_rules(pr.organization_id, pr.agency)->>'target_schools_per_month')::integer)
                                            as target_schools,
               t.period_start               as target_period_start,
               t.period_end                 as target_period_end,
               (select count(distinct v.school_id) from public.school_visits v
                 where v.brand_ambassador_id = pr.id
                   and v.visit_date between v_start and v_end)
                                            as schools_visited,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id
                   and v.visit_date between v_start and v_end)
                                            as visits,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.outcome = 'booklist_offered'
                   and v.visit_date between v_start and v_end)
                                            as booklists_collected,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.outcome = 'declined'
                   and v.visit_date between v_start and v_end)
                                            as declines,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.selfie_required
                   and v.visit_date between v_start and v_end)
                                            as selfies_required,
               (select count(*) from public.school_visits v
                 where v.brand_ambassador_id = pr.id and v.selfie_required
                   and v.selfie_photo_path is not null
                   and v.visit_date between v_start and v_end)
                                            as selfies_captured,
               (select count(distinct v.school_id) from public.school_visits v
                 where v.brand_ambassador_id = pr.id)
                                            as schools_visited_all_time
          from public.profiles pr
          left join lateral (
                select bt.target_schools, bt.period_start, bt.period_end
                  from public.ba_school_targets bt
                 where bt.brand_ambassador_id = pr.id
                   and bt.period_start <= v_end and bt.period_end >= v_start
                 order by bt.period_start desc limit 1
               ) t on true
         where pr.organization_id = p.organization_id
           and pr.role = 'brand_ambassador'
           and pr.account_status = 'approved'
           and (p_agency is null or pr.agency = p_agency)
      ) x
    )
  );
end;
$$;

grant execute on function public.admin_ba_performance(public.ba_agency, date, date) to authenticated;