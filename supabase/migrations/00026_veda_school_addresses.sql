-- Preserve the field address supplied for each Veda school. Coordinates stay
-- nullable until an administrator verifies them; check-in geofencing must not
-- guess a location from an incomplete address.
alter table public.veda_schools
  add column if not exists address text;

