create or replace function public.ba_school_pipeline_v2(
  p_query text default null,
  p_stage public.booklist_stage default null,
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles;
  base jsonb;
  jobs jsonb;
begin
  p := public.assert_school_ba();
  base := public.ba_school_pipeline(p_query, p_stage, p_limit);

  select coalesce(
    jsonb_agg(
      x.item || jsonb_build_object(
        'due_date', bj.due_date,
        'follow_up_date', bj.follow_up_date,
        'follow_up_notes', bj.follow_up_notes,
        'formatted_document_id', bj.formatted_document_id
      ) order by x.ord
    ),
    '[]'::jsonb
  ) into jobs
  from jsonb_array_elements(coalesce(base->'jobs', '[]'::jsonb))
       with ordinality as x(item, ord)
  left join public.booklist_jobs bj
    on bj.id = (x.item->>'job_id')::uuid
   and bj.organization_id = p.organization_id;

  return jsonb_set(base, '{jobs}', jobs, true);
end;
$$;
