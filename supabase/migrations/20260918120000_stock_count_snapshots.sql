-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo — Stock-count campaigns (BOD/EOD snapshots).
--
-- Some tenants run campaigns where a BA counts stock at the start of the day
-- (opening) and again at closing. The difference (opening − closing) is the
-- number of units sold, and both counts are backed by shelf photos.
--
-- This migration:
--   1. Adds campaigns.stock_count_model (boolean, default false).
--   2. Adds stock_snapshots (per log × SKU × count_type) with RLS read
--      scoping identical to sales_entries; writes happen only through the
--      record_stock_snapshot SECURITY DEFINER RPC.
--   3. record_stock_snapshot() – idempotent (client_request_id), BA-owned,
--      resolving the open daily log like ba_record_sale, closing requires an
--      opening count first, audit logged.
--   4. ba_checkout() – for counting campaigns, refuses checkout until every
--      active SKU has both an opening and closing count.
--   5. ba_record_sale() – disabled for counting campaigns (counts, not
--      entries, are the source of truth).
--   6. ba_today() – surfaces `counting`, per-SKU `stock` snapshots and
--      `diff_total` so the BA app can render the counts-first flow.
--   7. admin_campaign_stock_counts() – staff report (opening / closing /
--      sold per log × SKU).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. campaign flag ────────────────────────────────────────────────────────
alter table public.campaigns
  add column stock_count_model boolean not null default false;
comment on column public.campaigns.stock_count_model is
  'true = BA records opening & closing stock counts; sold = opening − closing';

-- ── 2. stock_snapshots ──────────────────────────────────────────────────────
create table public.stock_snapshots (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id),
  daily_log_id      uuid not null references public.daily_logs(id) on delete cascade,
  sku_id            uuid not null references public.skus(id),
  count_type        text not null check (count_type in ('opening','closing')),
  quantity          integer not null check (quantity between 0 and 1000000),
  client_request_id uuid,
  recorded_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index stock_snapshots_log_sku_type_uix
  on public.stock_snapshots (daily_log_id, sku_id, count_type);
create unique index stock_snapshots_client_request_uix
  on public.stock_snapshots (client_request_id) where client_request_id is not null;
create index stock_snapshots_log_idx on public.stock_snapshots (daily_log_id);
create index stock_snapshots_org_report_idx on public.stock_snapshots (organization_id, count_type, recorded_at desc);

do $$
declare t text;
begin
  foreach t in array array['stock_snapshots'] loop
    execute format('create trigger set_updated_at_%s before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

alter table public.stock_snapshots enable row level security;

-- Read scoping mirrors sales_entries: the owning BA (active account) or any
-- staff member who can read the org. Writes are exclusively via the RPC.
create policy stock_snapshots_select_scoped on public.stock_snapshots
  for select using (
    exists (
      select 1 from public.daily_logs d
      where d.id = daily_log_id
        and (
          (d.brand_ambassador_id = auth.uid() and account_status_active())
          or public.can_read_org(stock_snapshots.organization_id)
        )
    )
  );

-- ── 3. record_stock_snapshot RPC ────────────────────────────────────────────
drop function if exists public.record_stock_snapshot(uuid, uuid, text, integer, uuid);
create function public.record_stock_snapshot(
  p_daily_log_id      uuid,
  p_sku_id            uuid,
  p_count_type        text,
  p_quantity          integer,
  p_client_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p           public.profiles;
  l           public.daily_logs%rowtype;
  k           record;
  snap        public.stock_snapshots%rowtype;
  prior       jsonb;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 1000000 then
    raise exception 'Quantity must be between 0 and 1000000.';
  end if;
  if p_count_type not in ('opening','closing') then
    raise exception 'Count type must be opening or closing.';
  end if;
  if p_client_request_id is null then
    raise exception 'A client request id is required.';
  end if;

  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'stock_snapshot', p);
  if prior is not null and prior->>'snapshot_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select * into l from public.daily_logs
   where id = (
     select id from public.daily_logs
      where brand_ambassador_id = p.id and status = 'open'
        and (p_daily_log_id is null or id = p_daily_log_id)
      order by attendance_date desc, created_at desc limit 1
   );
  if l.id is null then
    raise exception 'Check in before recording stock counts.';
  end if;
  if l.attendance_status <> 'present' then
    raise exception 'Stock counts cannot be recorded today.';
  end if;
  if p_daily_log_id is not null and l.id is distinct from p_daily_log_id then
    raise exception 'That count does not match an open check-in today.';
  end if;

  select * into k from public.skus
   where id = p_sku_id and organization_id = p.organization_id
     and campaign_id = l.campaign_id and status = 'active';
  if k.id is null then
    raise exception 'That SKU is not available on your current campaign.';
  end if;

  if p_count_type = 'closing' then
    if not exists (
      select 1 from public.stock_snapshots
      where daily_log_id = l.id and sku_id = p_sku_id and count_type = 'opening'
    ) then
      raise exception 'Record the opening count for % before the closing count.',
        k.name;
    end if;
  end if;

  insert into public.stock_snapshots
    (organization_id, daily_log_id, sku_id, count_type, quantity, client_request_id, recorded_at)
  values
    (p.organization_id, l.id, p_sku_id, p_count_type, p_quantity, p_client_request_id, now())
  on conflict (daily_log_id, sku_id, count_type) do update set
    quantity          = excluded.quantity,
    client_request_id = coalesce(public.stock_snapshots.client_request_id, excluded.client_request_id),
    recorded_at       = now()
  returning * into snap;

  perform public.write_audit('stock_snapshot.record', 'stock_snapshots', snap.id,
    jsonb_build_object('daily_log_id', l.id, 'sku_id', p_sku_id,
                       'count_type', p_count_type, 'quantity', p_quantity));

  prior := jsonb_build_object('status','ok','operation','stock_snapshot',
    'snapshot_id', snap.id, 'count_type', p_count_type, 'quantity', p_quantity);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── 4. ba_checkout: refuse checkout until counts complete ───────────────────
drop function if exists public.ba_checkout(double precision, double precision, uuid, uuid, text, text, double precision, text);
create function public.ba_checkout(
  p_latitude            double precision,
  p_longitude           double precision,
  p_client_request_id   uuid,
  p_daily_log_id        uuid default null,
  p_stock_photo_path    text default null,
  p_uniform_selfie_path text default null,
  p_accuracy_metres     double precision default null,
  p_checkout_photo_path text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p           public.profiles;
  lagos_d     date;
  l           public.daily_logs%rowtype;
  s           record;
  org         record;
  dist        double precision;
  outside     boolean;
  v_counting  boolean;
  missing     jsonb;
  prior       jsonb;
begin
  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'checkout', p);
  if prior is not null and prior->>'status' = 'ok' then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;

  select * into l from public.daily_logs
   where brand_ambassador_id = p.id
     and attendance_date = lagos_d
     and status = 'open'
     and (p_daily_log_id is null or id = p_daily_log_id)
   order by created_at desc limit 1;

  if l.id is null then
    raise exception 'No open day to check out from.';
  end if;

  if p_stock_photo_path is not null
     and not (p_stock_photo_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;
  if p_uniform_selfie_path is not null
     and not (p_uniform_selfie_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Photo upload paths are invalid';
  end if;
  if p_checkout_photo_path is not null
     and not (p_checkout_photo_path like p.organization_id::text || '/' || p.id::text || '/%') then
    raise exception 'Checkout photo path is invalid';
  end if;

  select * into s from public.stores where id = l.store_id;
  select settings->>'allow_out_of_geofence_checkout' as allow_flag into org
    from public.organizations where id = p.organization_id;
  select stock_count_model into v_counting
    from public.campaigns where id = l.campaign_id;

  dist    := public.distance_metres(p_latitude, p_longitude, s.latitude, s.longitude);
  outside := dist > s.geofence_radius_metres;

  if outside and coalesce(org.allow_flag, 'false') <> 'true' then
    raise exception 'You are % m from % — checkout requires % m or less.',
      round(dist)::int, s.name, s.geofence_radius_metres;
  end if;

  -- Counting campaigns: every active SKU needs both an opening and closing
  -- count before the day can be locked. The error text matches the terminal
  -- classifier on the device so offline retries stop with the message.
  if v_counting then
    select coalesce(jsonb_agg(k.name), '[]'::jsonb) into missing
    from public.skus k
    left join public.stock_snapshots o
      on o.daily_log_id = l.id and o.sku_id = k.id and o.count_type = 'opening'
    left join public.stock_snapshots c
      on c.daily_log_id = l.id and c.sku_id = k.id and c.count_type = 'closing'
    where k.campaign_id = l.campaign_id and k.status = 'active'
      and (o.id is null or c.id is null);

    if jsonb_array_length(missing) > 0 then
      raise exception 'Opening and closing stock counts must be recorded before checkout. Missing: %',
        missing;
    end if;
  end if;

  update public.daily_logs set
    checkout_at            = now(),
    checkout_latitude      = p_latitude,
    checkout_longitude     = p_longitude,
    checkout_distance_metres = round(dist::numeric, 1),
    flagged                = outside,
    status                 = 'completed'
  where id = l.id;

  if p_stock_photo_path is not null and p_uniform_selfie_path is not null then
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, l.id, 'checkout_stock_shelf', p_stock_photo_path, now()),
           (p.organization_id, l.id, 'checkout_uniform_selfie', p_uniform_selfie_path, now())
    on conflict do nothing;
  end if;

  if p_checkout_photo_path is not null then
    insert into public.daily_log_photos (organization_id, daily_log_id, photo_type, storage_path, captured_at)
    values (p.organization_id, l.id, 'checkout', p_checkout_photo_path, now())
    on conflict do nothing;
  end if;

  perform public.write_audit(
    case when outside then 'daily_log.checkout_flagged' else 'daily_log.checkout' end,
    'daily_logs', l.id,
    jsonb_build_object('daily_log_id', l.id, 'distance_metres', round(dist::numeric,1),
                       'outside_geofence', outside, 'accuracy_metres', p_accuracy_metres));

  prior := jsonb_build_object('status','ok','operation','checkout',
    'daily_log_id', l.id, 'flagged', outside, 'campaign_id', l.campaign_id);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── 5. ba_record_sale guard for counting campaigns ──────────────────────────
drop function if exists public.ba_record_sale(uuid, integer, uuid, timestamp with time zone, uuid);
create function public.ba_record_sale(
  p_sku_id            uuid,
  p_quantity          integer,
  p_client_request_id uuid,
  p_recorded_at_hint  timestamptz default null,
  p_daily_log_id      uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p     public.profiles;
  l     public.daily_logs%rowtype;
  k     record;
  entry public.sales_entries%rowtype;
  prior jsonb;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;
  if p_quantity > 100000 then
    raise exception 'That quantity looks wrong.';
  end if;

  p := public.assert_active_ba();

  prior := public.try_consume_receipt(p_client_request_id, 'sale', p);
  if prior is not null and prior->>'sales_entry_id' is not null then
    return prior;
  end if;
  if prior is not null and prior->>'status' = 'pending' then
    delete from public.operation_receipts where client_request_id = p_client_request_id;
  elsif prior is not null then
    return prior;
  end if;

  select * into l from public.daily_logs
   where id = (
     select id from public.daily_logs
      where brand_ambassador_id = p.id and status = 'open'
        and (p_daily_log_id is null or id = p_daily_log_id)
      order by attendance_date desc, created_at desc limit 1
   );

  if l.id is null then
    raise exception 'Check in before recording sales.';
  end if;
  if l.attendance_status <> 'present' then
    raise exception 'Sales cannot be recorded today.';
  end if;
  if p_daily_log_id is not null and l.id is distinct from p_daily_log_id then
    raise exception 'That sale does not match an open check-in today.';
  end if;
  if (select stock_count_model from public.campaigns c where c.id = l.campaign_id) then
    raise exception 'Stock counts on this campaign record sales — manual sale entries are disabled.';
  end if;

  select * into k from public.skus
   where id = p_sku_id and organization_id = p.organization_id
     and campaign_id = l.campaign_id and status = 'active';
  if k.id is null then
    raise exception 'That SKU is not available on your current campaign.';
  end if;

  insert into public.sales_entries
    (organization_id, daily_log_id, sku_id, quantity, recorded_at, client_request_id)
  values
    (p.organization_id, l.id, p_sku_id, p_quantity,
     coalesce(p_recorded_at_hint, now()), p_client_request_id)
  returning * into entry;

  perform public.write_audit('sales.record', 'sales_entries', entry.id,
    jsonb_build_object('sku_id', p_sku_id, 'quantity', p_quantity));

  prior := jsonb_build_object('status','ok','operation','sale',
    'sales_entry_id', entry.id, 'quantity', p_quantity);
  perform public.complete_receipt(p_client_request_id, prior);
  return prior;
end;
$$;

-- ── 6. ba_today: counting flag + stock snapshots + diff ─────────────────────
drop function if exists public.ba_today();
create function public.ba_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p           public.profiles;
  lagos_d     date;
  dow         int;
  a           record;      -- each active assignment
  l           public.daily_logs%rowtype;
  sales       jsonb;
  total       int;
  stock       jsonb;
  diff_total  int;
  radius      int;
  items       jsonb := '[]'::jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.role <> 'brand_ambassador' then
    raise exception 'Only brand ambassadors can perform this action';
  end if;

  lagos_d := (now() at time zone 'Africa/Lagos')::date;
  dow     := extract(dow from lagos_d)::int;

  for a in
    select ass.*, c.name as campaign_name, c.stock_count_model as counting,
           s.name as store_name, s.address as store_address,
           s.latitude as store_latitude, s.longitude as store_longitude,
           s.geofence_radius_metres
    from public.brand_ambassador_assignments ass
    join public.campaigns c on c.id = ass.campaign_id
    left join public.stores s on s.id = ass.store_id
    where ass.brand_ambassador_id = p.id
      and ass.organization_id = p.organization_id
      and ass.status = 'active'
      and ass.start_date <= lagos_d
      and (ass.end_date is null or ass.end_date >= lagos_d)
    order by ass.start_date desc, ass.created_at desc
  loop
    l := null;
    sales := '[]'::jsonb;
    total := 0;
    stock := '[]'::jsonb;
    diff_total := 0;
    radius := a.geofence_radius_metres;

    select * into l from public.daily_logs
      where brand_ambassador_id = p.id
        and campaign_id = a.campaign_id
        and attendance_date = lagos_d
        and status <> 'cancelled'
      order by created_at desc limit 1;

    if l.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'sku_id', e.sku_id, 'sku_name', k.name,
               'sku_code', k.code, 'quantity', e.quantity, 'recorded_at', e.recorded_at))
               filter (where e.id is not null), '[]'::jsonb),
             coalesce(sum(e.quantity) filter (where e.id is not null), 0)
        into sales, total
      from public.sales_entries e
      left join public.skus k on k.id = e.sku_id
      where e.daily_log_id = l.id;
    end if;

    if a.counting then
      if l.id is not null then
        with pivot as (
          select ss.sku_id,
                 max(case when ss.count_type = 'opening' then ss.quantity end) as opening,
                 max(case when ss.count_type = 'closing' then ss.quantity end) as closing
          from public.stock_snapshots ss
          where ss.daily_log_id = l.id
          group by ss.sku_id
        )
        select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'sku_id', k.id, 'sku_name', k.name, 'sku_code', k.code,
                   'opening', pv.opening, 'closing', pv.closing,
                   'diff', case when pv.opening is not null and pv.closing is not null
                                then pv.closing - pv.opening else null end)
                 order by k.name), '[]'::jsonb)
          into stock
        from public.skus k
        left join pivot pv on pv.sku_id = k.id
        where k.campaign_id = a.campaign_id and k.status = 'active';

        select coalesce(sum((j->>'diff')::integer) filter (where j->>'diff' is not null), 0)
          into diff_total
        from jsonb_array_elements(stock) j;
      else
        select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'sku_id', k.id, 'sku_name', k.name, 'sku_code', k.code,
                   'opening', null, 'closing', null, 'diff', null)
                 order by k.name), '[]'::jsonb)
          into stock
        from public.skus k
        where k.campaign_id = a.campaign_id and k.status = 'active';
      end if;
    end if;

    items := items
      || jsonb_build_object(
           'assignment', jsonb_build_object(
              'id', a.id,
              'campaign_id', a.campaign_id, 'campaign_name', a.campaign_name,
              'store_id', a.store_id, 'store_name', a.store_name,
              'store_address', a.store_address,
              'store_latitude', a.store_latitude, 'store_longitude', a.store_longitude,
              'geofence_radius_metres', radius),
           'weekly_off_day', a.weekly_off_day,
           'is_weekly_off_today', coalesce(dow = ANY(a.weekly_off_day), false),
           'log', case when l.id is null then null else to_jsonb(l) - 'client_request_id' end,
           'sales', sales,
           'total_units_today', total,
           'counting', a.counting,
           'stock', stock,
           'diff_total', diff_total,
           'attendance_status', l.attendance_status,
           'log_status', l.status);
  end loop;

  return jsonb_build_object(
    'attendance_date', lagos_d,
    'assignments', items
  );
end;
$$;

-- ── 7. admin_campaign_stock_counts ──────────────────────────────────────────
drop function if exists public.admin_campaign_stock_counts(uuid, date, date);
create function public.admin_campaign_stock_counts(
  p_campaign_id uuid,
  p_from        date default null,
  p_to          date default null
)
returns table (
  daily_log_id    uuid,
  attendance_date date,
  ba_id           uuid,
  ba_name         text,
  store_name      text,
  sku_id          uuid,
  sku_name        text,
  sku_code        text,
  opening         integer,
  closing         integer,
  sold            integer,
  log_status      public.daily_log_status
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_org   uuid;
  v_role  public.app_role;
begin
  select organization_id into v_org from public.campaigns where id = p_campaign_id;
  if v_org is null then
    raise exception 'Campaign not found';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (
    v_role = 'super_admin'
    or (v_role = 'organization_admin' and (select organization_id from public.profiles where id = auth.uid()) = v_org)
    or (v_role = 'supervisor' and public.supervisor_can_see_campaign(auth.uid(), p_campaign_id))
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    l.id            as daily_log_id,
    l.attendance_date,
    pr.id           as ba_id,
    pr.full_name    as ba_name,
    coalesce(st.name, 'Unknown') as store_name,
    k.id            as sku_id,
    k.name          as sku_name,
    k.code          as sku_code,
    o.quantity      as opening,
    c.quantity      as closing,
    (c.quantity - o.quantity) as sold,
    l.status        as log_status
  from public.daily_logs l
  join public.profiles pr          on pr.id = l.brand_ambassador_id
  left join public.stores st       on st.id = l.store_id
  join public.stock_snapshots o    on o.daily_log_id = l.id and o.count_type = 'opening'
  join public.stock_snapshots c    on c.daily_log_id = l.id and c.count_type = 'closing'
  join public.skus k               on k.id = o.sku_id
  where l.campaign_id = p_campaign_id
    and l.status <> 'cancelled'
    and (p_from is null or l.attendance_date >= p_from)
    and (p_to   is null or l.attendance_date <= p_to)
  order by l.attendance_date desc, pr.full_name asc, k.name asc;
end;
$$;

-- ── 8. grants ───────────────────────────────────────────────────────────────
grant select on public.stock_snapshots to authenticated;

grant execute on function
  public.record_stock_snapshot(uuid, uuid, text, integer, uuid),
  public.ba_checkout(double precision, double precision, uuid, uuid, text, text, double precision, text),
  public.ba_record_sale(uuid, integer, uuid, timestamp with time zone, uuid),
  public.ba_today(),
  public.admin_campaign_stock_counts(uuid, date, date)
to authenticated;

revoke execute on function
  public.record_stock_snapshot(uuid, uuid, text, integer, uuid),
  public.admin_campaign_stock_counts(uuid, date, date)
from public, anon;

commit;