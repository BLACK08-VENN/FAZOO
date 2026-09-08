-- An earlier migration replaced veda_checkin using Africa/Nairobi. Fazoo's
-- attendance dates are defined in Africa/Lagos, so update the deployed
-- function without duplicating its full implementation a second time.

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.veda_checkin(double precision,double precision,text,text,uuid,uuid,uuid,double precision,integer,text)'::regprocedure
  ) into function_sql;

  if position('Africa/Nairobi' in function_sql) > 0 then
    execute replace(function_sql, 'Africa/Nairobi', 'Africa/Lagos');
  elsif position('Africa/Lagos' in function_sql) = 0 then
    raise exception 'veda_checkin contains no recognized attendance timezone';
  end if;
end;
$$;
