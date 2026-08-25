-- Run after `supabase db reset` with:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_rpc.sql
begin;

insert into public.daily_logs
  (id, organization_id, campaign_id, brand_ambassador_id, store_id, attendance_date, attendance_status, status)
values
  ('66666666-6666-4666-8666-666666666610', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-000000000010', '44444444-4444-4444-8444-444444444401', '2000-01-01', 'present', 'open'),
  ('66666666-6666-4666-8666-666666666611', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-000000000011', '44444444-4444-4444-8444-444444444402', '2000-01-01', 'present', 'open');
insert into public.sales_entries
  (id, organization_id, daily_log_id, sku_id, quantity)
values
  ('77777777-7777-4777-8777-777777777710', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666610', '55555555-5555-4555-8555-555555555501', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000010', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000010","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from public.daily_logs where attendance_date = '2000-01-01') <> 1 then
    raise exception 'RLS failure: BA can read another BA daily log';
  end if;
end $$;

select public.ba_update_sale(
  '77777777-7777-4777-8777-777777777710', 3,
  '88888888-8888-4888-8888-888888888810'
);
select public.ba_update_sale(
  '77777777-7777-4777-8777-777777777710', 3,
  '88888888-8888-4888-8888-888888888810'
);

reset role;
do $$ begin
  if (select quantity from public.sales_entries where id = '77777777-7777-4777-8777-777777777710') <> 3 then
    raise exception 'RPC failure: sale quantity was not updated';
  end if;
  if (select count(*) from public.operation_receipts where client_request_id = '88888888-8888-4888-8888-888888888810') <> 1 then
    raise exception 'Idempotency failure: expected one operation receipt';
  end if;
end $$;

rollback;
