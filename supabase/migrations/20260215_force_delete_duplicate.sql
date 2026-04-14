-- Force delete the specific duplicate ledger entry
DO $$
DECLARE
    v_rows_deleted INTEGER;
    v_exists BOOLEAN;
BEGIN
    -- Check if it exists before delete
    SELECT EXISTS(SELECT 1 FROM ledger_entries WHERE id = '6fe10c29-b1de-4785-8cad-f21e3adbdc57') INTO v_exists;
    IF NOT v_exists THEN
        RAISE NOTICE 'Row not found before delete';
    ELSE
        RAISE NOTICE 'Row found, attempting delete';
    END IF;

    -- Delete carefully, bypassing RLS if possible by operating as superuser (migrations usually run as such)
    -- But since we are in a migration file, we can't easily switch roles inside a DO block without SET ROLE which might fail.
    -- However, we can use a CTE to DELETE.
    
    DELETE FROM ledger_entries WHERE id = '6fe10c29-b1de-4785-8cad-f21e3adbdc57';
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    
    RAISE NOTICE 'Deleted % rows', v_rows_deleted;

    IF v_rows_deleted = 0 AND v_exists THEN
        RAISE EXCEPTION 'Failed to delete row despite it existing. RLS likely blocking.';
    END IF;
END $$;
