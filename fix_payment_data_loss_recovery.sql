-- ============================================================
-- CRITICAL FIX: Recover Payment Data Loss from Amount_Received Bug
-- ============================================================
-- Background: Production RPC was missing amount_received column from INSERT
-- Result: Payment amounts submitted to RPC were NOT stored in database
-- Status: amount_received = 0, payment_status = pending (even for partial/paid)
-- Solution: Restore correct amount_received values and trigger status recalculation

-- AFFECTED INVOICES (for Kevin):
-- Invoice #5 (₹12,500): Should have ₹10,000 received → will become 'partial'
-- Invoice #4 (₹2,490): Amount TBD → will update once confirmed

-- ============================================================
-- STEP 1: View current state of affected invoices
-- ============================================================
SELECT 
    s.id,
    s.bill_no,
    s.total_amount_inc_tax,
    s.amount_received,
    s.payment_status,
    s.sale_date,
    c.name as buyer_name,
    (SELECT COUNT(*) FROM mandi.ledger_entries WHERE reference_id = s.id) as ledger_count
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE 
    s.total_amount_inc_tax IN (12500, 2490)
    AND s.buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
ORDER BY s.total_amount_inc_tax DESC;

-- ============================================================
-- STEP 2: Update amount_received for invoice #5 (₹12,500 → ₹10,000 received)
-- ============================================================
-- THIS WILL AUTOMATICALLY TRIGGER payment_status RECALCULATION TO 'partial'
UPDATE mandi.sales
SET 
    amount_received = 10000,
    payment_status = CASE 
        WHEN 10000 <= 0 THEN 'pending'
        WHEN 10000 >= 12500 THEN 'paid'
        ELSE 'partial'
    END
WHERE 
    total_amount_inc_tax = 12500
    AND buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin');

-- ============================================================
-- STEP 3: Create ledger entry for invoice #5's ₹10,000 receipt
-- ============================================================
-- This ensures accounting records match the payment
-- The trigger sale_payment_status_auto_update will also run and verify status
INSERT INTO mandi.ledger_entries (
    organization_id,
    contact_id,
    transaction_type,
    debit,
    credit,
    description,
    entry_date,
    reference_id,
    reference_no
)
SELECT 
    s.organization_id,
    s.buyer_id,
    'receipt',
    0,
    10000,
    'Payment Received - Sale #' || s.bill_no,
    s.sale_date,
    s.id,
    s.bill_no::TEXT
FROM mandi.sales s
WHERE 
    s.total_amount_inc_tax = 12500
    AND s.buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
ON CONFLICT DO NOTHING;  -- Don't create duplicate if already exists

-- ============================================================
-- STEP 4: MANUAL STEP - Update invoice #4 (₹2,490) once amount confirmed
-- ============================================================
-- Replace UNKNOWN_AMOUNT with the actual amount received
-- Example: If ₹2,490 was fully paid, use:
--   UPDATE mandi.sales
--   SET amount_received = 2490, payment_status = 'paid'
--   WHERE total_amount_inc_tax = 2490 AND buyer_id = ...;

-- ============================================================
-- STEP 5: Verify recovery - check both invoices
-- ============================================================
SELECT 
    s.id,
    s.bill_no,
    s.total_amount_inc_tax,
    s.amount_received,
    s.payment_status,
    'AFTER_FIX' as state,
    (SELECT COUNT(*) FROM mandi.ledger_entries WHERE reference_id = s.id AND transaction_type = 'receipt') as receipt_ledger_count
FROM mandi.sales s
WHERE 
    s.total_amount_inc_tax IN (12500, 2490)
    AND s.buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
ORDER BY s.total_amount_inc_tax DESC;

-- Expected Results:
-- === INVOICE #5 (₹12,500) ===
-- amount_received: 10000 ✅
-- payment_status: 'partial' ✅
-- receipt_ledger_count: >= 1 ✅

-- === INVOICE #4 (₹2,490) ===
-- amount_received: [ACTUAL_AMOUNT_YOU_CONFIRM]
-- payment_status: 'pending' (if 0), 'partial' (if < 2490), or 'paid' (if >= 2490)
-- receipt_ledger_count: depends on amount
