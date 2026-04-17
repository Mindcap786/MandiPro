-- ============================================================
-- Simple Fix: Update existing sales payment status
-- This directly updates status without triggering validation
-- ============================================================

-- Step 1: Disable the trigger temporarily
ALTER TABLE mandi.sales DISABLE TRIGGER prevent_empty_sale ON mandi.sales;

-- Step 2: Update existing sales with correct payment status
-- Based on whether receipts were recorded (ledger_entries with transaction_type = 'receipt')
UPDATE mandi.sales s
SET payment_status = CASE 
    -- PAID: No amount owed OR amount received equals total
    WHEN total_amount_inc_tax <= 0.01 THEN 'paid'
    
    -- PAID: Receipt recorded for full amount
    WHEN (
        SELECT COALESCE(SUM(le.credit), 0)
        FROM mandi.ledger_entries le
        WHERE le.reference_id = s.id 
        AND le.transaction_type = 'receipt'
    ) >= (s.total_amount_inc_tax - 0.01) THEN 'paid'
    
    -- PARTIAL: Receipt recorded for partial amount
    WHEN (
        SELECT COALESCE(SUM(le.credit), 0)
        FROM mandi.ledger_entries le
        WHERE le.reference_id = s.id 
        AND le.transaction_type = 'receipt'
    ) > 0.01 THEN 'partial'
    
    -- PENDING: No receipt recorded (default)
    ELSE 'pending'
END
WHERE payment_status != 'paid'  -- Only update non-paid invoices
AND EXISTS (SELECT 1 FROM mandi.sale_items WHERE sale_id = s.id);  -- Only if has items

-- Step 3: Re-enable the trigger
ALTER TABLE mandi.sales ENABLE TRIGGER prevent_empty_sale ON mandi.sales;

-- Step 4: Verify the updates
SELECT 
    id,
    bill_no,
    total_amount_inc_tax,
    payment_status,
    COALESCE((
        SELECT SUM(le.credit)
        FROM mandi.ledger_entries le
        WHERE le.reference_id = mandi.sales.id 
        AND le.transaction_type = 'receipt'
    ), 0) as receipt_amount
FROM mandi.sales
ORDER BY created_at DESC
LIMIT 10;
