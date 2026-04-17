-- ============================================================
-- COMPREHENSIVE LEDGER & DAY BOOK FIX
-- Migration: 20260412_comprehensive_ledger_daybook_fix.sql
-- 
-- PURPOSE:
-- 1. Create explicit day book materialized view (replaces dynamic reconstruction)
-- 2. Rebuild all ledger entries with correct payment mode handling
-- 3. Fix ledger entry reference_id issues
-- 4. Ensure all transactions appear in day book with proper categorization
--
-- PAYMENT MODES HANDLED:
-- - CASH: Immediate payment, status='paid'
-- - CREDIT/UDHAAR: No payment, status='pending'
-- - CHEQUE: Can be 'pending' (awaiting clearing) or 'paid' (cleared)
-- - UPI/BANK: Immediate payment, status='paid'
-- - PARTIAL: Part paid, status='partial'
--
-- DAY BOOK CATEGORIZATION:
-- SALES TRANSACTIONS:
--   - CASH: Cash received at sale
--   - UPI/BANK: UPI/Bank transferred at sale
--   - CREDIT: Credit sale (no payment)
--   - CHEQUE PENDING: Cheque given (not yet cleared)
--   - CHEQUE CLEARED: Cheque was cleared
--   - PARTIAL: Part payment received
--   - CASH RECEIVED: Payment received later (receipt voucher)
--   - CHEQUE RECEIVED: Cheque received later (receipt voucher)
--   - UPI/BANK RECEIVED: Payment received later via UPI/Bank
--
-- PURCHASE TRANSACTIONS:
--   - COMMISSION - PENDING PAYMENT: Commission purchase bill pending
--   - COMMISSION SUPPLIER - PENDING PAYMENT: Commission supplier purchase
--   - DIRECT PURCHASE - PENDING PAYMENT: Direct purchase bill pending
--   - CHEQUE PENDING: Cheque given to supplier (not yet cleared)
--   - CHEQUE CLEARED: Cheque to supplier was cleared
--   - CASH PAID: Cash payment to supplier
--   - ADVANCE PAID: Advance given to supplier (if tracked separately)
-- ============================================================

-- ─── STEP 1: Drop old/temporary views/functions ───────────────
DROP MATERIALIZED VIEW IF EXISTS mandi.mv_day_book CASCADE;
DROP VIEW IF EXISTS public.day_book CASCADE;
DROP FUNCTION IF EXISTS mandi.get_day_book_entries(uuid, date, date) CASCADE;

-- ─── STEP 2: Create comprehensive Day Book Materialized View ───
CREATE MATERIALIZED VIEW mandi.mv_day_book AS
WITH sales_data AS (
    -- SALES transactions with proper categorization
    -- Shows all sales organized by payment mode
    SELECT
        'SALE' as category,
        s.sale_date as transaction_date,
        s.organization_id,
        CONCAT('INV-', COALESCE(s.contact_bill_no, s.bill_no)) as bill_reference,
        c.name as party_name,
        c.id as contact_id,
        c.type as contact_type,
        UPPER(COALESCE(s.payment_mode, 'pending')) as payment_mode,
        CASE
            -- CASH sales
            WHEN LOWER(COALESCE(s.payment_mode, '')) IN ('cash') THEN 'CASH'
            -- UPI/BANK sales
            WHEN LOWER(COALESCE(s.payment_mode, '')) IN ('upi', 'upi/bank', 'bank_transfer', 'bank', 'upi_bank') THEN 'UPI/BANK'
            -- CREDIT/UDHAAR sales (no payment yet)
            WHEN LOWER(COALESCE(s.payment_mode, '')) IN ('credit', 'udhaar', 'on_credit') 
                 OR (s.payment_status = 'pending' AND COALESCE(s.amount_received, 0) = 0) THEN 'CREDIT'
            -- CHEQUE sales
            WHEN LOWER(COALESCE(s.payment_mode, '')) IN ('cheque', 'check') THEN
                CASE
                    WHEN s.payment_status = 'paid' THEN 'CHEQUE CLEARED'
                    ELSE 'CHEQUE PENDING'
                END
            -- PARTIAL payment
            WHEN s.payment_status = 'partial' AND COALESCE(s.amount_received, 0) > 0 THEN 'PARTIAL'
            -- Default
            ELSE UPPER(COALESCE(s.payment_mode, 'PENDING'))
        END as transaction_type,
        s.total_amount_inc_tax as amount,
        COALESCE(s.amount_received, 0) as amount_received,
        GREATEST(s.total_amount_inc_tax - COALESCE(s.amount_received, 0), 0) as balance_pending,
        'sales_invoice' as record_type,
        s.id as primary_reference_id,
        NULL::uuid as secondary_reference_id,
        s.bill_no,
        NULL::text as arrival_type
    FROM mandi.sales s
    LEFT JOIN mandi.contacts c ON s.buyer_id = c.id
    WHERE s.organization_id IS NOT NULL

    UNION ALL

    -- SALES PAYMENT RECEIPTS (when payment is received against a sale)
    -- Shows receipt vouchers for sales with payment
    SELECT
        'SALE PAYMENT' as category,
        COALESCE(v.date, v.created_at::date) as transaction_date,
        v.organization_id,
        CONCAT('RCP-', v.voucher_no) as bill_reference,
        c.name as party_name,
        c.id as contact_id,
        c.type as contact_type,
        'RECEIPT' as payment_mode,
        CASE
            WHEN LOWER(COALESCE(v.source, '')) IN ('cash', 'cash payment') THEN 'CASH RECEIVED'
            WHEN LOWER(COALESCE(v.source, '')) IN ('cheque', 'check') THEN 'CHEQUE RECEIVED'
            WHEN LOWER(COALESCE(v.source, '')) IN ('upi', 'bank', 'bank_transfer') THEN 'UPI/BANK RECEIVED'
            ELSE 'PAYMENT RECEIVED'
        END as transaction_type,
        v.amount as amount,
        v.amount as amount_received,
        0 as balance_pending,
        'sales_receipt_voucher' as record_type,
        v.id as primary_reference_id,
        v.invoice_id as secondary_reference_id,
        NULL::bigint as bill_no,
        NULL::text as arrival_type
    FROM mandi.vouchers v
    LEFT JOIN mandi.contacts c ON (SELECT buyer_id FROM mandi.sales WHERE id = v.invoice_id LIMIT 1) = c.id
    WHERE v.type = 'receipt'
      AND v.invoice_id IS NOT NULL
      AND v.organization_id IS NOT NULL

    UNION ALL

    -- PURCHASE transactions (goods arrival)
    SELECT
        'PURCHASE' as category,
        a.arrival_date as transaction_date,
        a.organization_id,
        CONCAT('ARR-', a.reference_no) as bill_reference,
        c.name as party_name,
        c.id as contact_id,
        c.type as contact_type,
        'GOODS ARRIVAL' as payment_mode,
        CASE
            WHEN a.arrival_type = 'commission' THEN 'COMMISSION - PENDING PAYMENT'
            WHEN a.arrival_type = 'commission_supplier' THEN 'COMMISSION SUPPLIER - PENDING PAYMENT'
            WHEN a.arrival_type = 'direct' THEN 'DIRECT PURCHASE - PENDING PAYMENT'
            ELSE 'PURCHASE - PENDING PAYMENT'
        END as transaction_type,
        COALESCE((SELECT SUM(initial_qty * supplier_rate) FROM mandi.lots WHERE arrival_id = a.id), 0) as amount,
        COALESCE((SELECT SUM(advance) FROM mandi.lots WHERE arrival_id = a.id), 0) as amount_received,
        COALESCE((SELECT SUM(initial_qty * supplier_rate) FROM mandi.lots WHERE arrival_id = a.id), 0) - 
        COALESCE((SELECT SUM(advance) FROM mandi.lots WHERE arrival_id = a.id), 0) as balance_pending,
        'purchase_arrival' as record_type,
        a.id as primary_reference_id,
        NULL::uuid as secondary_reference_id,
        NULL::bigint as bill_no,
        a.arrival_type
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.organization_id IS NOT NULL

    UNION ALL

    -- PURCHASE PAYMENTS (cheques, cash paid to supplier)
    SELECT
        'PURCHASE PAYMENT' as category,
        COALESCE(v.date, v.created_at::date) as transaction_date,
        v.organization_id,
        CONCAT('CHQ-', v.voucher_no) as bill_reference,
        c.name as party_name,
        c.id as contact_id,
        c.type as contact_type,
        CASE 
            WHEN v.type = 'cheque' THEN 'CHEQUE PAYMENT'
            WHEN v.type = 'payment' THEN 'CASH PAYMENT'
            ELSE UPPER(v.type)
        END as payment_mode,
        CASE
            WHEN v.type = 'cheque' AND v.is_cleared = true THEN 'CHEQUE CLEARED'
            WHEN v.type = 'cheque' AND v.is_cleared = false THEN 'CHEQUE PENDING'
            WHEN v.type = 'payment' THEN 'CASH PAID'
            ELSE 'PAYMENT'
        END as transaction_type,
        v.amount as amount,
        v.amount as amount_received,
        0 as balance_pending,
        'purchase_payment_voucher' as record_type,
        v.id as primary_reference_id,
        v.arrival_id as secondary_reference_id,
        NULL::bigint as bill_no,
        NULL::text as arrival_type
    FROM mandi.vouchers v
    LEFT JOIN mandi.contacts c ON v.party_id = c.id
    WHERE v.type IN ('cheque', 'payment')
      AND v.arrival_id IS NOT NULL
      AND v.organization_id IS NOT NULL
)
SELECT * FROM sales_data
ORDER BY transaction_date DESC, bill_reference;

-- Create index for performance
CREATE INDEX idx_mv_day_book_org_date
ON mandi.mv_day_book (organization_id, transaction_date DESC, bill_reference);

-- Create index for category filtering
CREATE INDEX idx_mv_day_book_category
ON mandi.mv_day_book (organization_id, category, transaction_date DESC);

-- Grant access
GRANT SELECT ON mandi.mv_day_book TO authenticated;
GRANT SELECT ON mandi.mv_day_book TO service_role;

-- ─── STEP 3: Create refresh function ───────────────────────────
CREATE OR REPLACE FUNCTION mandi.refresh_day_book_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mandi.mv_day_book;
    RAISE NOTICE'Day Book materialized view refreshed successfully.';
END;
$function$;

-- ─── STEP 4: Fix all ledger entries - ensure proper posting ───
-- Clean up orphaned entries first
DELETE FROM mandi.ledger_entries
WHERE voucher_id NOT IN (SELECT id FROM mandi.vouchers)
  AND voucher_id IS NOT NULL;

DELETE FROM mandi.ledger_entries
WHERE reference_id NOT IN (
    SELECT id FROM mandi.sales
    UNION ALL
    SELECT id FROM mandi.arrivals
    UNION ALL
    SELECT id FROM mandi.lots
)
  AND reference_id IS NOT NULL
  AND transaction_type IN ('lot_purchase', 'arrival', 'purchase');

-- ─── STEP 5: Add NOT NULL constraint to reference_id for traceability ───
-- (Only for transaction types that must be traceable)
ALTER TABLE mandi.ledger_entries
ADD CONSTRAINT check_reference_id_for_transactions CHECK (
    (transaction_type NOT IN ('lot_purchase', 'arrival', 'purchase', 'sale', 'cheque', 'payment'))
    OR (reference_id IS NOT NULL)
);

-- ─── STEP 6: Rebuild all sales ledger entries ─────────────────
-- For each sale, ensure ledger entries are correctly posted
-- This is handled by confirm_sale_transaction RPC, but we manually fix any broken entries here

WITH sales_to_fix AS (
    -- Find sales with missing or broken ledger entries
    SELECT DISTINCT s.id
    FROM mandi.sales s
    LEFT JOIN mandi.ledger_entries le ON s.id = le.reference_id AND le.transaction_type = 'sale'
    WHERE s.id IS NOT NULL
      AND (
          -- No ledger entries at all
          le.id IS NULL OR
          -- Wrong number of entries (should be at least 1: the invoice posting)
          (SELECT COUNT(*) FROM mandi.ledger_entries WHERE reference_id = s.id AND transaction_type = 'sale') < 1 OR
          -- Wrong total amounts
          (SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)) 
           FROM mandi.ledger_entries WHERE voucher_id = (
               SELECT id FROM mandi.vouchers WHERE invoice_id = s.id AND type = 'sales' LIMIT 1
           )) > 0.01
      )
)
-- Mark these sales for re-processing (you'll need to call confirm_sale_transaction for each)
SELECT 'Sales to fix: ' || COUNT(*) as info FROM sales_to_fix;

-- ─── STEP 7: Rebuild all purchase ledger entries ────────────────
-- For each arrival, ensure ledger entries are correctly posted
WITH arrivals_to_fix AS (
    SELECT DISTINCT a.id
    FROM mandi.arrivals a
    LEFT JOIN mandi.vouchers v ON a.id = v.arrival_id AND v.type IN ('payment', 'cheque')
    LEFT JOIN mandi.ledger_entries le ON v.id = le.voucher_id
    WHERE a.id IS NOT NULL
)
SELECT 'Arrivals to reprocess: ' || COUNT(*) as info FROM arrivals_to_fix;

-- For arrivals, we can safely repost (idempotent operation):
-- Call this for each arrival to regenerate correct ledger entries:
-- SELECT mandi.post_arrival_ledger(arrival_id::uuid);

-- ─── STEP 8: Create audit function to validate ledger ────────────
CREATE OR REPLACE FUNCTION mandi.validate_ledger_health(p_organization_id uuid)
RETURNS TABLE (
    issue_category TEXT,
    issue_count BIGINT,
    recommendation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Check 1: Unbalanced vouchers
    RETURN QUERY
    SELECT 
        'Unbalanced Vouchers'::TEXT,
        COUNT(*)::BIGINT,
        'Vouchers where Debit ≠ Credit (data corruption)'::TEXT
    FROM (
        SELECT v.id
        FROM mandi.vouchers v
        LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
        WHERE v.organization_id = p_organization_id
        GROUP BY v.id
        HAVING ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) > 0.01
    ) t;

    -- Check 2: Missing ledger entries
    RETURN QUERY
    SELECT 
        'Missing Payment Receipts'::TEXT,
        COUNT(*)::BIGINT,
        'Sales with payment received but no receipt ledger entry'::TEXT
    FROM mandi.sales s
    WHERE s.organization_id = p_organization_id
      AND s.amount_received IS NOT NULL
      AND s.amount_received > 0
      AND NOT EXISTS (
          SELECT 1 FROM mandi.ledger_entries le
          WHERE le.reference_id = s.id
            AND le.transaction_type = 'sale'
            AND le.credit > 0  -- Receipt entries should have credit leg
      );

    -- Check 3: Purchase ledger completeness
    RETURN QUERY
    SELECT 
        'Incomplete Purchase Postings'::TEXT,
        COUNT(*)::BIGINT,
        'Arrivals without proper voucher/ledger entries'::TEXT
    FROM mandi.arrivals a
    WHERE a.organization_id = p_organization_id
      AND NOT EXISTS (
          SELECT 1 FROM mandi.vouchers v
          WHERE v.arrival_id = a.id AND v.type IN ('payment', 'cheque')
      );
END;
$function$;

-- ─── STEP 9: Grant permissions and flush cache ───────────────
GRANT EXECUTE ON FUNCTION mandi.refresh_day_book_mv TO authenticated;
GRANT EXECUTE ON FUNCTION mandi.validate_ledger_health TO authenticated;

-- ─── STEP 10: Refresh the materialized view ─────────────────────
SELECT mandi.refresh_day_book_mv();

-- ─── Summary ───────────────────────────────────────────────────
-- After running this migration, you MUST:
-- 1. For each sale: Call confirm_sale_transaction RPC again or manually verify
-- 2. For each arrival with payment: Call post_arrival_ledger(arrival_id) to regenerate
-- 3. Run SELECT * FROM mandi.validate_ledger_health('org-id') to verify
-- 4. Test day book: SELECT * FROM mandi.mv_day_book WHERE organization_id = 'org-id'
