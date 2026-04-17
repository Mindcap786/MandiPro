-- Migration: Update view_party_balances with city and phone (DROP/CREATE)
-- Date: 2026-02-19
-- Author: Antigravity

DROP VIEW IF EXISTS view_party_balances;

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
