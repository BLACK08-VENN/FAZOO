-- Restrict the new BA booklist workflow RPCs to signed-in users.
-- The functions also assert the BA role internally, but explicit grants avoid
-- exposing SECURITY DEFINER entry points to the anonymous API role.

revoke all on function public.ba_capture_booklist_request(uuid, integer, date, uuid, text) from public;
revoke all on function public.ba_capture_booklist_request(uuid, integer, date, uuid, text) from anon;
grant execute on function public.ba_capture_booklist_request(uuid, integer, date, uuid, text) to authenticated;

revoke all on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) from public;
revoke all on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) from anon;
grant execute on function public.ba_school_pipeline_v2(text, public.booklist_stage, integer) to authenticated;
