-- Pink Stuff manual stock-count correction.
-- Sold units must be opening stock minus closing stock.
-- Counting campaigns keep the morning selfie but do not require stock photos
-- at either check-in or checkout.

begin;

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid)
    into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ba_today'
  limit 1;

  if ddl is null then
    raise exception 'ba_today() not found';
  end if;

  ddl := replace(
    ddl,
    'then pv.closing - pv.opening else null end',
    'then pv.opening - pv.closing else null end'
  );

  execute ddl;
end
$$;

do $$
declare
  ddl text;
begin
  select pg_get_functiondef(p.oid)
    into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_campaign_stock_counts'
  limit 1;

  if ddl is not null then
    ddl := replace(
      ddl,
      '(c.quantity - o.quantity) as sold',
      '(o.quantity - c.quantity) as sold'
    );
    execute ddl;
  end if;
end
$$;

update public.brand_ambassador_assignments ass
set weekly_off_day = '{}'::integer[]
from public.campaigns c, public.organizations o
where ass.campaign_id = c.id
  and ass.organization_id = o.id
  and c.organization_id = o.id
  and lower(o.name) = 'pink stuff'
  and lower(c.name) = 'pink stuff'
  and ass.status = 'active';

commit;