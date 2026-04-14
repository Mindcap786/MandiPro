-- Force delete duplicate ledger entry - Take 2
-- Now that check_lock_date logic is fixed, this should work.

DO $$
DECLARE
    v_rows_deleted INTEGER;
BEGIN
    -- Delete the specific duplicate entry
    DELETE FROM ledger_entries 
    WHERE id = '6fe10c29-b1de-4785-8cad-f21e3adbdc57';
    
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    
    RAISE NOTICE 'Deleted % rows', v_rows_deleted;

    IF v_rows_deleted = 0 THEN
        RAISE EXCEPTION 'Failed to delete row. RLS or Trigger still blocking.';
    END IF;
END $$;
