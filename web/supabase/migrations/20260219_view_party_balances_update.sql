-- Migration: Update view_party_balances to include city and phone
-- Date: 2026-02-19
-- Author: Antigravity

CREATE OR REPLACE VIEW view_party_balances AS
SELECT 
    l.contact_id,
    c.name AS contact_name,
    c.type AS contact_type,
    c.city,      -- Removed alias "contact_city" to match component expectation
    c.phone,     -- Added phone number
    c.credit_limit,
    SUM(l.debit - l.credit) AS net_balance,
    MAX(l.entry_date) AS last_transaction_date,
    l.organization_id
FROM ledger_entries l
JOIN contacts c ON l.contact_id = c.id
GROUP BY l.contact_id, c.name, c.type, c.city, c.phone, c.credit_limit, l.organization_id;
