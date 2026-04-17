-- Fix organization-level ledger_entries descriptions
-- Issue: Database has inconsistent descriptions, dashboard can't properly categorize cash vs udhaar sales
-- Solution: Update all sales-related credit entries to use consistent "Payment Received Against Sale #X" format

BEGIN;

-- Fix Pattern 1: Sales Revenue entries to Payment Received Against Sale
UPDATE mandi.ledger_entries 
SET description = 'Payment Received Against Sale #' || COALESCE(reference_no, header_voucher_no::TEXT, '-')
WHERE description LIKE 'Sales Revenue - Inv #%'
  AND credit > 0
  AND debit = 0;

-- Pattern 2: Fix any remaining inconsistent Sale entries that are credits (payments)
UPDATE mandi.ledger_entries 
SET description = 'Payment Received Against Sale #' || COALESCE(reference_no, header_voucher_no::TEXT, '-')
WHERE (description LIKE 'Receipt Received%' OR description LIKE 'Payment Mode%')
  AND credit > 0 
  AND debit = 0
  AND (reference_no LIKE '%invoice%' OR reference_no LIKE '%inv%' OR header_narration LIKE '%invoice%');

-- Pattern 3: Fix Purchase entries for consistency
UPDATE mandi.ledger_entries
SET description = 'Purchase Bill #' || COALESCE(reference_no, header_voucher_no::TEXT, '-')
WHERE description LIKE 'Stock In - Commission%'
  AND credit > 0
  AND debit = 0;

UPDATE mandi.ledger_entries
SET description = 'Payment Made for Purchase #' || COALESCE(reference_no, header_voucher_no::TEXT, '-')
WHERE description LIKE 'Advance Paid%'
  AND debit > 0
  AND credit = 0;

-- Verify changes
SELECT description, COUNT(*) as cnt
FROM mandi.ledger_entries
WHERE entry_date > CURRENT_DATE - 30
GROUP BY description
ORDER BY cnt DESC
LIMIT 20;

COMMIT;
