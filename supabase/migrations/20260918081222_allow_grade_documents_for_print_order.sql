-- A corrected file can be published either on the parent job (single-list
-- workflow) or on every grade request (per-grade workflow). The legacy print
-- guard only checked for a parent DOCX, so valid grade and PDF workflows could
-- reach school approval but could never create their print order.
create or replace function public.validate_booklist_print_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.booklist_jobs;
  v_required_quantity integer;
begin
  if new.status = 'cancelled' then return new; end if;

  select * into j
    from public.booklist_jobs
   where id = new.job_id
     and organization_id = new.organization_id;

  if j.id is null or j.copies_requested is null or j.due_date is null then
    raise exception 'The school copy request and due date must be recorded before printing';
  end if;

  if j.formatted_document_id is null
     and not (
       exists (
         select 1
           from public.booklist_grade_requests gr
          where gr.job_id = new.job_id
       )
       and not exists (
         select 1
           from public.booklist_grade_requests gr
          where gr.job_id = new.job_id
            and gr.word_storage_path is null
       )
     ) then
    raise exception 'Publish every corrected Word or PDF document before printing';
  end if;

  select coalesce(sum(gr.copies_to_print), j.copies_to_print)
    into v_required_quantity
    from public.booklist_grade_requests gr
   where gr.job_id = new.job_id;

  if new.quantity < v_required_quantity or not new.includes_stamped_copy then
    raise exception 'Print at least % copies, including the extra stamped copy', v_required_quantity;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_booklist_print_order() from public, anon, authenticated;
