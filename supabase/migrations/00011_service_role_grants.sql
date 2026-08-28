-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00011 — restore standard service_role privileges
-- Supabase's platform `roles.sql` template grants the privileged `service_role`
-- bypass key full access (it is server-only and deliberately bypasses RLS for
-- admin operations). This project only ever granted `authenticated`, so the
-- service key silently had no table privileges (SELECT/INSERT/UPDATE/DELETE).
-- Restoring the standard grants makes the service-role client usable again
-- (admin import tooling, password-reset admin calls, etc.). `GRANT` is
-- idempotent, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

grant usage on schema public to service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;

alter default privileges in schema public
  grant all on tables    to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on routines  to service_role;

grant execute on all functions in schema public to service_role;
