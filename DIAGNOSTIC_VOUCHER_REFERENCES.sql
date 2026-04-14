-- DIAGNOSTIC: Find orphaned voucher references
-- This identifies what's broken and why sales is failing

-- 1. Check if voucher being referenced in sales exists
SELECT 'SALES TRANSACTIONS WITH MISSING VOUCHERS' as diagnostic;
SELECT COUNT(*) as orphaned_count
FROM mandi.sales s
WHERE s.voucher_id IS NOT NULL
  AND s.voucher_id NOT IN (SELECT id FROM mandi.vouchers);

-- 2. Show specific orphaned references
SELECT s.id as sale_id, s.voucher_id, s.reference_no, s.qty, s.amount
FROM mandi.sales s
WHERE s.voucher_id IS NOT NULL
  AND s.voucher_id NOT IN (SELECT id FROM mandi.vouchers)
LIMIT 20;

-- 3. Check payment vouchers that should NOT have been deleted
SELECT COUNT(*) as payment_vouchers_count
FROM mandi.vouchers v
WHERE v.type = 'payment' AND v.arrival_id IS NOT NULL;

-- 4. Check if any sales references payment vouchers (would be incorrect relationship)
SELECT s.id, s.voucher_id, v.type, v.arrival_id, v.cheque_status
FROM mandi.sales s
JOIN mandi.vouchers v ON s.voucher_id = v.id
WHERE v.type = 'payment'
LIMIT 10;

-- 5. Show recent vouchers by type to understand structure
SELECT type, COUNT(*) as count, MAX(created_at) as latest
FROM mandi.vouchers
GROUP BY type
ORDER BY latest DESC;
