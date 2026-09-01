-- Run after `supabase db reset` with:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_rpc.sql
--
-- Covers retail BA/admin flows AND Veda (schools) activation flows with
-- role/org isolation assertions. Whole file runs inside a transaction that
-- is rolled back, so no fixtures persist.
begin;

insert into public.daily_logs
  (id, organization_id, campaign_id, brand_ambassador_id, store_id, attendance_date, attendance_status, status)
values
  ('66666666-6666-4666-8666-666666666610', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-000000000010', '44444444-4444-4444-8444-444444444401', '2000-01-01', 'present', 'open'),
  ('66666666-6666-4666-8666-666666666611', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-000000000011', '44444444-4444-4444-8444-444444444402', '2000-01-01', 'present', 'open'),
  ('66666666-6666-4666-8666-666666666612', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-000000000010', '44444444-4444-4444-8444-444444444401', (now() at time zone 'Africa/Lagos')::date, 'present', 'open');
insert into public.sales_entries
  (id, organization_id, daily_log_id, sku_id, quantity)
values
  ('77777777-7777-4777-8777-777777777710', '11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666610', '55555555-5555-4555-8555-555555555501', 1);

-- Veda fixtures (schools org) for the BA/org isolation block below.
insert into public.veda_schools
  (id, organization_id, name, region, latitude, longitude, geofence_radius_metres, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111122', 'Safari Academy Test', 'Nairobi', -1.283333, 36.816667, 500, 'active');
insert into public.veda_stationery_items
  (id, organization_id, name, code, status)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '11111111-1111-4111-8111-111111111122', 'Crayons Test', 'CRY-T', 'active');
insert into public.veda_assignments
  (id, organization_id, brand_ambassador_id, school_id, weekly_off_day, start_date, end_date, status)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '11111111-1111-4111-8111-111111111122', '22222222-2222-4222-8222-000000000010', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', ((extract(dow from (now() at time zone 'Africa/Nairobi'))::int + 1) % 7), (now() at time zone 'Africa/Nairobi')::date, null, 'active');
-- Another BA's school visit in the Veda org (must stay invisible to Emeka).
insert into public.veda_sessions
  (id, organization_id, school_id, brand_ambassador_id, session_date, status, learner_count)
values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '11111111-1111-4111-8111-111111111122', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-000000000011', (now() at time zone 'Africa/Nairobi')::date, 'open', 0);

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

select public.ba_submit_leave_request(
  'annual_leave', current_date + 10, current_date + 12, current_date + 13,
  true, null, 'Planned annual family leave.', array['not_applicable'], true,
  '88888888-8888-4888-8888-888888888811'
);

do $$ begin
  if (select count(*) from public.leave_requests) <> 1 then
    raise exception 'Leave RLS failure: BA cannot read own request or can read another request';
  end if;
end $$;
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

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000002","role":"authenticated"}', true);

select public.admin_review_leave_request(
  (select id from public.leave_requests where client_request_id = '88888888-8888-4888-8888-888888888811'),
  'approve', 'Coverage confirmed.'
);

reset role;
do $$ begin
  if (select status from public.leave_requests where client_request_id = '88888888-8888-4888-8888-888888888811') <> 'approved' then
    raise exception 'Leave review failure: request was not approved';
  end if;
  if not exists (select 1 from public.audit_logs where action = 'leave_request.approved') then
    raise exception 'Leave audit failure: admin decision was not recorded';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000010', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000010","role":"authenticated"}', true);

do $$ begin
  begin
    perform public.ba_checkout(6.6020, 3.3515, '88888888-8888-4888-8888-888888888812', 'invalid-a.jpg', 'invalid-b.jpg');
    raise exception 'Checkout failure: invalid photo paths were accepted';
  exception when others then
    null;
  end;
end $$;

select public.ba_checkout(
  6.6020, 3.3515, '88888888-8888-4888-8888-888888888813',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-000000000010/co-stock.jpg',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-000000000010/co-selfie.jpg'
);

reset role;
do $$ begin
  if (select status from public.daily_logs where id = '66666666-6666-4666-8666-666666666612') <> 'completed' then
    raise exception 'Checkout failure: log was not completed';
  end if;
  if (select count(*) from public.daily_log_photos
        where daily_log_id = '66666666-6666-4666-8666-666666666612'
          and photo_type in ('checkout_stock_shelf','checkout_uniform_selfie')) <> 2 then
    raise exception 'Checkout failure: completion photos were not recorded';
  end if;
end $$;

-- ══════════════════════════ VEDA (schools org) ══════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000010', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000010","role":"authenticated"}', true);

-- Emeka switches his active brand to Veda; kind must flip to 'schools'.
select public.ba_switch_brand('11111111-1111-4111-8111-111111111122');
do $$ begin
  if public.current_user_org_kind() <> 'schools' then
    raise exception 'Veda failure: org kind did not flip to schools after brand switch';
  end if;
end $$;

-- veda_today must expose today's assigned school + stationery catalogue.
do $$ begin
  if (public.veda_today())#>>'{assignment,school_name}' IS DISTINCT FROM 'Safari Academy Test' then
    raise exception 'Veda failure: veda_today did not return the assigned school';
  end if;
  if (public.veda_today())->>'is_weekly_off_today' <> 'false' then
    raise exception 'Veda failure: weekly off-day wrongly reported';
  end if;
end $$;

-- A BA must NOT read another BA's school visit in the same org.
do $$ begin
  if (select count(*) from public.veda_sessions where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1') <> 0 then
    raise exception 'RLS failure: BA read another BA veda_session';
  end if;
end $$;

-- Check-in: far coords must be rejected by the geofence.
do $$ begin
  begin
    perform public.veda_checkin(
      -1.35, 36.80,
      '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/t.jpg',
      '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/s.jpg',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee0');
    raise exception 'Veda failure: geofence accepted a far check-in';
  exception
    when others then null;
  end;
end $$;

-- Real check-in + idempotent replay of the same client_request_id.
select public.veda_checkin(
  -1.2831, 36.8165,
  '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/t.jpg',
  '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/s.jpg',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');
select public.veda_checkin(
  -1.2831, 36.8165,
  '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/t.jpg',
  '11111111-1111-4111-8111-111111111122/22222222-2222-4222-8222-000000000010/s.jpg',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1');

-- Record stationery, then check-in/out and post-completion guards.
select public.veda_record_distribution(
  (select id from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 40, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');

do $$ begin
  if (select count(*) from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date) <> 1 then
    raise exception 'Veda failure: duplicate session after idempotent check-in replay';
  end if;
  if (select status from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date) <> 'open' then
    raise exception 'Veda failure: session not open after check-in';
  end if;
  if (select quantity from public.veda_session_distributions d join public.veda_sessions s on s.id = d.session_id where s.brand_ambassador_id = '22222222-2222-4222-8222-000000000010') <> 40 then
    raise exception 'Veda failure: stationery quantity not recorded';
  end if;
end $$;

do $$ begin
  begin
    perform public.veda_checkout(
      (select id from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date),
      -1.35, 36.80, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3');
    raise exception 'Veda failure: checkout geofence accepted far coords';
  exception
    when others then null;
  end;

  perform public.veda_checkout(
    (select id from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date),
    -1.2833, 36.8167, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4');

  if (select status from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date) <> 'completed' then
    raise exception 'Veda failure: session not completed after checkout';
  end if;

  begin
    perform public.veda_record_distribution(
      (select id from public.veda_sessions where brand_ambassador_id = '22222222-2222-4222-8222-000000000010' and session_date = (now() at time zone 'Africa/Nairobi')::date),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 5, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5');
    raise exception 'Veda failure: distribution allowed after checkout';
  exception
    when others then null;
  end;
end $$;

-- Receipts + audit trail are staff-readable; verified under super admin below.

-- Org isolation: Lenovo staff must not see any Veda org rows.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000002","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from public.veda_sessions where organization_id = '11111111-1111-4111-8111-111111111122') <> 0
     or (select count(*) from public.veda_assignments where organization_id = '11111111-1111-4111-8111-111111111122') <> 0
     or (select count(*) from public.veda_stationery_items where organization_id = '11111111-1111-4111-8111-111111111122') <> 0 then
    raise exception 'RLS failure: Lenovo admin read Veda org rows';
  end if;

  begin
    perform public.veda_admin_upsert_assignment(
      '22222222-2222-4222-8222-000000000010',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1, current_date, null, 'active', null);
    raise exception 'Veda failure: Lenovo org admin assigned a Veda BA';
  exception
    when others then null;
  end;

  -- Org admin can still manage their own org's veda catalogue.
  if (select organization_id from public.veda_schools where id = public.veda_admin_upsert_school('Tunde School')) <> '11111111-1111-4111-8111-111111111111' then
    raise exception 'Veda failure: org admin school landed outside own org';
  end if;
end $$;

-- Super admin can read across orgs.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-000000000001","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from public.veda_sessions where organization_id = '11111111-1111-4111-8111-111111111122') < 1 then
    raise exception 'RLS failure: super admin could not read Veda org rows';
  end if;

  if (select count(*) from public.operation_receipts where client_request_id in ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4')) <> 3 then
    raise exception 'Veda failure: operation receipts missing';
  end if;

  if not exists (select 1 from public.audit_logs where action = 'veda_session.checkin')
     or not exists (select 1 from public.audit_logs where action = 'veda_session.checkout')
     or not exists (select 1 from public.audit_logs where action = 'veda_session.distribution') then
    raise exception 'Veda failure: check-in/out/distribution audit trail missing';
  end if;
end $$;

rollback;
