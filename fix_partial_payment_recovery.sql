-- ===================================================================================
-- RECOVERY SCRIPT: Fix Partial Payments Not Recorded
-- ===================================================================================
-- This script recovers invoices where partial payments were made but not recorded
-- Invoice #5: ₹12,500 invoice, ₹10,000 received = PARTIAL (was showing PENDING)
-- Invoice #4: ₹2,490 invoice - PENDING investigation

-- =======================================
-- BEFORE: Show current state of problematic invoices
-- =======================================
SELECT 
    s.bill_no,
    c.name as buyer_name,
    s.total_amount_inc_tax as invoice_total,
    s.amount_received,
    s.payment_status,
    s.payment_mode,
    s.created_at
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax IN (12500, 2490)
AND DATE(s.sale_date) = '2026-04-12'
ORDER BY s.total_amount_inc_tax DESC;

-- =======================================
-- STEP 1: Fix Invoice #5 (₹12,500 with ₹10,000 partial payment)
-- =======================================
-- Update the sales record with correct amount_received
UPDATE mandi.sales
SET 
    amount_received = 10000,
    payment_status = 'partial'  -- Will be validated/corrected by trigger
WHERE total_amount_inc_tax = 12500
AND buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
AND DATE(sale_date) = '2026-04-12'
AND amount_received = 0;

-- Create the ledger entry for the partial payment
INSERT INTO mandi.ledger_entries (
    organization_id, contact_id, transaction_type,
    debit, credit, description, entry_date, reference_id, reference_no
)
SELECT
    s.organization_id,
    s.buyer_id,
    'receipt',
    0,
    10000,
    'Partial Receipt - Sale #' || COALESCE(s.bill_no::TEXT, s.id::TEXT),
    s.sale_date,
    s.id,
    COALESCE(s.bill_no::TEXT, s.id::TEXT)
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax = 12500
AND DATE(s.sale_date) = '2026-04-12'
ON CONFLICT DO NOTHING;

-- =======================================
-- STEP 2: Investigate Invoice #4 (₹2,490)
-- =======================================
-- Show all details for investigation
SELECT
    'INVOICE #4 DETAILS' as type,
    s.id as sale_id,
    c.name as buyer_name,
    s.bill_no,
    s.total_amount_inc_tax as invoice_total,
    s.amount_received,
    s.payment_status,
    s.payment_mode,
    s.created_at,
    COUNT(si.id) as line_items,
    SUM(si.qty) as total_qty
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
LEFT JOIN mandi.sale_items si ON si.sale_id = s.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax = 2490
AND DATE(s.sale_date) = '2026-04-12'
GROUP BY s.id, c.name, s.bill_no, s.total_amount_inc_tax, 
         s.amount_received, s.payment_status, s.payment_mode, s.created_at;

-- Show what items were sold in invoice #4
SELECT
    'INVOICE #4 ITEMS' as type,
    l.lot_code,
    si.qty,
    si.rate,
    si.amount
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
LEFT JOIN mandi.sale_items si ON si.sale_id = s.id
LEFT JOIN mandi.lots l ON si.lot_id = l.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax = 2490
AND DATE(s.sale_date) = '2026-04-12';

-- =======================================
-- AFTER FIX: Verify Invoice #5 status changed to PARTIAL
-- =======================================
SELECT 
    'FIXED' as invoice,
    s.bill_no,
    c.name as buyer_name,
    s.total_amount_inc_tax as invoice_total,
    s.amount_received,
    s.payment_status as current_status,
    (s.total_amount_inc_tax - s.amount_received) as outstanding,
    s.payment_mode
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax = 12500
AND DATE(s.sale_date) = '2026-04-12';

-- Check ledger entry was created
SELECT
    'LEDGER_CREATED' as check_type,
    le.reference_no,
    le.transaction_type,
    le.debit,
    le.credit,
    le.description,
    le.entry_date
FROM mandi.ledger_entries le
JOIN mandi.sales s ON le.reference_id = s.id
JOIN mandi.contacts c ON s.buyer_id = c.id
WHERE c.name = 'Kevin'
AND s.total_amount_inc_tax = 12500
AND le.transaction_type = 'receipt'
AND DATE(s.sale_date) = '2026-04-12';
