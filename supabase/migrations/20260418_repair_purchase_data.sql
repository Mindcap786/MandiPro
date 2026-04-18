-- REPAIR SCRIPT: Sync payment_status for all Purchase Bills
-- This script re-runs the dynamic payment status calculation for all existing bills
-- to ensure legacy 'unpaid' records are corrected based on actual advances/payments.

DO $$ 
DECLARE 
    r RECORD;
    v_status mandi.payment_status_type;
BEGIN
    FOR r IN SELECT id FROM mandi.purchase_bills LOOP
        -- Calculate fresh status using the unified logic function
        v_status := mandi.get_payment_status(r.id);
        
        -- Update the bill with the correct status
        UPDATE mandi.purchase_bills 
        SET payment_status = v_status
        WHERE id = r.id;
    END LOOP;
END $$;
