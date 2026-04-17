-- ============================================================
-- DEEP CLEAN & REBUILD PURCHASE LEDGERS (V32)
-- Migration: 20260421100100_rebuild_purchase_ledgers.sql
-- ============================================================

DO $$
DECLARE
    r RECORD;
    v_count INT := 0;
BEGIN
    RAISE NOTICE 'Starting deep clean and rebuild of purchase ledger entries...';

    -- 1. IDENTIFY ALL RELEVANT ARRIVALS
    -- We process any arrival that has lots and a contact linked.
    FOR r IN 
        SELECT DISTINCT a.id, a.bill_no, a.reference_no, c.name as party_name
        FROM mandi.arrivals a
        JOIN mandi.lots l ON l.arrival_id = a.id
        LEFT JOIN mandi.contacts c ON a.party_id = c.id
        WHERE a.organization_id IS NOT NULL
    LOOP
        -- 2. RE-POST USING THE ENHANCED RPC
        -- This function automatically deletes old entries for this arrival 
        -- and inserts the new consolidated 'Net Payable' row.
        PERFORM mandi.post_arrival_ledger(r.id);
        
        v_count := v_count + 1;
        
        IF v_count % 5 = 0 THEN
            RAISE NOTICE 'Synchronized % arrivals (Current: %)...', v_count, r.party_name;
        END IF;
    END LOOP;

    RAISE NOTICE 'Rebuild complete! Total arrivals synchronized: %', v_count;
    RAISE NOTICE 'Please refresh your Finance Dashboard to see the corrected Net balances.';
END $$;
