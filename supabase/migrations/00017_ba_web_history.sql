-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00017 — BA web dashboard history.
--
-- Brand Ambassadors now get a read-only web view scoped to their OWN work.
-- RLS lets them read their own daily_logs, but campaign/store names live in
-- tables BAs cannot read (can_read_org excludes brand_ambassador). This
-- SECURITY DEFINER RPC joins the names while staying scoped to auth.uid(),
-- mirroring ba_today's pattern. No org-wide data is exposed.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.ba_my_history(p_limit integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p    public.profiles;
  rows jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  select coalesce(
           jsonb_agg(j order by j->>'attendance_date' desc, j->>'created_at' desc),
           '[]'::jsonb
         )
    into rows
  from (
    select jsonb_build_object(
             'attendance_date',   l.attendance_date,
             'attendance_status', l.attendance_status,
             'status',            l.status,
             'flagged',           l.flagged,
             'units',             coalesce(l.total_units, 0),
             'campaign_id',       l.campaign_id,
             'campaign_name',     c.name,
             'store_id',          l.store_id,
             'store_name',        s.name,
             'store_address',     s.address,
             'checkin_at',        l.checkin_at,
             'checkout_at',       l.checkout_at,
             'notes',             l.notes,
             'created_at',        l.created_at
           ) j
    from (
      select dl.*,
             (select sum(e.quantity)
              from public.sales_entries e
              where e.daily_log_id = dl.id) as total_units
      from public.daily_logs dl
      where dl.brand_ambassador_id = p.id
        and dl.status <> 'cancelled'
    ) l
    join public.campaigns c on c.id = l.campaign_id
    join public.stores s    on s.id = l.store_id
    order by l.attendance_date desc, l.created_at desc
    limit p_limit
  ) t;

  return coalesce(rows, '[]'::jsonb);
end;
$$;

grant execute on function public.ba_my_history(integer) to authenticated;