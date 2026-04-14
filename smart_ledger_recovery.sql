-- ============================================================
-- SMART RECOVERY: Auto-Fix Payment Amounts Using Ledger
-- ============================================================
-- Strategy: The ledger_entries table is the source of truth
-- If payment_status = 'pending' but ledger has receipts,
-- sync sale.amount_received from the ledger credits
-- This works for CASH and all immediate payment modes

-- ============================================================
-- STEP 1: Diagnostic - Find all CASH sales with pending status + ledger receipts
-- ============================================================
SELECT 
    s.id,
    s.bill_no,
    s.total_amount_inc_tax,
    s.amount_received as current_amount_received,
    s.payment_status,
    s.payment_mode,
    c.name as buyer_name,
    -- Sum all receipt credits from ledger for this sale
    COALESCE(SUM(CASE 
        WHEN le.transaction_type = 'receipt' THEN le.credit 
        ELSE 0 
    END), 0) as ledger_receipt_total,
    -- Count ledger entries
    COUNT(DISTINCT le.id) as ledger_entry_count
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
LEFT JOIN mandi.ledger_entries le ON le.reference_id = s.id 
    AND le.organization_id = s.organization_id
WHERE 
    s.payment_mode = 'cash'
    AND s.payment_status = 'pending'
    AND s.amount_received <= 0
GROUP BY s.id, s.bill_no, s.total_amount_inc_tax, s.amount_received, s.payment_status, s.payment_mode, c.name
HAVING COALESCE(SUM(CASE WHEN le.transaction_type = 'receipt' THEN le.credit ELSE 0 END), 0) > 0
ORDER BY s.bill_no DESC;

-- ============================================================
-- STEP 2: Smart recovery - update sales.amount_received from ledger
-- ============================================================
-- This UPDATE will:
-- 1. Find all CASH sales with pending status
-- 2. Calculate actual amount_received from ledger receipts
-- 3. Update the sale with correct amount
-- 4. Recalculate payment_status (trigger fires automatically)

WITH ledger_payments AS (
    -- Calculate total receipts per sale from ledger
    SELECT 
        le.reference_id as sale_id,
        COALESCE(SUM(CASE WHEN le.transaction_type = 'receipt' THEN le.credit ELSE 0 END), 0) as total_receipt
    FROM mandi.ledger_entries le
    WHERE le.transaction_type = 'receipt'
    GROUP BY le.reference_id
)
UPDATE mandi.sales s
SET 
    amount_received = lp.total_receipt,
    payment_status = CASE 
        WHEN lp.total_receipt <= 0 THEN 'pending'
        WHEN lp.total_receipt >= s.total_amount_inc_tax THEN 'paid'
        ELSE 'partial'
    END,
    updated_at = NOW()
FROM ledger_payments lp
WHERE 
    s.id = lp.sale_id
    AND s.payment_mode = 'cash'
    AND s.payment_status = 'pending'
    AND s.amount_received <= 0
    AND lp.total_receipt > 0;

-- ============================================================
-- STEP 3: Verify recovery - show all affected invoices with new state
-- ============================================================
SELECT 
    s.id,
    s.bill_no,
    s.payment_mode,
    s.total_amount_inc_tax,
    s.amount_received,
    s.payment_status,
    c.name as buyer_name,
    s.sale_date,
    -- Show the ledger receipts that were used in recovery
    (SELECT COALESCE(SUM(credit), 0) 
     FROM mandi.ledger_entries 
     WHERE reference_id = s.id AND transaction_type = 'receipt') as ledger_receipts,
    CASE 
        WHEN s.payment_status = 'pending' THEN '❌ STILL PENDING - Check ledger for this invoice'
        WHEN s.payment_status = 'partial' THEN '⚠️  PARTIAL - ' || s.amount_received || '/' || s.total_amount_inc_tax || ' received'
        WHEN s.payment_status = 'paid' THEN '✅ PAID - Full payment received'
        ELSE '❓ UNKNOWN'
    END as status_explanation
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE 
    s.payment_mode = 'cash'
    AND s.sale_date >= '2026-04-12'
    AND (c.name = 'Kevin' OR s.total_amount_inc_tax IN (2490, 12500))
ORDER BY s.bill_no DESC;

-- ============================================================
-- STEP 4: Summary of changes made
-- ============================================================
-- The above UPDATE will synchronize:
-- - All CASH sales with pending status
-- - Where actual ledger receipts exist but amount_received = 0
-- - This fixes the data loss bug where RPC didn't store amount_received
-- Results expected:
-- - Invoice #4 (₹2,490): If ledger has receipt, amount_received will be updated from 0 to ledger amount
-- - Invoice #5 (₹12,500): If ledger has receipt, amount_received will be updated from 0 to ledger amount
-- - payment_status will auto-recalculate: 'pending' → 'partial' or 'paid'
