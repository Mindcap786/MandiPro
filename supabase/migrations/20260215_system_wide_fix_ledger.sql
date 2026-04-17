-- System-Wide Check and Fix for Ledger Discrepancies
-- This ensures ALL buyers have correct ledger balances matching their invoices,
-- and that adjustment history is correctly reflected in the ledger description.

DO $$
DECLARE
    r RECORD;
    v_new_desc TEXT;
    v_adjustments TEXT;
BEGIN
    -- 1. Identify and Fix Ledger Mismatches (Where Debit != Sale Amount)
    FOR r IN 
        SELECT 
            l.id as ledger_id, 
            l.debit as current_debit, 
            s.total_amount as correct_amount,
            s.bill_no,
            l.description
        FROM ledger_entries l
        JOIN sales s ON l.reference_id = s.id
        WHERE l.transaction_type = 'sale' 
          AND l.debit > 0 
          AND l.debit != s.total_amount
    LOOP
        RAISE NOTICE 'Fixing Mismatch for Invoice #%: Ledger %, Actual %', r.bill_no, r.current_debit, r.correct_amount;
        
        UPDATE ledger_entries
        SET debit = r.correct_amount,
            description = r.description || ' (SysCorrect: Sync with Invoice)'
        WHERE id = r.ledger_id;
    END LOOP;

    -- 2. Backfill Missing Adjustment History in Ledger Descriptions
    -- Find sales with adjustments where the ledger description doesn't mention "Adj"
    FOR r IN
        SELECT 
            l.id as ledger_id,
            l.description,
            s.total_amount,
            s.bill_no,
            (
                SELECT string_agg(
                    CASE 
                        WHEN adjustment_type = 'rate_change' THEN 
                            'Rate: ' || old_value || '->' || new_value 
                        ELSE 
                            'Qty: ' || old_qty || '->' || new_qty 
                    END, 
                    ', '
                )
                FROM sale_adjustments sa 
                WHERE sa.sale_id = s.id
            ) as adjustment_details,
             (
                SELECT SUM(delta_amount)
                FROM sale_adjustments sa 
                WHERE sa.sale_id = s.id
            ) as total_delta
        FROM ledger_entries l
        JOIN sales s ON l.reference_id = s.id
        WHERE l.transaction_type = 'sale' 
          AND l.debit > 0
          AND (SELECT count(*) FROM sale_adjustments WHERE sale_id = s.id) > 0
          AND l.description NOT ILIKE '%Adj:%'
    LOOP
        v_new_desc := r.description || ' (Adj: ' || COALESCE(r.adjustment_details, 'Unknown') || ', Was: ' || (r.total_amount - COALESCE(r.total_delta, 0)) || ')';
        
        RAISE NOTICE 'Updating Description for Invoice #%: %', r.bill_no, v_new_desc;
        
        UPDATE ledger_entries
        SET description = v_new_desc
        WHERE id = r.ledger_id;
    END LOOP;
    
    RAISE NOTICE 'System-wide consistency check complete.';
END $$;
