-- Add the ICD Business Park store (Nairobi) to the Pink Stuff retail campaign.
-- Idempotent: skips if a store with this name already exists for the org.
do $$
declare
  v_org_id uuid;
begin
  select o.id into v_org_id
    from public.organizations o
   where o.slug = 'pink-stuff';

  if v_org_id is null then
    raise exception 'Pink Stuff organization not found';
  end if;

  if not exists (
    select 1 from public.stores s
     where s.organization_id = v_org_id
       and lower(s.name) = 'icd business park'
  ) then
    insert into public.stores (
      organization_id,
      name,
      address,
      latitude,
      longitude,
      geofence_radius_metres,
      status
    ) values (
      v_org_id,
      'ICD Business Park',
      'ICD (Industrial & Commercial Development) Business Park, Nairobi',
      -1.3361,
      36.8872,
      200,
      'active'
    );
  end if;
end;
$$;