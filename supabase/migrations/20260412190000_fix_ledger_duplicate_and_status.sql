-- ============================================================
-- ADD DUPLICATE PREVENTION & ENSURE LEDGER STATUS CONSISTENCY
-- Migration: 20260412190000_fix_ledger_duplicate_and_status.sql
--
-- FIXES APPLIED:
-- 1. Clean up duplicate ledger entries (same voucher+contact/account pairs)
-- 2. Add status column with default 'posted'  
-- 3. Create unique indexes to prevent future duplicates
-- ============================================================

-- STEP 1: Delete duplicate ledger entries
-- Keep only the newest entry for each (voucher_id, contact_id) combination
DELETE FROM mandi.ledger_entries
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (PARTITION BY voucher_id, contact_id ORDER BY created_at DESC) as rn
        FROM mandi.ledger_entries
        WHERE contact_id IS NOT NULL AND voucher_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- STEP 2: Delete duplicate entries for (voucher_id, account_id) as well
DELETE FROM mandi.ledger_entries
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (PARTITION BY voucher_id, account_id ORDER BY created_at DESC) as rn
        FROM mandi.ledger_entries
        WHERE account_id IS NOT NULL AND voucher_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- STEP 3: Add status column for ledger entry tracking
ALTER TABLE mandi.ledger_entries
ADD COLUMN IF NOT EXISTS status TEXT;

-- STEP 4: Drop any existing constraint/indexes that might conflict
ALTER TABLE mandi.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_status_check;
DROP INDEX IF EXISTS idx_ledger_entries_voucher_contact_unique;
DROP INDEX IF EXISTS idx_ledger_entries_voucher_account_unique;

-- STEP 5: Set status default for future inserts
ALTER TABLE mandi.ledger_entries
ALTER COLUMN status SET DEFAULT 'posted';

-- STEP 6: Create unique indexes to prevent duplicate ledger entries
-- These ensure only ONE entry per voucher+contact and per voucher+account
CREATE UNIQUE INDEX idx_ledger_entries_voucher_contact_unique
ON mandi.ledger_entries(voucher_id, contact_id)
WHERE contact_id IS NOT NULL AND voucher_id IS NOT NULL;

CREATE UNIQUE INDEX idx_ledger_entries_voucher_account_unique
ON mandi.ledger_entries(voucher_id, account_id)
WHERE account_id IS NOT NULL AND voucher_id IS NOT NULL;

-- ============================================================
-- RESULT: 
-- - All duplicate ledger entries removed
-- - Status column added with 'posted' default
-- - Unique indexes prevent future duplicates  
-- - Day book will now display entries correctly without duplication
-- ============================================================
