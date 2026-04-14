-- ================================================================
-- EMERGENCY FIX: Receivables & Double Entry Cleanup
-- Run this in Supabase SQL Editor
-- ================================================================

-- STEP 1: Remove duplicate sale ledger entries
-- Keep only the BEST entry per sale per contact (prefer one with voucher_id)
WITH ranked_sale_entries AS (
    SELECT
        le.id,
        le.reference_id,
        le.contact_id,
        le.transaction_type,
        ROW_NUMBER() OVER (
            PARTITION BY le.reference_id, le.contact_id, le.transaction_type
            ORDER BY
              (CASE WHEN le.voucher_id IS NOT NULL THEN 0 ELSE 1 END),  -- prefer voucher-linked
              le.debit DESC,
              le.created_at ASC
        ) AS rn
    FROM mandi.ledger_entries le
    WHERE le.contact_id IS NOT NULL
      AND le.transaction_type IN ('sale', 'lot_purchase', 'purchase', 'arrival')
      AND le.reference_id IS NOT NULL
)
DELETE FROM mandi.ledger_entries
WHERE id IN (
    SELECT id FROM ranked_sale_entries WHERE rn > 1
);

-- STEP 2: For every PAID sale that has a debit (AR) entry but NO credit receipt,
-- insert the missing cash receipt entry
INSERT INTO mandi.ledger_entries (
    organization_id,
    voucher_id,
    contact_id,
    debit,
    credit,
    entry_date,
    transaction_type,
    reference_id,
    reference_no,
    description
)
SELECT
    s.organization_id,
    le.voucher_id,              -- reuse the sale voucher
    s.buyer_id,
    0,                          -- credit entry (no debit)
    le.debit,                   -- credit = same as the debit (clearing AR)
    s.sale_date,
    'sale_payment',
    s.id,
    s.bill_no::TEXT,
    'Sale Payment #' || s.bill_no
FROM mandi.sales s
JOIN mandi.ledger_entries le
    ON le.reference_id = s.id
    AND le.contact_id = s.buyer_id
    AND le.transaction_type = 'sale'
    AND le.debit > 0
WHERE s.payment_status = 'paid'
  AND NOT EXISTS (
      SELECT 1 FROM mandi.ledger_entries le2
      WHERE le2.reference_id = s.id
        AND le2.contact_id = s.buyer_id
        AND le2.transaction_type = 'sale_payment'
        AND le2.credit > 0
  );

-- STEP 3: Drop old triggers so this never happens again
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS sync_sales_to_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS trg_sync_sale_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS sync_lot_purchase_ledger ON mandi.lots;
DROP FUNCTION IF EXISTS mandi.sync_sales_ledger_fn CASCADE;
DROP FUNCTION IF EXISTS mandi.sync_lot_purchase_ledger CASCADE;

-- Verify: show outstanding balance per buyer after fix
SELECT
    c.name AS buyer_name,
    SUM(le.debit) - SUM(le.credit) AS outstanding_balance
FROM mandi.ledger_entries le
JOIN mandi.contacts c ON le.contact_id = c.id
WHERE le.organization_id = (SELECT organization_id FROM core.user_profiles LIMIT 1)
GROUP BY c.name
HAVING SUM(le.debit) - SUM(le.credit) != 0;
