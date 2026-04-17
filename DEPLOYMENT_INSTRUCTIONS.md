-- ============================================================
-- DEPLOYMENT CHECKLIST: Fix "Could not choose best candidate"
-- ============================================================
-- ⚠️ IMPORTANT: This must be executed in Supabase SQL Editor
-- File location: /Users/shauddin/Desktop/MandiPro/supabase/migrations/20260424000000_consolidate_confirm_sale_transaction.sql

-- INSTRUCTIONS:
-- 1. Open your Supabase Dashboard
-- 2. Go to SQL Editor (sidebar → SQL)
-- 3. Create NEW query
-- 4. Copy-paste the ENTIRE content from the migration file above
-- 5. Click "Execute" button (green play icon)
-- 6. Wait for success message
-- 7. Refresh browser and try creating a sale again

-- ============================================================
-- STEP 1: Verify old functions exist
-- ============================================================
SELECT 
    p.proname,
    pg_get_functiondef(p.oid) as function_definition,
    obj_description(p.oid, 'pg_proc') as description
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'mandi'
AND p.proname = 'confirm_sale_transaction'
ORDER BY p.proname, p.pronargs;

-- Expected before fix: Multiple rows (multiple overloads)
-- Expected after fix: Single row with ONE function


-- ============================================================
-- STEP 2: ONCE YOU EXECUTE THE MIGRATION FILE,
-- Run verification query
-- ============================================================
-- Run this AFTER you've executed the migration file to confirm success

SELECT 
    'Function exists and is deployable' as status,
    proname as function_name,
    pronargs as number_of_parameters,
    prorettype::regtype as return_type,
    'SUCCESS ✅' as deployment_status
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'mandi'
AND p.proname = 'confirm_sale_transaction';

-- Expected result: 1 row, proname='confirm_sale_transaction'


-- ============================================================
-- WHAT THE MIGRATION DOES:
-- ============================================================
-- 1. Drops ALL old confirm_sale_transaction functions
--    → Eliminates ambiguity
-- 2. Creates ONE clean, fresh function
--    → No duplicate signatures
-- 3. Includes amount_received in INSERT
--    → No data loss on payments
-- 4. Three-tier payment status logic
--    → pending / partial / paid


-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- If you get "permission denied" error:
-- You need to run as authenticated user with schema permissions

-- If you get "syntax error" error:
-- Make sure you copied the ENTIRE file, not just parts

-- If the error persists after deployment:
-- Browser cache may be old. Do Ctrl+Shift+Delete → Clear browsing data
-- Then reload the app

-- If everything looks good but error still happens:
-- Go to Sales Form, press F12 (DevTools) → Network tab
-- Try creating a sale
-- Check if RPC response shows the new function or old error
