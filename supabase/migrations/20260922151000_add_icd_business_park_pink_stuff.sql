-- Add ICD Business Park to the Pink Stuff retail workspace.
-- Coordinates supplied for geofencing: -1.3361, 36.8872.

do $$
declare
  v_org uuid := '4a56be30-f290-46a7-9b51-9c3bbca138ef'::uuid;
begin
  if exists (
    select 1
    from public.stores
    where organization_id = v_org
      and lower(name) = lower('ICD Business Park')
  ) then
    update public.stores
    set address = 'ICD Business Park, Nairobi',
        latitude = -1.3361,
        longitude = 36.8872,
        geofence_radius_metres = 120,
        status = 'active',
        updated_at = now()
    where organization_id = v_org
      and lower(name) = lower('ICD Business Park');
  else
    insert into public.stores (
      organization_id,
      name,
      address,
      latitude,
      longitude,
      geofence_radius_metres,
      status
    )
    values (
      v_org,
      'ICD Business Park',
      'ICD Business Park, Nairobi',
      -1.3361,
      36.8872,
      120,
      'active'
    );
  end if;
end
$$;
