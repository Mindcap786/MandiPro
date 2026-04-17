-- Clean up orphaned sales vouchers
-- These are vouchers created by the old automatic process that have no invoice link and no ledger entries.

DO $$
DECLARE
    v_rows_deleted INTEGER;
BEGIN
    DELETE FROM vouchers 
    WHERE type = 'sales' 
      AND invoice_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE voucher_id = vouchers.id);

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % orphaned sales vouchers', v_rows_deleted;
END $$;
