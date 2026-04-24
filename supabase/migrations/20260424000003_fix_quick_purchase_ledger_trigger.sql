-- Fix Quick Purchase Zero-Value Ledger Bug
-- Goal: Ensure that when lots are added to an arrival, the parent arrival ledger is re-calculated.

BEGIN;

-- 1. Create a trigger function to "touch" the parent arrival
CREATE OR REPLACE FUNCTION mandi.sync_lot_to_arrival_ledger()
RETURNS TRIGGER AS $$
BEGIN
    -- We update the parent arrival with a dummy change to trigger its 'AFTER UPDATE' trigger
    -- which is mandi.sync_arrival_to_ledger().
    -- Using COALESCE on notes to ensure we don't nullify existing data.
    UPDATE mandi.arrivals 
    SET notes = COALESCE(notes, '') 
    WHERE id = COALESCE(NEW.arrival_id, OLD.arrival_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to mandi.lots
DROP TRIGGER IF EXISTS trg_sync_lot_to_arrival_ledger ON mandi.lots;
CREATE TRIGGER trg_sync_lot_to_arrival_ledger
AFTER INSERT OR UPDATE OR DELETE ON mandi.lots
FOR EACH ROW
EXECUTE FUNCTION mandi.sync_lot_to_arrival_ledger();

-- 3. Cleanup: Re-sync any remaining zero-value purchase entries
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT DISTINCT reference_id 
        FROM mandi.ledger_entries 
        WHERE (debit = '0' OR debit IS NULL) 
          AND (credit = '0' OR credit IS NULL) 
          AND transaction_type = 'purchase'
    LOOP
        UPDATE mandi.arrivals SET notes = COALESCE(notes, '') WHERE id = r.reference_id;
    END LOOP;
END $$;

COMMIT;
