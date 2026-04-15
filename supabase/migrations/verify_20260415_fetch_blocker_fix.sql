-- ============================================================
-- VERIFICATION QUERIES: Database Fetch Blocker Fix
-- Migration: 20260415000000_permanent_fetch_blocker_fix
-- Purpose: Verify all migration components are working
-- ============================================================

-- Run each section separately and check results

-- ============================================================
-- PART 1: VERIFY INDEXES WERE CREATED
-- ============================================================

-- Should show all conditional indexes that were created
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'mandi' 
AND indexname LIKE 'idx_%'
ORDER BY tablename ASC;

-- Expected Results: 8-10 indexes for arrivals, lots, sales, etc.
-- If empty: indexes didn't create (check column existence)


-- ============================================================
-- PART 2: VERIFY FUNCTIONS EXIST
-- ============================================================

-- Check get_account_id function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'mandi'
AND routine_name = 'get_account_id';

-- Expected: 1 row with type FUNCTION

-- Check post_arrival_ledger function exists  
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'mandi'
AND routine_name = 'post_arrival_ledger';

-- Expected: 1 row with type FUNCTION


-- ============================================================
-- PART 3: VERIFY FAST VIEWS EXIST
-- ============================================================

SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'mandi'
AND table_name LIKE 'v_%_fast';

-- Expected: 3 rows (v_arrivals_fast, v_sales_fast, v_purchase_bills_fast)
-- If missing: tables didn't exist when migration ran


-- ============================================================
-- PART 4: TEST get_account_id FUNCTION (CRITICAL)
-- ============================================================

-- Replace 'your-org-uuid' with actual org UUID
-- This should return NULL or an account UUID (never error)

SELECT mandi.get_account_id(
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    '5001',
    NULL
) AS account_id;

-- Expected: NULL or UUID (not an error)
-- If error: function not working correctly


-- ============================================================
-- PART 5: TEST FAST VIEWS (Non-blocking reads)
-- ============================================================

-- Test arrivals fast view
SELECT COUNT(*) as arrival_count
FROM mandi.v_arrivals_fast
LIMIT 1;

-- Expected: Returns count or 0 (should be instant, <100ms)

-- Test sales fast view  
SELECT COUNT(*) as sales_count
FROM mandi.v_sales_fast
LIMIT 1;

-- Expected: Returns count or 0 (should be instant, <100ms)

-- Test purchase bills fast view
SELECT COUNT(*) as bills_count
FROM mandi.v_purchase_bills_fast
LIMIT 1;

-- Expected: Returns count or 0 (should be instant, <100ms)


-- ============================================================
-- PART 6: VERIFY DATA INTEGRITY (No orphans)
-- ============================================================

-- Check for orphan lots
SELECT COUNT(*) as orphan_lots_count
FROM mandi.lots
WHERE arrival_id IS NOT NULL
AND arrival_id NOT IN (SELECT id FROM mandi.arrivals);

-- Expected: 0 (all orphans deleted by migration cleanup)

-- Check for orphan sale items
SELECT COUNT(*) as orphan_sale_items_count
FROM mandi.sale_items
WHERE sale_id IS NOT NULL
AND sale_id NOT IN (SELECT id FROM mandi.sales);

-- Expected: 0 (all orphans deleted by migration cleanup)


-- ============================================================
-- PART 7: PERFORMANCE TEST (Speed verification)
-- ============================================================

-- Test arrivals fetch performance (should be <500ms)
EXPLAIN ANALYZE
SELECT *
FROM mandi.v_arrivals_fast
LIMIT 20;

-- Check "Planning Time" and "Execution Time" in output
-- Should be <500ms total


-- ============================================================
-- PART 8: TYPE SAFETY TEST (Account code lookups)
-- ============================================================

-- This should NOT error with "operator does not exist: text = integer"
SELECT 
    a.id,
    a.code,
    a.name
FROM mandi.accounts a
WHERE a.organization_id = '550e8400-e29b-41d4-a716-446655440000'::uuid
AND a.code = '5001'
LIMIT 1;

-- Expected: Returns account or NULL (never type mismatch error)


-- ============================================================
-- PART 9: LEDGER POSTING TEST (post_arrival_ledger)
-- ============================================================

-- Test the post_arrival_ledger function with first available arrival
-- (This will return empty if no arrivals exist - that's OK, just means no data to test)
SELECT 
    a.id as arrival_id,
    mandi.post_arrival_ledger(a.id) as ledger_result
FROM mandi.arrivals a
LIMIT 1;

-- Expected: JSON response with success/error fields
-- Example: {"success": true, "message": "Arrival logged successfully", ...}
-- NOT: Error about missing accounts or types
-- If no rows returned: No arrivals exist in database (skip this test)


-- ============================================================
-- PART 10: COMPREHENSIVE HEALTH CHECK
-- ============================================================

-- Run this query to get complete migration status
DO $$
DECLARE
    v_indexes_count INT;
    v_functions_count INT;
    v_views_count INT;
    v_orphan_lots INT;
    v_orphan_sales INT;
BEGIN
    -- Count indexes
    SELECT COUNT(*) INTO v_indexes_count
    FROM pg_indexes
    WHERE schemaname = 'mandi' AND indexname LIKE 'idx_%';
    
    -- Count functions
    SELECT COUNT(*) INTO v_functions_count
    FROM information_schema.routines
    WHERE routine_schema = 'mandi'
    AND routine_name IN ('get_account_id', 'post_arrival_ledger');
    
    -- Count fast views
    SELECT COUNT(*) INTO v_views_count
    FROM information_schema.tables
    WHERE table_schema = 'mandi'
    AND table_name LIKE 'v_%_fast';
    
    -- Check orphans
    SELECT COUNT(*) INTO v_orphan_lots
    FROM mandi.lots
    WHERE arrival_id IS NOT NULL
    AND arrival_id NOT IN (SELECT id FROM mandi.arrivals);
    
    SELECT COUNT(*) INTO v_orphan_sales
    FROM mandi.sale_items
    WHERE sale_id IS NOT NULL
    AND sale_id NOT IN (SELECT id FROM mandi.sales);
    
    RAISE NOTICE '';
    RAISE NOTICE '========== MIGRATION HEALTH CHECK ==========';
    RAISE NOTICE 'Performance Indexes Created: % (expected: 8+)', v_indexes_count;
    RAISE NOTICE 'Functions Created: % (expected: 2)', v_functions_count;
    RAISE NOTICE 'Fast Views Created: % (expected: 3)', v_views_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Data Integrity:';
    RAISE NOTICE '  Orphan Lots: % (expected: 0)', v_orphan_lots;
    RAISE NOTICE '  Orphan Sale Items: % (expected: 0)', v_orphan_sales;
    RAISE NOTICE '';
    
    -- Final verdict
    IF v_indexes_count >= 8 AND v_functions_count = 2 AND v_views_count = 3 
        AND v_orphan_lots = 0 AND v_orphan_sales = 0 THEN
        RAISE NOTICE '✅ MIGRATION COMPLETE AND HEALTHY';
    ELSE
        RAISE NOTICE '⚠️  MIGRATION INCOMPLETE OR DAMAGED';
    END IF;
    RAISE NOTICE '==========================================';
END $$;

-- ============================================================
-- EXPLANATION OF RESULTS
-- ============================================================
/*

IF ALL TESTS PASS:
✅ Migration is complete and working correctly
✅ Indexes are optimized for fast queries
✅ Functions are type-safe and non-blocking
✅ Fast views are ready for non-blocking reads  
✅ No orphaned records
✅ Data integrity maintained

NEXT STEPS:
1. Deploy frontend code (if not already done)
2. Test in development environment
3. Monitor performance in logs
4. Check Sentry for any type mismatch errors

IF TESTS FAIL:
❌ Review specific test output
❌ Check if tables/columns exist (conditional creation)
❌ Verify migration applied completely
❌ Check Postgres version compatibility
❌ Review error logs in Supabase dashboard

TROUBLESHOOTING:
- Indexes not created? Check if columns exist in arrivals/sales/lots tables
- Views not exist? Check if base tables exist
- Functions not working? Check Postgres logs for syntax errors
- Orphans found? Run cleanup manually (see migration PART 6)

*/
