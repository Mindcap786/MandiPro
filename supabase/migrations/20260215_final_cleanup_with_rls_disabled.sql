-- Final cleanup: Disable RLS temporarily to delete duplicates
-- This is a one-time fix for the double-posting bug

-- Temporarily disable RLS on ledger_entries
ALTER TABLE ledger_entries DISABLE ROW LEVEL SECURITY;

-- Delete all duplicate ledger entries
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

-- Re-enable RLS
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Verify the cleanup
SELECT 
    'Cleanup complete. Remaining sales vouchers:' as status,
    COUNT(*) as count
FROM vouchers
WHERE type = 'sales';
