create index booklist_grade_requests_org_idx
  on public.booklist_grade_requests (organization_id);
create index booklist_grade_requests_visit_idx
  on public.booklist_grade_requests (visit_id)
  where visit_id is not null;
create index booklist_grade_requests_created_by_idx
  on public.booklist_grade_requests (created_by)
  where created_by is not null;

drop policy if exists booklist_grade_requests_select on public.booklist_grade_requests;
create policy booklist_grade_requests_select
  on public.booklist_grade_requests
  for select
  to authenticated
  using (
    public.can_read_org(organization_id)
    or exists (
      select 1
      from public.booklist_jobs j
      where j.id = booklist_grade_requests.job_id
        and (
          j.owner_ba_id = (select auth.uid())
          or exists (
            select 1
            from public.school_visits v
            where v.id = j.latest_visit_id
              and v.brand_ambassador_id = (select auth.uid())
          )
        )
    )
  );
