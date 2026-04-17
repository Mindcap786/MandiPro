-- Simulation Script: Verify Adjustment Logic for Future Users
-- This script simulates a complete lifecycle: New Buyer -> Sale -> Adjustment -> Verification
-- It proves that the "double counting" bug is gone and the ledger is accurate.

DO $$
DECLARE
    v_org_id UUID := '591b90bf-ed99-4da1-b684-353af4591c4f'; -- Using known Org ID
    v_buyer_id UUID;
    v_sale_id UUID;
    v_sale_item_id UUID;
    v_ledger_check NUMERIC;
    v_desc_check TEXT;
    v_lot_id UUID;
BEGIN
    RAISE NOTICE '--- STARTING SIMULATION FOR NEW USER ---';

    -- 1. Create a Test Buyer
    INSERT INTO contacts (organization_id, name, type, mobile, city, address, account_balance)
    VALUES (v_org_id, 'Test Buyer Future', 'buyer', '9999999999', 'Test City', 'Test Addr', 0)
    RETURNING id INTO v_buyer_id;
    
    RAISE NOTICE 'Created Test Buyer ID: %', v_buyer_id;

    -- 2. Create a Test Sale (1 item @ 100 rs)
    -- Need a lot ID first (just pick one)
    SELECT id INTO v_lot_id FROM lots WHERE organization_id = v_org_id LIMIT 1;
    
    INSERT INTO sales (organization_id, buyer_id, bill_no, sale_date, total_amount, total_amount_inc_tax, workflow_status)
    VALUES (v_org_id, v_buyer_id, 99999, NOW(), 100, 100, 'confirmed')
    RETURNING id INTO v_sale_id;
    
    INSERT INTO sale_items (organization_id, sale_id, lot_id, qty, rate, amount)
    VALUES (v_org_id, v_sale_id, v_lot_id, 1, 100, 100)
    RETURNING id INTO v_sale_item_id;
    
    RAISE NOTICE 'Created Sale ID: % for Amount: 100', v_sale_id;
    
    -- 3. Verify Initial Ledger State
    SELECT debit INTO v_ledger_check FROM ledger_entries 
    WHERE reference_id = v_sale_id AND transaction_type = 'sale' AND debit > 0;
    
    IF v_ledger_check != 100 THEN
        RAISE EXCEPTION 'Initial Ledger Balance Wrong! Expected 100, Got %', v_ledger_check;
    ELSE
        RAISE NOTICE 'Initial Ledger Verified: 100';
    END IF;

    -- 4. Perform Adjustment (Change Rate to 90) -> Total should be 90
    -- Calling the RPC function logic directly (simulating the RPC call)
    PERFORM create_comprehensive_sale_adjustment(
        v_org_id,
        v_sale_item_id,
        1, -- Same Qty
        90, -- New Rate (Was 100)
        'Test Adjustment'
    );
    
    RAISE NOTICE 'Adjustment Performed: Rate 100 -> 90';

    -- 5. Verify Final Ledger State
    SELECT debit, description INTO v_ledger_check, v_desc_check 
    FROM ledger_entries 
    WHERE reference_id = v_sale_id AND transaction_type = 'sale' AND debit > 0;
    
    RAISE NOTICE 'Final Ledger Balance: %', v_ledger_check;
    RAISE NOTICE 'Final Ledger Description: %', v_desc_check;

    IF v_ledger_check != 90 THEN
        RAISE EXCEPTION 'Final Ledger Balance Wrong! Expected 90, Got %', v_ledger_check;
    END IF;
    
    IF v_desc_check NOT LIKE '%Was: 100%' THEN
        RAISE EXCEPTION 'Audit Trail Missing in Description!';
    END IF;

    RAISE NOTICE 'SUCCESS: Logic Verified for Future User!';
    
    -- 6. Cleanup
    DELETE FROM ledger_entries WHERE reference_id = v_sale_id;
    DELETE FROM sale_adjustments WHERE sale_id = v_sale_id;
    DELETE FROM sale_items WHERE sale_id = v_sale_id;
    DELETE FROM sales WHERE id = v_sale_id;
    DELETE FROM contacts WHERE id = v_buyer_id;
    
    RAISE NOTICE 'Cleanup Complete.';
    
END $$;
