-- Fix Double-Posting Bug - Part 2: Clean up existing duplicates
-- This migration removes duplicate ledger entries caused by automatic voucher creation

-- Step 1: Identify and delete duplicate ledger entries
-- These are entries created by vouchers for sales that already have entries from the sale trigger
WITH duplicate_entries AS (
    SELECT DISTINCT le1.id
    FROM ledger_entries le1
    INNER JOIN vouchers v ON le1.voucher_id = v.id
    INNER JOIN ledger_entries le2 ON (
        le2.contact_id = le1.contact_id
        AND le2.transaction_type = 'sale'
        AND le2.voucher_id IS NULL
        AND le2.debit = le1.debit
        AND DATE(le2.entry_date) = v.date
    )
    WHERE v.type = 'sales'
)
DELETE FROM ledger_entries
WHERE id IN (SELECT id FROM duplicate_entries);

-- Step 2: Delete orphaned sales vouchers (vouchers with no invoice_id and no ledger entries)
DELETE FROM vouchers
WHERE type = 'sales'
AND invoice_id IS NULL
AND NOT EXISTS (
    SELECT 1 FROM ledger_entries WHERE voucher_id = vouchers.id
);

-- Step 3: Verify the fix by checking for any remaining duplicates
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT contact_id, DATE(entry_date), SUM(debit) as total_debit
        FROM ledger_entries
        WHERE transaction_type = 'sale' OR voucher_id IN (SELECT id FROM vouchers WHERE type = 'sales')
        GROUP BY contact_id, DATE(entry_date)
        HAVING COUNT(*) > 2  -- More than 2 entries (debit + credit) indicates duplicates
    ) duplicates;
    
    IF duplicate_count > 0 THEN
        RAISE WARNING 'Found % potential duplicate entries after cleanup', duplicate_count;
    ELSE
        RAISE NOTICE 'All duplicate entries successfully cleaned up';
    END IF;
END $$;
