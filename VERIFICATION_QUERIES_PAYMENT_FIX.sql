-- ============================================================
-- VERIFICATION QUERIES FOR PAYMENT SYSTEM FIXES
-- Run these after applying migrations to verify everything works
-- ============================================================

-- ==================== TEST 1: Cash Payment ====================
-- Test that cash payments create invoice with status = 'paid'

-- Check the latest cash sale
SELECT 
    id,
    bill_no,
    contact_bill_no,
    payment_mode,
    payment_status,
    total_amount_inc_tax,
    created_at
FROM mandi.sales
WHERE payment_mode = 'cash'
ORDER BY created_at DESC
LIMIT 5;

-- Expected Result: payment_status should be 'paid' for cash payments


-- ==================== TEST 2: UPI Payment ====================
-- Test that UPI payments work correctly

SELECT 
    id,
    bill_no,
    payment_mode,
    payment_status,
    total_amount_inc_tax,
    created_at
FROM mandi.sales
WHERE payment_mode IN ('upi', 'UPI/BANK', 'bank_transfer')
ORDER BY created_at DESC
LIMIT 5;

-- Expected Result: payment_status should be 'paid'


-- ==================== TEST 3: Ledger Entries Are Consistent ====================
-- Verify transaction_type values are consistent

SELECT DISTINCT transaction_type
FROM mandi.ledger_entries
WHERE created_at > now() - interval '24 hours'
ORDER BY transaction_type;

-- Expected Result Should include one or more of:
-- - 'sale_payment'
-- - 'sales_revenue'
-- - 'cash_receipt'
-- - 'cash_deposit'
-- Should NOT have both 'sale' and 'sales' mixed


-- ==================== TEST 4: Ledger Status Field is Set ====================
-- Verify all ledger entries have status field set

SELECT 
    COUNT(*) as total_entries,
    COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status_count,
    COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted_count
FROM mandi.ledger_entries
WHERE created_at > now() - interval '24 hours';

-- Expected Result: null_status_count should be 0, posted_count should equal total


-- ==================== TEST 5: No Duplicate Ledger Entries ====================
-- Check if there are duplicate entries per voucher

SELECT 
    voucher_id,
    contact_id,
    COUNT(*) as entry_count,
    ARRAY_AGG(id) as entry_ids
FROM mandi.ledger_entries
WHERE contact_id IS NOT NULL
  AND created_at > now() - interval '24 hours'
GROUP BY voucher_id, contact_id
HAVING COUNT(*) > 1;

-- Expected Result: Should return empty (no duplicate combination of voucher + contact)


-- ==================== TEST 6: Payment Vouchers Were Created ====================
-- Verify receipt vouchers exist for instant payments

SELECT 
    s.bill_no,
    s.payment_mode,
    s.payment_status,
    COUNT(v.id) as voucher_count,
    STRING_AGG(v.type, ', ') as voucher_types
FROM mandi.sales s
LEFT JOIN mandi.vouchers v ON v.invoice_id = s.id
WHERE s.payment_mode IN ('cash', 'upi', 'UPI/BANK', 'bank_transfer')
  AND s.created_at > now() - interval '24 hours'
GROUP BY s.bill_no, s.payment_mode, s.payment_status
ORDER BY s.created_at DESC;

-- Expected Result: 
--  - Should have 2 vouchers per sale (one 'sales', one 'receipt')
--  - payment_status should be 'paid'


-- ==================== TEST 7: Credit Sales Have No Receipt Voucher ====================
-- Verify credit sales only have sales voucher, no receipt yet

SELECT 
    s.bill_no,
    s.payment_mode,
    s.payment_status,
    COUNT(v.id) as voucher_count,
    STRING_AGG(v.type, ', ') as voucher_types
FROM mandi.sales s
LEFT JOIN mandi.vouchers v ON v.invoice_id = s.id
WHERE s.payment_mode = 'credit'
  AND s.created_at > now() - interval '24 hours'
GROUP BY s.bill_no, s.payment_mode, s.payment_status
ORDER BY s.created_at DESC;

-- Expected Result:
--  - Should have 1 voucher per sale (only 'sales', no 'receipt')
--  - payment_status should be 'pending'


-- ==================== TEST 8: Partial Payment Logic ====================
-- Find any partial payments (if they were explicitly created)

SELECT 
    id,
    bill_no,
    payment_mode,
    payment_status,
    total_amount_inc_tax,
    created_at
FROM mandi.sales
WHERE payment_status = 'partial'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- Expected Result: 
--  - If any exist, payment_mode should be cash/upi/bank_transfer
--  - payment_status should be 'partial'


-- ==================== TEST 9: Day Book Entry Count ====================
-- Verify day book entries are properly created

SELECT 
    TO_CHAR(entry_date, 'YYYY-MM-DD') as date,
    transaction_type,
    COUNT(*) as entry_count,
    ROUND(SUM(debit), 2) as total_debit,
    ROUND(SUM(credit), 2) as total_credit
FROM mandi.ledger_entries
WHERE entry_date = CURRENT_DATE
GROUP BY entry_date, transaction_type
ORDER BY transaction_type;

-- Expected Result: 
--  - Total debit should equal total credit (balanced)
--  - Should see entries for all transaction types


-- ==================== TEST 10: Recent Sales Summary ====================
-- Get summary of recent sales

SELECT 
    payment_mode,
    payment_status,
    COUNT(*) as sale_count,
    ROUND(SUM(total_amount_inc_tax), 2) as total_amount,
    MIN(created_at) as earliest,
    MAX(created_at) as latest
FROM mandi.sales
WHERE created_at > now() - interval '24 hours'
GROUP BY payment_mode, payment_status
ORDER BY payment_mode, payment_status;

-- Expected Result Summary:
-- payment_mode | status   | sale_count
-- ============+===========+==========
-- cash        | paid      | X
-- upi         | paid      | Y  
-- UPI/BANK    | paid      | Z
-- credit      | pending   | A
-- cheque      | paid      | B (if cleared instantly)
-- cheque      | pending   | C (if future date)


-- ============================================================
-- If any test fails, check:
-- 1. Were both migrations applied successfully?
-- 2. Are there RPC errors in logs?
-- 3. Is the new RPC code being used?
-- 
-- To see current RPC definition:
-- ============================================================

SELECT pg_get_functiondef(
    (SELECT oid FROM pg_proc 
     WHERE proname = 'confirm_sale_transaction' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'mandi'))
) LIMIT 50;
