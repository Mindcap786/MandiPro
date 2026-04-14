-- ==========================================================================
-- FULL AUDIT — Day Book, Vouchers, Ledger & Finance
-- ==========================================================================
-- READ ONLY. Run in Supabase SQL editor, one query at a time.
-- Each query is numbered and has a short "what this tells you" header.
-- Paste back the output of every query that returns rows.
--
-- Health rule: in a correct double-entry ledger, for EVERY voucher the sum
-- of debits MUST equal the sum of credits. Any row where they don't is a
-- real bug at the data level.
-- ==========================================================================


-- ==========================================================================
-- Q1. Unbalanced vouchers — Dr ≠ Cr (MUST be zero rows)
--
-- What this tells you: the exact voucher IDs where double-entry is broken.
-- This is the #1 source of the "wrong totals" you're seeing.
-- ==========================================================================
SELECT
    v.id                                       AS voucher_id,
    v.type                                     AS voucher_type,
    v.voucher_no,
    v.date,
    v.amount                                   AS voucher_amount,
    v.narration,
    v.arrival_id,
    v.invoice_id,
    COALESCE(SUM(le.debit), 0)                 AS total_debit,
    COALESCE(SUM(le.credit), 0)                AS total_credit,
    COALESCE(SUM(le.debit), 0)
      - COALESCE(SUM(le.credit), 0)            AS imbalance,
    COUNT(le.id)                               AS leg_count
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
GROUP BY v.id
HAVING ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) > 0.01
ORDER BY ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) DESC
LIMIT 100;


-- ==========================================================================
-- Q2. Vouchers with zero or one ledger legs (MUST be zero rows)
--
-- What this tells you: vouchers that never got a full double-entry pair.
-- These are phantoms or aborted inserts.
-- ==========================================================================
SELECT
    v.id                 AS voucher_id,
    v.type,
    v.voucher_no,
    v.date,
    v.amount,
    v.narration,
    COUNT(le.id)         AS leg_count
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
GROUP BY v.id
HAVING COUNT(le.id) < 2
ORDER BY v.date DESC
LIMIT 100;


-- ==========================================================================
-- Q3. Suspiciously large vouchers (likely typos / corrupted data)
--
-- What this tells you: anything above ₹1 crore. For a mandi this big a
-- number almost always means a missing decimal, extra zero, or test data.
-- ==========================================================================
SELECT
    v.id              AS voucher_id,
    v.type,
    v.voucher_no,
    v.date,
    v.amount,
    v.narration,
    v.created_at
FROM mandi.vouchers v
WHERE v.amount > 10000000
ORDER BY v.amount DESC
LIMIT 50;


-- ==========================================================================
-- Q4. Arrivals with MORE THAN ONE purchase voucher (should be 1 each)
--
-- What this tells you: arrivals that have duplicate purchase postings.
-- This is what produced the "mubarak + Unknown" split in the Day Book.
-- ==========================================================================
SELECT
    a.id                    AS arrival_id,
    a.bill_no,
    a.contact_bill_no,
    a.arrival_date,
    c.name                  AS party_name,
    COUNT(DISTINCT v.id)    AS voucher_count,
    array_agg(v.id   ORDER BY v.created_at) AS voucher_ids,
    array_agg(v.amount ORDER BY v.created_at) AS amounts,
    array_agg(v.narration ORDER BY v.created_at) AS narrations
FROM mandi.arrivals a
JOIN mandi.contacts c ON c.id = a.party_id
JOIN mandi.vouchers v ON v.arrival_id = a.id AND v.type = 'purchase'
GROUP BY a.id, a.bill_no, a.contact_bill_no, a.arrival_date, c.name
HAVING COUNT(DISTINCT v.id) > 1
ORDER BY a.arrival_date DESC
LIMIT 100;


-- ==========================================================================
-- Q5. Sales with MORE THAN ONE sale voucher (should be 1 each)
-- ==========================================================================
SELECT
    s.id                    AS sale_id,
    s.bill_no,
    s.sale_date,
    c.name                  AS buyer_name,
    COUNT(DISTINCT v.id)    AS voucher_count,
    array_agg(v.id ORDER BY v.created_at)     AS voucher_ids,
    array_agg(v.amount ORDER BY v.created_at) AS amounts
FROM mandi.sales s
LEFT JOIN mandi.contacts c ON c.id = s.buyer_id
JOIN mandi.vouchers v ON v.invoice_id = s.id AND v.type = 'sale'
GROUP BY s.id, s.bill_no, s.sale_date, c.name
HAVING COUNT(DISTINCT v.id) > 1
ORDER BY s.sale_date DESC
LIMIT 100;


-- ==========================================================================
-- Q6. Purchase ledger entries with NULL reference_id
--
-- What this tells you: ledger legs that can't be grouped properly because
-- they've lost their link to the arrival. These become "Unknown" rows.
-- ==========================================================================
SELECT
    le.id,
    le.voucher_id,
    v.voucher_no,
    v.type           AS voucher_type,
    v.arrival_id     AS voucher_arrival_id,
    le.debit,
    le.credit,
    le.description,
    le.entry_date,
    le.contact_id,
    le.account_id,
    acc.name         AS account_name
FROM mandi.ledger_entries le
LEFT JOIN mandi.vouchers v  ON v.id  = le.voucher_id
LEFT JOIN mandi.accounts acc ON acc.id = le.account_id
WHERE le.transaction_type = 'purchase'
  AND le.reference_id IS NULL
ORDER BY le.entry_date DESC
LIMIT 100;


-- ==========================================================================
-- Q7. Ledger entries whose voucher has been deleted (orphans)
-- ==========================================================================
SELECT
    le.id,
    le.voucher_id,
    le.debit,
    le.credit,
    le.description,
    le.transaction_type,
    le.entry_date
FROM mandi.ledger_entries le
LEFT JOIN mandi.vouchers v ON v.id = le.voucher_id
WHERE le.voucher_id IS NOT NULL
  AND v.id IS NULL
ORDER BY le.entry_date DESC
LIMIT 100;


-- ==========================================================================
-- Q8. True daily totals — FIXED version of the earlier query.
--     Counts vouchers ONCE (not once per leg) and computes ledger sums
--     on the ledger side only. Compare these to what the UI shows.
-- ==========================================================================
SELECT
    v_day.day,
    v_day.type,
    v_day.voucher_count,
    v_day.total_amount,
    le_day.total_debit,
    le_day.total_credit,
    (le_day.total_debit - le_day.total_credit) AS imbalance
FROM (
    SELECT DATE(date) AS day, type,
           COUNT(*)       AS voucher_count,
           SUM(amount)    AS total_amount
    FROM mandi.vouchers
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE(date), type
) v_day
LEFT JOIN (
    SELECT DATE(v.date) AS day, v.type,
           SUM(le.debit)  AS total_debit,
           SUM(le.credit) AS total_credit
    FROM mandi.vouchers v
    JOIN mandi.ledger_entries le ON le.voucher_id = v.id
    WHERE v.date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY DATE(v.date), v.type
) le_day
  ON le_day.day  = v_day.day
 AND le_day.type = v_day.type
ORDER BY v_day.day DESC, v_day.type;


-- ==========================================================================
-- Q9. Contra-account check — Cash vs Bank balance sanity
--
-- What this tells you: the current Cash In Hand and Bank Balance the
-- system thinks you have, computed directly from the ledger.
-- Compare to what Finance Overview shows.
-- ==========================================================================
SELECT
    acc.code,
    acc.name,
    acc.account_sub_type,
    COUNT(le.id)                            AS leg_count,
    COALESCE(SUM(le.debit), 0)              AS total_debit,
    COALESCE(SUM(le.credit), 0)             AS total_credit,
    COALESCE(SUM(le.debit - le.credit), 0)  AS running_balance
FROM mandi.accounts acc
LEFT JOIN mandi.ledger_entries le ON le.account_id = acc.id
WHERE acc.account_sub_type IN ('cash', 'bank')
   OR LOWER(acc.name) LIKE '%cash%'
   OR LOWER(acc.name) LIKE '%bank%'
GROUP BY acc.id, acc.code, acc.name, acc.account_sub_type
ORDER BY running_balance DESC;


-- ==========================================================================
-- Q10. Payable / Receivable by party (compare to Finance Overview totals)
--
-- What this tells you: the real outstanding per party, computed from
-- ledger legs only. If Finance Overview says ₹4,31,000 payable but this
-- query says something different, the dashboard is reading bad data.
-- ==========================================================================
SELECT
    c.id                                    AS contact_id,
    c.name                                  AS party_name,
    c.type                                  AS party_type,
    COUNT(le.id)                            AS leg_count,
    COALESCE(SUM(le.debit), 0)              AS total_debit,
    COALESCE(SUM(le.credit), 0)             AS total_credit,
    COALESCE(SUM(le.debit - le.credit), 0)  AS net_balance,
    CASE
        WHEN COALESCE(SUM(le.debit - le.credit), 0) > 0 THEN 'RECEIVABLE'
        WHEN COALESCE(SUM(le.debit - le.credit), 0) < 0 THEN 'PAYABLE'
        ELSE 'SETTLED'
    END                                     AS status
FROM mandi.contacts c
LEFT JOIN mandi.ledger_entries le ON le.contact_id = c.id
WHERE c.status != 'deleted' OR c.status IS NULL
GROUP BY c.id, c.name, c.type
HAVING COUNT(le.id) > 0
ORDER BY ABS(COALESCE(SUM(le.debit - le.credit), 0)) DESC
LIMIT 50;


-- ==========================================================================
-- Q11. Mubarak-specific drill-down (since this is where we first noticed
--      the problem). Shows every voucher + leg for every contact named
--      'mubarak'.
-- ==========================================================================
SELECT
    v.id                 AS voucher_id,
    v.type               AS v_type,
    v.voucher_no,
    v.date,
    v.amount             AS v_amount,
    v.narration,
    v.arrival_id,
    le.id                AS le_id,
    le.debit,
    le.credit,
    le.description,
    le.transaction_type,
    le.reference_id,
    le.contact_id,
    acc.name             AS account_name,
    c.name               AS contact_name
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
LEFT JOIN mandi.accounts acc       ON acc.id       = le.account_id
LEFT JOIN mandi.contacts c         ON c.id         = le.contact_id
WHERE EXISTS (
    SELECT 1 FROM mandi.ledger_entries le2
    JOIN mandi.contacts c2 ON c2.id = le2.contact_id
    WHERE le2.voucher_id = v.id
      AND LOWER(c2.name) LIKE '%mubarak%'
)
ORDER BY v.date DESC, v.id, le.id;


-- ==========================================================================
-- Q12. 1-April 2026 payment voucher(s) drill-down
--     (That ₹68 crore monster. I want to see exactly what it is.)
-- ==========================================================================
SELECT
    v.id                 AS voucher_id,
    v.type,
    v.voucher_no,
    v.date,
    v.amount,
    v.narration,
    v.created_at,
    le.id                AS le_id,
    le.debit,
    le.credit,
    le.description,
    le.transaction_type,
    le.contact_id,
    le.account_id,
    acc.name             AS account_name,
    c.name               AS contact_name
FROM mandi.vouchers v
LEFT JOIN mandi.ledger_entries le ON le.voucher_id = v.id
LEFT JOIN mandi.accounts acc       ON acc.id       = le.account_id
LEFT JOIN mandi.contacts c         ON c.id         = le.contact_id
WHERE DATE(v.date) = DATE '2026-04-01'
  AND v.type = 'payment'
ORDER BY v.amount DESC, v.id, le.id;
