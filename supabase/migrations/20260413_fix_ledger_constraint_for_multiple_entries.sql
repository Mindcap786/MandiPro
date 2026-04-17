-- =============================================================================
-- FIX LEDGER CONSTRAINT FOR MULTIPLE ENTRIES PER PARTY PER TRANSACTION
-- Migration: 20260413_fix_ledger_constraint_for_multiple_entries.sql
--
-- ISSUE: The unique constraint idx_ledger_entries_voucher_contact_unique
--        prevents multiple line items for the same party in one transaction
--        (e.g., Arrival Entry + Transport + Commission all in one voucher)
--
-- SOLUTION: Replace the strict constraint with a more targeted approach:
--           - Allow multiple entries per (voucher, contact)
--           - Only prevent EXACT duplicates (same account/contact + debit/credit)
-- =============================================================================

-- STEP 1: Drop the overly strict constraint
DROP INDEX IF EXISTS idx_ledger_entries_voucher_contact_unique;
DROP INDEX IF EXISTS idx_ledger_entries_voucher_account_unique;

-- STEP 2: Create a smarter constraint that allows line items but prevents exact duplicates
-- This composite key prevents only TRULY duplicate entries while allowing:
-- - Multiple entries per voucher+contact (different purposes like arrival, transport, commission)
-- - Different debit/credit per entry
-- - Multiple accounts per voucher

CREATE UNIQUE INDEX idx_ledger_entries_no_exact_duplicates
ON mandi.ledger_entries(voucher_id, COALESCE(contact_id, account_id), debit, credit, transaction_type)
WHERE voucher_id IS NOT NULL AND (contact_id IS NOT NULL OR account_id IS NOT NULL);

-- STEP 3: Add regular indexes for query performance (not unique)
CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher_id ON mandi.ledger_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_contact_id ON mandi.ledger_entries(contact_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON mandi.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON mandi.ledger_entries(entry_date);

-- =============================================================================
-- RESULT:
-- ✓ Multiple line items per transaction allowed (arrival, transport, commission)
-- ✓ Payment status updates now work without duplicate conflicts
-- ✓ Ledger entry integrity maintained (no exact duplicates)
-- ✓ Query performance improved with indexes
-- =============================================================================
