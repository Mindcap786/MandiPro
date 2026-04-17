-- Fix mismatch between Sale Amount and Ledger Entry for specific sale
-- Issue: Ledger was out of sync before adjustment, leading to wrong balance.
-- Sale Amount is 19000 (Correct). Ledger is 18000 (Incorrect).

DO $$
DECLARE
    v_sale_id UUID := '54f896a3-0b87-4213-a754-85698894c16c';
    v_correct_amount NUMERIC;
    v_ledger_id UUID;
    v_current_debit NUMERIC;
BEGIN
    -- 1. Get correct amount from sales table
    SELECT total_amount INTO v_correct_amount
    FROM sales 
    WHERE id = v_sale_id;
    
    RAISE NOTICE 'Correct Amount: %', v_correct_amount;

    -- 2. Find the Ledger Entry
    SELECT id, debit INTO v_ledger_id, v_current_debit
    FROM ledger_entries
    WHERE reference_id = v_sale_id 
      AND transaction_type = 'sale'
      AND debit > 0;
      
    RAISE NOTICE 'Current Ledger Debit: %', v_current_debit;
    
    -- 3. Update Ledger Entry if mismatch
    IF v_ledger_id IS NOT NULL AND v_current_debit != v_correct_amount THEN
        UPDATE ledger_entries
        SET debit = v_correct_amount,
            description = description || ' (Correction: Sync with Invoice)'
        WHERE id = v_ledger_id;
        
        RAISE NOTICE 'Updated Ledger Entry to %', v_correct_amount;
    ELSE
        RAISE NOTICE 'No update needed or Ledger Entry not found';
    END IF;
    
    -- 4. Also check Credit entry (Revenue)
    UPDATE ledger_entries
    SET credit = v_correct_amount
    WHERE reference_id = v_sale_id 
      AND transaction_type = 'sale'
      AND credit > 0
      AND credit != v_correct_amount;
      
END $$;
