-- Manual cleanup of remaining duplicate entries
-- This uses a function with SECURITY DEFINER to bypass RLS

CREATE OR REPLACE FUNCTION cleanup_duplicate_ledger_entries()
RETURNS TABLE(deleted_count INTEGER) 
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
BEGIN
    -- Delete duplicate ledger entries where:
    -- 1. Entry has a voucher_id (created by voucher system)
    -- 2. There's another entry with same contact, same debit amount, transaction_type='sale', no voucher_id
    -- 3. Both entries are for the same reference (sale)
    
    WITH duplicates_to_delete AS (
        SELECT le1.id
        FROM ledger_entries le1
        INNER JOIN vouchers v ON le1.voucher_id = v.id
        WHERE v.type = 'sales'
        AND EXISTS (
            SELECT 1 
            FROM ledger_entries le2
            WHERE le2.contact_id = le1.contact_id
            AND le2.transaction_type = 'sale'
            AND le2.voucher_id IS NULL
            AND le2.debit = le1.debit
            AND le2.debit > 0
        )
    )
    DELETE FROM ledger_entries
    WHERE id IN (SELECT id FROM duplicates_to_delete);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_deleted_count;
END;
$$;

-- Execute the cleanup
SELECT * FROM cleanup_duplicate_ledger_entries();

-- Drop the function after use
DROP FUNCTION cleanup_duplicate_ledger_entries();
