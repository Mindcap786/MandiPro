-- Final System-Wide Cleanup for Duplicate Balances
-- Targets specific pattern: Ledger entries with NO transaction_type created by rogue Vouchers

DO $$
DECLARE
    r RECORD;
    v_deleted_ledgers INTEGER := 0;
    v_deleted_vouchers INTEGER := 0;
BEGIN
    -- 1. Delete Rogue Ledger Entries (The main cause of double balance)
    -- Pattern: Linked to a Voucher, but has NULL transaction_type.
    -- (Correct entries from 'sales' table have transaction_type = 'sale')
    -- (Correct entries from 'receipts' have transaction_type = 'receipt' usually, or at least a description)
    
    FOR r IN 
        SELECT id 
        FROM ledger_entries 
        WHERE voucher_id IS NOT NULL 
          AND transaction_type IS NULL 
    LOOP
        DELETE FROM ledger_entries WHERE id = r.id;
        v_deleted_ledgers := v_deleted_ledgers + 1;
    END LOOP;

    -- 2. Delete Orphan 'Sales' Vouchers (The source of the rogue entries)
    -- Pattern: Type 'sales', No valid link to 'sales' table invoice_id, matches an existing Bill No.
    FOR r IN 
        SELECT v.id 
        FROM vouchers v
        JOIN sales s ON s.bill_no = v.voucher_no AND s.organization_id = v.organization_id
        WHERE v.type = 'sales' 
          AND v.invoice_id IS NULL
    LOOP
        DELETE FROM vouchers WHERE id = r.id;
        v_deleted_vouchers := v_deleted_vouchers + 1;
    END LOOP;

    RAISE NOTICE 'System-Wide Cleanup Report:';
    RAISE NOTICE 'Deleted Rogue Ledger Entries: %', v_deleted_ledgers;
    RAISE NOTICE 'Deleted Orphan Vouchers: %', v_deleted_vouchers;
    
END $$;
