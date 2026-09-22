-- Correct ICD Business Park Pink Stuff location to Plus Code MV4J+QRJ.
update public.stores
set address = 'MV4J+QRJ, Nairobi, Kenya',
    latitude = -1.34303,
    longitude = 36.88189453125,
    geofence_radius_metres = 120,
    status = 'active',
    updated_at = now()
where organization_id = '4a56be30-f290-46a7-9b51-9c3bbca138ef'::uuid
  and lower(name) = lower('ICD Business Park');
