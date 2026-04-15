-- Reconcile Sales Status for Buyers with 0 or Negative Balance
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT contact_id 
        FROM view_party_balances 
        WHERE net_balance <= 0 -- Fully paid or overpaid (advance)
    LOOP
        -- Update all pending sales for this buyer to 'paid'
        UPDATE sales
        SET payment_status = 'paid'
        WHERE buyer_id = r.contact_id 
        AND payment_status = 'pending';
        
        -- Also update transactions table if exists and synced
        UPDATE transactions
        SET payment_status = 'paid'
        WHERE party_id = r.contact_id
        AND payment_status = 'pending';
    END LOOP;
END $$;
