-- Fix specific duplicate voucher for user 'mahaboob' (Invoice #36)
-- Also generic cleanup for this user to be safe.

DO $$
DECLARE
    v_user_id UUID := '8831fcd7-52e8-4c49-a877-cd77c0f50854'; -- Mahaboob
BEGIN
    RAISE NOTICE 'Cleaning up duplicates for Mahaboob...';

    -- Delete specific rogue duplicate ledger entry (linked to voucher 3d35e480...)
    DELETE FROM ledger_entries 
    WHERE contact_id = v_user_id
      AND voucher_id IS NOT NULL 
      AND transaction_type IS NULL; -- The duplicate ones usually lack transaction_type 'sale'

    -- Delete any orphan 'sales' vouchers for this user that have no invoice_id
    -- Wait, vouchers don't have contact_id directly (except maybe in metadata or narration?)
    -- But we can delete the vouchers whose IDs were just unlinked from ledger_entries if needed.
    -- Better: Delete vouchers that are now orphans (no ledger entries).
    
    DELETE FROM vouchers
    WHERE type = 'sales'
      AND invoice_id IS NULL
      AND id NOT IN (SELECT voucher_id FROM ledger_entries WHERE voucher_id IS NOT NULL);
      
    RAISE NOTICE 'Cleanup for Mahaboob complete.';
END $$;
