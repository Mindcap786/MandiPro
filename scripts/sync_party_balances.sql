-- Emergency Financial Summary Sync v3
-- This script rebuilds the party_daily_balances summary table from the source-of-truth ledger_entries.
-- Fixed: Added filter to exclude any ledger entries with NULL contact_id.

BEGIN;

DELETE FROM mandi.party_daily_balances;

INSERT INTO mandi.party_daily_balances (
    contact_id,
    organization_id,
    summary_date,
    total_debit,
    total_credit,
    created_at,
    updated_at
)
SELECT
    contact_id,
    organization_id,
    entry_date::date AS summary_date,
    SUM(debit) AS total_debit,
    SUM(credit) AS total_credit,
    NOW(),
    NOW()
FROM mandi.ledger_entries
WHERE contact_id IS NOT NULL
GROUP BY contact_id, organization_id, entry_date::date;

COMMIT;

-- Verify Ahamed's balance after sync
-- ahamed id: 0a522199-375f-4888-a03b-6044a9d5d151
SELECT 
    contact_name, 
    net_balance 
FROM mandi.view_party_balances 
WHERE contact_id = '0a522199-375f-4888-a03b-6044a9d5d151';
