-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00021 — BA active campaign RPC.
--
-- The BA web dashboard shows a "work profile" header listing the campaigns a
-- Brand Ambassador is actively assigned to. Campaign store/name tables are not
-- directly readable by BAs (can_read_org excludes brand_ambassador), so this
-- SECURITY DEFINER RPC joins their current active assignments — scoped to
-- auth.uid() — mirroring ba_my_history / ba_today. No org-wide data is exposed.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.ba_my_campaigns()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p     public.profiles;
  lagos date;
  rows  jsonb;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'brand_ambassador' then
    raise exception 'Not a brand ambassador';
  end if;

  lagos := (now() at time zone 'Africa/Lagos')::date;

  select coalesce(
           jsonb_agg(j order by j->>'start_date' desc),
           '[]'::jsonb
         )
    into rows
  from (
    select jsonb_build_object(
             'campaign_id', ass.campaign_id,
             'campaign_name', c.name,
             'status', c.status,
             'start_date', ass.start_date,
             'end_date', ass.end_date,
             'store_id', ass.store_id,
             'store_name', s.name
           ) j
    from public.brand_ambassador_assignments ass
    join public.campaigns c on c.id = ass.campaign_id
    join public.stores s    on s.id = ass.store_id
    where ass.brand_ambassador_id = p.id
      and ass.status = 'active'
      and c.status = 'active'
      and ass.start_date <= lagos
      and (ass.end_date is null or ass.end_date >= lagos)
  ) t;

  return coalesce(rows, '[]'::jsonb);
end;
$$;

grant execute on function public.ba_my_campaigns() to authenticated;
