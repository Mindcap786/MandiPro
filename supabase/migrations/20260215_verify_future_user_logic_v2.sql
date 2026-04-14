-- Simulation Script: Verify Adjustment Logic for Future Users
-- This script simulates a complete lifecycle: New Buyer -> Sale -> Adjustment -> Verification

DO $$
DECLARE
    v_org_id UUID := '591b90bf-ed99-4da1-b684-353af4591c4f'; 
    v_buyer_id UUID;
    v_sale_id UUID;
    v_sale_item_id UUID;
    v_lot_id UUID;
    
    v_ledger_check NUMERIC;
    v_desc_check TEXT;
    
BEGIN
    -- 0. Get a valid LOT first
    SELECT id INTO v_lot_id FROM lots WHERE organization_id = v_org_id LIMIT 1;
    IF v_lot_id IS NULL THEN RAISE EXCEPTION 'No lots available for test'; END IF;

    -- 1. Create a Test Buyer
    INSERT INTO contacts (organization_id, name, type, phone, city, address, account_balance)
    VALUES (v_org_id, 'Test Buyer Future', 'buyer', '9999999999', 'Test City', 'Test Addr', 0)
    RETURNING id INTO v_buyer_id;
    
    -- 2. Create Sale Header (Amount 100)
    INSERT INTO sales (organization_id, buyer_id, bill_no, sale_date, total_amount, total_amount_inc_tax, workflow_status)
    VALUES (v_org_id, v_buyer_id, 999123, NOW(), 100, 100, 'confirmed')
    RETURNING id INTO v_sale_id;
    
    -- 3. Create Sale Item 
    INSERT INTO sale_items (organization_id, sale_id, lot_id, qty, rate, amount)
    VALUES (v_org_id, v_sale_id, v_lot_id, 1, 100, 100)
    RETURNING id INTO v_sale_item_id;
    
    -- TRIGGER should have fired now. Check Ledger.
    SELECT debit INTO v_ledger_check 
    FROM ledger_entries 
    WHERE reference_id = v_sale_id AND transaction_type = 'sale' AND debit > 0;
    
    RAISE NOTICE 'Step 1: Initial Ledger (Should be 100): %', v_ledger_check;
    
    IF v_ledger_check != 100 THEN
        RAISE EXCEPTION 'FAIL: Initial Ledger Balance Mismatch! Got %', v_ledger_check;
    END IF;

    -- 4. Perform Adjustment: Change Rate 100 -> 90. Total should become 90.
    -- Calling the RPC function directly.
    -- We'll just execute it and disregard the JSON return as we're in PL/pgSQL
    PERFORM create_comprehensive_sale_adjustment(
        v_org_id,
        v_sale_item_id,
        1, -- Same Qty
        90, -- New Rate (Was 100)
        'Test Adjustment Logic'
    );
    
    -- 5. Verify Final Ledger State
    SELECT debit, description INTO v_ledger_check, v_desc_check 
    FROM ledger_entries 
    WHERE reference_id = v_sale_id AND transaction_type = 'sale' AND debit > 0;
    
    RAISE NOTICE 'Step 2: Final Ledger Balance (Should be 90): %', v_ledger_check;
    RAISE NOTICE 'Step 3: Description Audit Trail: %', v_desc_check;

    IF v_ledger_check != 90 THEN
        RAISE EXCEPTION 'FAIL: Final Ledger Balance Wrong! Expected 90, Got %', v_ledger_check;
    END IF;
    
    IF v_desc_check NOT LIKE '%Was: 100%' THEN
        RAISE EXCEPTION 'FAIL: Audit Trail Missing in Description!';
    END IF;

    RAISE NOTICE 'SUCCESS: Logic Verified for Future User!';
    
    -- 6. Cleanup
    -- Delete in correct dependency order
    DELETE FROM ledger_entries WHERE reference_id = v_sale_id OR contact_id = v_buyer_id;
    DELETE FROM sale_adjustments WHERE sale_id = v_sale_id;
    DELETE FROM sale_items WHERE sale_id = v_sale_id;
    DELETE FROM sales WHERE id = v_sale_id;
    DELETE FROM contacts WHERE id = v_buyer_id;

END $$;
