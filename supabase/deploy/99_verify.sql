-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Check schema was applied correctly
-- Run this in the SQL Editor after all migrations
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2) Functions
SELECT p.proname, pg_get_function_result(p.oid) as returns
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname;

-- 3) RLS policies count per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename ORDER BY tablename;

-- 4) Enums
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
GROUP BY t.typname ORDER BY t.typname;

-- 5) Storage buckets
SELECT id, name, public FROM storage.buckets;

-- 6) Auth users (seed data)
SELECT id, email FROM auth.users WHERE email LIKE '%.demo@ba.fazoo.app' ORDER BY email;

-- 7) Profiles (seed data)
SELECT p.id, p.full_name, p.role, p.account_status, o.name as org
FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
ORDER BY p.role, p.full_name;
