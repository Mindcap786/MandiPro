-- Fix Double-Posting Bug in Sales Ledger
-- Issue: Sales are being posted twice - once by manage_sales_ledger_entry() trigger
-- and once by the voucher system, causing balances to be doubled.

-- Step 1: Drop the duplicate trigger that's causing double posting
-- The trg_update_buyer_ledger is a legacy trigger that updates contacts.account_balance
-- This is redundant since we now use ledger_entries and view_party_balances
DROP TRIGGER IF EXISTS trg_update_buyer_ledger ON sales;

-- Step 2: Clean up the duplicate ledger entries for existing sales
-- Delete ledger entries created by vouchers that duplicate sale trigger entries
DELETE FROM ledger_entries
WHERE id IN (
    SELECT le.id
    FROM ledger_entries le
    INNER JOIN vouchers v ON le.voucher_id = v.id
    WHERE v.type = 'sales'
    AND v.invoice_id IS NOT NULL
    AND EXISTS (
        -- Check if there's already a ledger entry from the sale trigger
        SELECT 1 
        FROM ledger_entries le2
        WHERE le2.reference_id = v.invoice_id
        AND le2.transaction_type = 'sale'
        AND le2.voucher_id IS NULL
        AND le2.contact_id = le.contact_id
    )
);

-- Step 3: Reset contacts.account_balance to 0 since it's no longer used
-- The view_party_balances calculates the correct balance from ledger_entries
UPDATE contacts
SET account_balance = 0
WHERE account_balance != 0;

-- Step 4: Add a comment to document the fix
COMMENT ON TRIGGER trg_sync_sales_ledger ON sales IS 
'Primary trigger for sales ledger entries. Creates double-entry bookkeeping records in ledger_entries table. DO NOT create duplicate triggers.';
