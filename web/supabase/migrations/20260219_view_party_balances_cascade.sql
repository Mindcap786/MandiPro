-- Migration: Cascade Update view_party_balances and Restore Dependent Views
-- Date: 2026-02-19
-- Author: Antigravity

-- 1. Drop view_party_balances with CASCADE (this will drop view_receivable_aging too)
DROP VIEW IF EXISTS view_party_balances CASCADE;

-- 2. Recreate view_party_balances with phone and contact_city
CREATE OR REPLACE VIEW view_party_balances AS
SELECT 
    l.contact_id,
    c.name AS contact_name,
    c.type AS contact_type,
    c.city AS contact_city, -- Keep alias for backward compatibility
    c.phone,                -- Added phone number
    c.credit_limit,
    SUM(l.debit - l.credit) AS net_balance,
    MAX(l.entry_date) AS last_transaction_date,
    l.organization_id
FROM ledger_entries l
JOIN contacts c ON l.contact_id = c.id
GROUP BY l.contact_id, c.name, c.type, c.city, c.phone, c.credit_limit, l.organization_id;

-- 3. Restore view_receivable_aging (Definition fetched from previous step)
CREATE OR REPLACE VIEW view_receivable_aging AS
WITH party_debits AS (
    SELECT 
        le.contact_id,
        le.organization_id,
        le.debit AS amount,
        le.entry_date,
        CASE
            WHEN le.entry_date >= (now() - '30 days'::interval) THEN 'current'::text
            WHEN le.entry_date >= (now() - '60 days'::interval) THEN '30_60'::text
            WHEN le.entry_date >= (now() - '90 days'::interval) THEN '60_90'::text
            ELSE 'over_90'::text
        END AS bucket
    FROM ledger_entries le
    WHERE le.debit > 0
), 
bucketed_totals AS (
    SELECT 
        pd.organization_id,
        pd.contact_id,
        sum(CASE WHEN pd.bucket = 'current' THEN pd.amount ELSE 0 END) AS bucket_0_30,
        sum(CASE WHEN pd.bucket = '30_60' THEN pd.amount ELSE 0 END) AS bucket_31_60,
        sum(CASE WHEN pd.bucket = '60_90' THEN pd.amount ELSE 0 END) AS bucket_61_90,
        sum(CASE WHEN pd.bucket = 'over_90' THEN pd.amount ELSE 0 END) AS bucket_90_plus
    FROM party_debits pd
    GROUP BY pd.organization_id, pd.contact_id
)
SELECT 
    vb.organization_id,
    vb.contact_id,
    vb.contact_name,
    vb.net_balance,
    COALESCE(bt.bucket_0_30, 0) AS bucket_0_30,
    COALESCE(bt.bucket_31_60, 0) AS bucket_31_60,
    COALESCE(bt.bucket_61_90, 0) AS bucket_61_90,
    COALESCE(bt.bucket_90_plus, 0) AS bucket_90_plus
FROM view_party_balances vb
LEFT JOIN bucketed_totals bt ON vb.contact_id = bt.contact_id
WHERE vb.net_balance > 0;
