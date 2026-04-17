-- ==========================================================================
-- DIAGNOSTIC: Duplicate / Orphan Purchase Vouchers
-- ==========================================================================
-- Purpose: When the Day Book or Finance Overview shows duplicate rows for a
--   single arrival (e.g. "mubarak · Purchase" AND "Unknown · Fruit Value"
--   both ₹10,000), the cause is almost always stale data left by an older
--   version of `post_arrival_ledger` that didn't enforce idempotency.
--
-- Run these queries in the Supabase SQL editor. They are READ ONLY.
-- Paste the output back so we know exactly what to clean up.
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. Arrivals that have MORE THAN ONE purchase voucher
--    (this is the smoking gun — there should only ever be 1)
-- ---------------------------------------------------------------------------
SELECT
    a.id            AS arrival_id,
    a.bill_no,
    a.contact_bill_no,
    a.arrival_date,
    c.name          AS party_name,
    COUNT(DISTINCT v.id)            AS voucher_count,
    SUM(v.amount)                   AS total_amount_across_vouchers,
    array_agg(v.id ORDER BY v.created_at)     AS voucher_ids,
    array_agg(v.voucher_no ORDER BY v.created_at) AS voucher_nos,
    array_agg(v.narration ORDER BY v.created_at)  AS narrations,
    array_agg(v.created_at ORDER BY v.created_at) AS created_ats
FROM mandi.arrivals a
JOIN mandi.contacts c ON c.id = a.party_id
LEFT JOIN mandi.vouchers v
       ON v.arrival_id = a.id
      AND v.type = 'purchase'
GROUP BY a.id, a.bill_no, a.contact_bill_no, a.arrival_date, c.name
HAVING COUNT(DISTINCT v.id) > 1
ORDER BY a.arrival_date DESC;

-- ---------------------------------------------------------------------------
-- 2. Purchase ledger entries that have NO reference_id
--    (these can't be grouped by the Day Book because grouping relies on it)
-- ---------------------------------------------------------------------------
SELECT
    le.id,
    le.voucher_id,
    v.voucher_no,
    v.type          AS voucher_type,
    v.arrival_id,
    le.debit,
    le.credit,
    le.description,
    le.transaction_type,
    le.entry_date,
    le.contact_id,
    le.account_id,
    acc.name        AS account_name
FROM mandi.ledger_entries le
LEFT JOIN mandi.vouchers v  ON v.id  = le.voucher_id
LEFT JOIN mandi.accounts acc ON acc.id = le.account_id
WHERE le.transaction_type = 'purchase'
  AND le.reference_id IS NULL
ORDER BY le.entry_date DESC
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 3. Purchase vouchers whose `arrival_id` is NULL
--    (these are orphans — no arrival to tie them back to)
-- ---------------------------------------------------------------------------
SELECT
    v.id,
    v.voucher_no,
    v.type,
    v.date,
    v.amount,
    v.narration,
    v.created_at,
    COUNT(le.id) AS ledger_leg_count
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
WHERE v.type = 'purchase'
  AND v.arrival_id IS NULL
GROUP BY v.id
ORDER BY v.created_at DESC
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 4. Full ledger dump for the most recent arrivals (for context)
--    Lets us see exactly which legs exist and whether they share voucher_id
-- ---------------------------------------------------------------------------
SELECT
    a.id            AS arrival_id,
    a.bill_no,
    c.name          AS party_name,
    v.id            AS voucher_id,
    v.voucher_no,
    v.type          AS v_type,
    le.id           AS le_id,
    le.debit,
    le.credit,
    le.description,
    le.transaction_type,
    le.reference_id,
    le.contact_id,
    le.account_id,
    acc.name        AS account_name
FROM mandi.arrivals a
JOIN mandi.contacts c ON c.id = a.party_id
LEFT JOIN mandi.vouchers v  ON v.arrival_id = a.id
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
LEFT JOIN mandi.accounts acc ON acc.id = le.account_id
WHERE a.arrival_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY a.created_at DESC, v.id, le.id;

-- ---------------------------------------------------------------------------
-- 5. Summary totals — compare these to what the UI is showing
-- ---------------------------------------------------------------------------
SELECT
    DATE(v.date) AS day,
    v.type,
    COUNT(*)                 AS voucher_count,
    SUM(v.amount)            AS total_amount,
    SUM(CASE WHEN le.debit  > 0 THEN le.debit  ELSE 0 END) AS total_debit,
    SUM(CASE WHEN le.credit > 0 THEN le.credit ELSE 0 END) AS total_credit
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
WHERE v.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(v.date), v.type
ORDER BY day DESC, v.type;
