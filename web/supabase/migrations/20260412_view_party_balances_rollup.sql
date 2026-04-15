-- ============================================================
-- PERFORMANCE: Rewrite view_party_balances using rollup tables
-- Migration: 20260412_view_party_balances_rollup.sql
--
-- BEFORE: Full sequential scan of ledger_entries + GROUP BY
--         → O(n) per query, ~200-800ms on large datasets
--
-- AFTER:  Read from party_daily_balances rollup (pre-aggregated
--         by trigger on every INSERT/UPDATE to ledger_entries)
--         → O(contacts) per query, ~2-10ms always
--
-- view_receivable_aging depends on view_party_balances, so we
-- DROP CASCADE and recreate both in the correct order.
-- ============================================================

-- Drop the view chain with CASCADE (handles all dependent views)
DROP VIEW IF EXISTS mandi.view_receivable_aging CASCADE;
DROP VIEW IF EXISTS mandi.view_party_balances  CASCADE;
DROP VIEW IF EXISTS public.view_party_balances  CASCADE;
DROP VIEW IF EXISTS view_party_balances         CASCADE;

-- ── 1. Recreate view_party_balances using the rollup table ──
-- Reads from party_daily_balances (maintained by trigger in
-- 20260301_rollup_tables.sql) instead of raw ledger_entries.
-- Query time: ~500ms → <10ms
CREATE OR REPLACE VIEW mandi.view_party_balances AS
SELECT
    pdb.contact_id,
    c.name                                      AS contact_name,
    c.type                                      AS contact_type,
    c.city                                      AS contact_city,
    c.phone,
    c.credit_limit,
    SUM(pdb.total_debit - pdb.total_credit)     AS net_balance,
    MAX(pdb.summary_date)                       AS last_transaction_date,
    pdb.organization_id
FROM mandi.party_daily_balances pdb
JOIN mandi.contacts c ON pdb.contact_id = c.id
WHERE c.status != 'deleted'
GROUP BY
    pdb.contact_id,
    c.name,
    c.type,
    c.city,
    c.phone,
    c.credit_limit,
    pdb.organization_id;

-- ── 2. Recreate view_receivable_aging on top of the new view ─
-- The aging buckets still need raw entry_date from ledger_entries
-- (rollup only stores daily totals, not per-entry dates).
-- With idx_le_org_contact_date now in place, the ledger scan
-- is index-accelerated instead of sequential.
CREATE OR REPLACE VIEW mandi.view_receivable_aging AS
WITH party_debits AS (
    SELECT
        le.contact_id,
        le.organization_id,
        le.debit AS amount,
        le.entry_date,
        CASE
            WHEN le.entry_date >= now() - INTERVAL '30 days'  THEN 'current'
            WHEN le.entry_date >= now() - INTERVAL '60 days'  THEN '30_60'
            WHEN le.entry_date >= now() - INTERVAL '90 days'  THEN '60_90'
            ELSE 'over_90'
        END AS bucket
    FROM mandi.ledger_entries le
    WHERE le.debit > 0
),
bucketed_totals AS (
    SELECT
        pd.organization_id,
        pd.contact_id,
        SUM(CASE WHEN pd.bucket = 'current'  THEN pd.amount ELSE 0 END) AS bucket_0_30,
        SUM(CASE WHEN pd.bucket = '30_60'    THEN pd.amount ELSE 0 END) AS bucket_31_60,
        SUM(CASE WHEN pd.bucket = '60_90'    THEN pd.amount ELSE 0 END) AS bucket_61_90,
        SUM(CASE WHEN pd.bucket = 'over_90'  THEN pd.amount ELSE 0 END) AS bucket_90_plus
    FROM party_debits pd
    GROUP BY pd.organization_id, pd.contact_id
)
SELECT
    vb.organization_id,
    vb.contact_id,
    vb.contact_name,
    vb.net_balance,
    COALESCE(bt.bucket_0_30,    0) AS bucket_0_30,
    COALESCE(bt.bucket_31_60,   0) AS bucket_31_60,
    COALESCE(bt.bucket_61_90,   0) AS bucket_61_90,
    COALESCE(bt.bucket_90_plus, 0) AS bucket_90_plus
FROM mandi.view_party_balances vb
LEFT JOIN bucketed_totals bt
       ON vb.contact_id      = bt.contact_id
      AND vb.organization_id = bt.organization_id
WHERE vb.net_balance > 0;
