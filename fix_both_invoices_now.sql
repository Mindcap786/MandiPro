-- Execute these queries in Supabase SQL Editor in sequence
-- This will fix the payment amounts using the ledger as source of truth

-- QUERY 1: Check what payments exist in ledger for Kevin's invoices
SELECT 
    'DIAGNOSTIC: Find matching ledger entries' as step,
    le.id as ledger_id,
    le.reference_no as invoice_no,
    le.transaction_type,
    le.credit as payment_amount,
    le.entry_date,
    le.description,
    s.bill_no,
    s.amount_received as current_db_amount,
    s.payment_status as current_status,
    s.total_amount_inc_tax
FROM mandi.ledger_entries le
LEFT JOIN mandi.sales s ON s.id = le.reference_id
WHERE 
    le.contact_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin' LIMIT 1)
    AND le.transaction_type = 'receipt'
    AND s.total_amount_inc_tax IN (2490, 12500)
ORDER BY s.bill_no DESC;

-- QUERY 2: Update amount_received for Kevin's invoices based on ledger
UPDATE mandi.sales s
SET 
    amount_received = (
        SELECT COALESCE(SUM(credit), 0)
        FROM mandi.ledger_entries
        WHERE reference_id = s.id 
        AND transaction_type = 'receipt'
    ),
    payment_status = CASE 
        WHEN (SELECT COALESCE(SUM(credit), 0) FROM mandi.ledger_entries WHERE reference_id = s.id AND transaction_type = 'receipt') <= 0 THEN 'pending'
        WHEN (SELECT COALESCE(SUM(credit), 0) FROM mandi.ledger_entries WHERE reference_id = s.id AND transaction_type = 'receipt') >= s.total_amount_inc_tax THEN 'paid'
        ELSE 'partial'
    END
WHERE 
    s.buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
    AND s.total_amount_inc_tax IN (2490, 12500)
    AND s.payment_status = 'pending'
    AND s.amount_received <= 0;

-- QUERY 3: Verify the fix
SELECT 
    'AFTER FIX' as state,
    s.bill_no,
    s.total_amount_inc_tax,
    s.amount_received,
    s.payment_status,
    CASE 
        WHEN s.payment_status = 'pending' AND s.amount_received = 0 THEN '❌ Still pending'
        WHEN s.payment_status = 'partial' THEN '✅ Fixed: ' || s.amount_received || '/' || s.total_amount_inc_tax || ' received'
        WHEN s.payment_status = 'paid' THEN '✅ Fully paid'
    END as result
FROM mandi.sales s
WHERE 
    s.buyer_id = (SELECT id FROM mandi.contacts WHERE name = 'Kevin')
    AND s.total_amount_inc_tax IN (2490, 12500)
ORDER BY s.total_amount_inc_tax DESC;
