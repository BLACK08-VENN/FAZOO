-- Campaign planning details from Veda's school book-list register. The source
-- CSV remains outside version control because it contains personal data.
alter table public.veda_schools
  add column if not exists school_type text,
  add column if not exists assigned_ba_name text,
  add column if not exists source_code text,
  add column if not exists contact_person_name text,
  add column if not exists contact_person_designation text,
  add column if not exists contact_person_phone text,
  add column if not exists booklist_print_response text,
  add column if not exists booklist_collection_visit text,
  add column if not exists max_total_population integer
    check (max_total_population is null or max_total_population >= 0);

create unique index if not exists veda_schools_org_source_code_unique
  on public.veda_schools (organization_id, source_code)
  where source_code is not null;

-- A table-wide SELECT grant would expose the three personal-data columns via
-- PostgREST to every approved organization member. Keep normal school/campaign
-- fields available to authenticated clients; personal details remain available
-- only to privileged server-side/service-role code.
revoke select on table public.veda_schools from authenticated;
grant select (
  id,
  organization_id,
  legacy_id,
  name,
  address,
  region,
  latitude,
  longitude,
  geofence_radius_metres,
  status,
  created_at,
  updated_at,
  school_type,
  source_code,
  booklist_print_response,
  booklist_collection_visit,
  max_total_population
) on public.veda_schools to authenticated;
