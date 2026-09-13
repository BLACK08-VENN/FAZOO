create table public.booklist_grade_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.booklist_jobs(id) on delete cascade,
  visit_id uuid references public.school_visits(id) on delete set null,
  grade_label text not null,
  copies_requested integer not null check (copies_requested between 1 and 100000),
  copies_to_print integer not null check (copies_to_print = copies_requested + 1),
  due_date date not null,
  source_format text not null,
  storage_bucket text not null default 'booklist-documents',
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booklist_grade_requests_grade_label_check
    check (char_length(btrim(grade_label)) between 1 and 100)
);

create unique index booklist_grade_requests_job_grade_uidx
  on public.booklist_grade_requests (job_id, lower(btrim(grade_label)));
create unique index booklist_grade_requests_client_request_uidx
  on public.booklist_grade_requests (client_request_id)
  where client_request_id is not null;
create index booklist_grade_requests_job_sort_idx
  on public.booklist_grade_requests (job_id, sort_order, created_at);

create trigger set_updated_at_booklist_grade_requests
  before update on public.booklist_grade_requests
  for each row execute function public.set_updated_at();

alter table public.booklist_grade_requests enable row level security;

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
          j.owner_ba_id = auth.uid()
          or exists (
            select 1 from public.school_visits v
            where v.id = j.latest_visit_id
              and v.brand_ambassador_id = auth.uid()
          )
        )
    )
  );

revoke all on table public.booklist_grade_requests from anon, authenticated;
grant select on table public.booklist_grade_requests to authenticated;
grant all on table public.booklist_grade_requests to service_role;
