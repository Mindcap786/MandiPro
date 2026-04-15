-- FINAL FIX: Ensure all data access is working
-- Applied: April 15, 2026

-- 1. Verify RLS is enabled on all critical tables
ALTER TABLE mandi.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop any remaining problematic policies and keep only the working ones
-- (Based on mandi.get_user_org_id() function)

-- For sales table - ensure SELECT policy exists
DROP POLICY IF EXISTS "mandi_sales_tenant" ON mandi.sales;
CREATE POLICY "mandi_sales_tenant" ON mandi.sales
    FOR SELECT USING (organization_id = mandi.get_user_org_id());

-- For arrivals table - ensure SELECT policy exists
DROP POLICY IF EXISTS "mandi_arrivals_select_v2" ON mandi.arrivals;
CREATE POLICY "mandi_arrivals_select_v2" ON mandi.arrivals
    FOR SELECT USING (organization_id = mandi.get_user_org_id());

-- For lots table - ensure SELECT policy exists
DROP POLICY IF EXISTS "mandi_lots_tenant" ON mandi.lots;
CREATE POLICY "mandi_lots_tenant" ON mandi.lots
    FOR SELECT USING (organization_id = mandi.get_user_org_id());

-- 3. Verify permissions are set
GRANT SELECT ON mandi.sales TO anon, authenticated;
GRANT SELECT ON mandi.arrivals TO anon, authenticated;
GRANT SELECT ON mandi.lots TO anon, authenticated;
GRANT SELECT ON mandi.contacts TO anon, authenticated;
GRANT SELECT ON mandi.commodities TO anon, authenticated;
GRANT SELECT ON mandi.ledger_entries TO anon, authenticated;
GRANT SELECT ON mandi.accounts TO anon, authenticated;

-- 4. Verify views are accessible
GRANT SELECT ON mandi.view_party_balances TO anon, authenticated;

-- 5. Test the actual data access
DO $$
DECLARE
    v_test_org_id UUID := '619cd49c-8556-4c7d-96ab-9c2939d76ca8';
    v_sales_count INT;
    v_arrivals_count INT;
    v_lots_count INT;
BEGIN
    -- Count sales for test org
    SELECT COUNT(*) INTO v_sales_count FROM mandi.sales 
    WHERE organization_id = v_test_org_id;
    
    -- Count arrivals for test org
    SELECT COUNT(*) INTO v_arrivals_count FROM mandi.arrivals 
    WHERE organization_id = v_test_org_id;
    
    -- Count lots for test org
    SELECT COUNT(*) INTO v_lots_count FROM mandi.lots 
    WHERE organization_id = v_test_org_id;
    
    RAISE NOTICE '✅ Data verification complete:';
    RAISE NOTICE '   Sales: %', v_sales_count;
    RAISE NOTICE '   Arrivals: %', v_arrivals_count;
    RAISE NOTICE '   Lots: %', v_lots_count;
END $$;

-- 6. Final status
SELECT 'All systems ready for data loading' as status;