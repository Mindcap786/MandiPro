-- VERIFICATION: Confirm Mandi Schema is Ready
-- Run this in Supabase SQL Editor to verify the fix worked

-- TEST 1: Mandi schema exists
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name = 'mandi';
-- ✅ Should return: mandi

-- TEST 2: Count all tables in mandi
SELECT COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'mandi' AND table_type = 'BASE TABLE';
-- ✅ Should return: > 10

-- TEST 3: List all critical tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'mandi' AND table_type = 'BASE TABLE'
ORDER BY table_name;
-- ✅ Should show: sales, arrivals, lots, ledger_entries, profiles, etc.

-- TEST 4: Profiles table exists and has RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'mandi' AND tablename = 'profiles';
-- ✅ Should return: profiles | true

-- TEST 5: RLS policies exist
SELECT table_name, policyname 
FROM information_schema.table_constraints tc
JOIN information_schema.tables t ON tc.table_name = t.table_name
WHERE t.table_schema = 'mandi' AND t.table_name = 'profiles'
LIMIT 10;
-- OR direct query:
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'mandi' 
ORDER BY tablename;
-- ✅ Should show policies for profiles, sales, arrivals, lots, ledger_entries

-- TEST 6: Do functions exist?
SELECT COUNT(*) as function_count
FROM information_schema.routines 
WHERE routine_schema = 'mandi' AND routine_type = 'FUNCTION';
-- ✅ Should return: > 5

-- TEST 7: Can we query sales?
SELECT COUNT(*) as sale_count FROM mandi.sales LIMIT 1;
-- ✅ Should return: a number (0 or more)

-- TEST 8: Can we query arrivals?
SELECT COUNT(*) as arrival_count FROM mandi.arrivals LIMIT 1;
-- ✅ Should return: a number (0 or more)

-- TEST 9: Permissions set correctly?
SELECT grantee, privilege_type 
FROM information_schema.table_privileges 
WHERE table_schema = 'mandi' 
AND table_name = 'sales'
LIMIT 10;
-- ✅ Should show: authenticated | SELECT,UPDATE,INSERT,DELETE
