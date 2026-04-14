-- Cleanup script to remove duplicate ledger entries and payment vouchers
-- Created by: Claude Code
-- Purpose: Remove duplicate payment transactions created by old post_arrival_ledger logic
-- This should be run AFTER applying 20260406100000_fix_cheque_duplication.sql

-- 1. Identify and DELETE duplicate payment vouchers for arrivals
-- (Keep only the FIRST/OLDEST payment voucher per arrival)
WITH duplicate_payment_vouchers AS (
    SELECT id, arrival_id, created_at,
           ROW_NUMBER() OVER (PARTITION BY arrival_id ORDER BY created_at ASC) as rn
    FROM mandi.vouchers
    WHERE arrival_id IS NOT NULL
      AND type IN ('payment', 'cheque')
      AND narration LIKE 'Payment for Arrival%'
)
DELETE FROM mandi.vouchers
WHERE id IN (
    SELECT id FROM duplicate_payment_vouchers WHERE rn > 1
);

-- 2. DELETE orphaned ledger entries from deleted vouchers
-- (Any ledger entry whose voucher_id no longer exists)
DELETE FROM mandi.ledger_entries
WHERE voucher_id NOT IN (SELECT id FROM mandi.vouchers);

-- 3. For all arrival-linked payment vouchers with duplicate ledger entries,
--    clean them up and let post_arrival_ledger regenerate them
WITH vouchers_to_clean AS (
    SELECT DISTINCT v.id, v.arrival_id
    FROM mandi.vouchers v
    WHERE v.arrival_id IS NOT NULL
      AND v.type IN ('payment', 'cheque')
)
DELETE FROM mandi.ledger_entries le
WHERE le.voucher_id IN (SELECT id FROM vouchers_to_clean)
  AND le.transaction_type = 'purchase';

-- 4. Force regeneration of all arrival ledgers by calling post_arrival_ledger for each
-- NOTE: This is a manual step. Run this query to get the arrival IDs to reprocess:
-- SELECT DISTINCT arrival_id FROM mandi.vouchers WHERE arrival_id IS NOT NULL AND type IN ('payment', 'cheque');
-- Then for each arrival_id, call: SELECT mandi.post_arrival_ledger(arrival_id::uuid);

-- 5. Verify the cleanup
-- Check for any remaining duplicates:
SELECT
    a.id as arrival_id,
    a.bill_no,
    c.name as party_name,
    COUNT(DISTINCT v.id) as payment_voucher_count,
    COUNT(le.id) as ledger_entry_count
FROM mandi.arrivals a
LEFT JOIN mandi.contacts c ON a.party_id = c.id
LEFT JOIN mandi.vouchers v ON a.id = v.arrival_id AND v.type IN ('payment', 'cheque')
LEFT JOIN mandi.ledger_entries le ON v.id = le.voucher_id
WHERE a.organization_id = (SELECT organization_id FROM mandi.arrivals LIMIT 1)
GROUP BY a.id, a.bill_no, c.name
HAVING COUNT(DISTINCT v.id) > 1 OR COUNT(le.id) > 2
ORDER BY a.created_at DESC;

-- Summary of changes:
-- - Removed duplicate payment vouchers (keeping the first one per arrival)
-- - Cleaned up orphaned ledger entries
-- - Prepared arrivals for re-ledgering via post_arrival_ledger

COMMENT ON FUNCTION mandi.post_arrival_ledger IS
'Updated: Now uses UPSERT pattern to reuse existing payment vouchers.
For instantly cleared payments (cash, UPI/BANK, instant cheque): Single voucher with all entries.
For pending cheques: Purchase voucher created, payment voucher marked "Pending" - entries added when cleared via clear_cheque.';
