-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 0: NUCLEAR DROP — wipe public schema completely
-- Run this as a SINGLE statement in the SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the entire public schema and recreate it empty
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO anon;
GRANT ALL ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- Also clean private schema
DROP SCHEMA IF EXISTS private CASCADE;
CREATE SCHEMA private;

-- Drop extension
DROP EXTENSION IF EXISTS vector CASCADE;

SELECT 'Public schema wiped and recreated' as status;
