-- ============================================================
-- FIX 2: Rollup Trigger NULL-Status Fix
-- Migration: 20260412_rollup_trigger_null_fix.sql
--
-- PROBLEM: The rollup trigger only fires when status = 'active'.
-- New ledger entries inserted without a status (NULL) are never
-- counted in party_daily_balances, causing Finance Overview to
-- show stale/zero balances.
--
-- SOLUTION:
--   A. Set default status = 'active' on ledger_entries so all
--      new inserts are always 'active'.
--   B. Backfill existing NULL-status entries to 'active'.
--   C. Rebuild the rollup from scratch to catch everything.
-- ============================================================

-- A. Set column default so all future inserts default to 'active'
ALTER TABLE mandi.ledger_entries
    ALTER COLUMN status SET DEFAULT 'active';

-- B. Backfill existing NULL-status entries
UPDATE mandi.ledger_entries
SET status = 'active'
WHERE status IS NULL;

-- C. Rebuild trigger function to handle both NULL and 'active'
CREATE OR REPLACE FUNCTION mandi.refresh_daily_balances()
RETURNS TRIGGER AS $$
BEGIN
    -- INSERT: always update rollup (status defaults to 'active' now)
    IF TG_OP = 'INSERT' THEN
        IF NEW.account_id IS NOT NULL AND COALESCE(NEW.debit, 0) + COALESCE(NEW.credit, 0) > 0 THEN
            INSERT INTO mandi.account_daily_balances
                (organization_id, account_id, summary_date, total_debit, total_credit)
            VALUES
                (NEW.organization_id, NEW.account_id, NEW.entry_date::DATE,
                 COALESCE(NEW.debit, 0), COALESCE(NEW.credit, 0))
            ON CONFLICT (organization_id, account_id, summary_date)
            DO UPDATE SET
                total_debit  = mandi.account_daily_balances.total_debit  + EXCLUDED.total_debit,
                total_credit = mandi.account_daily_balances.total_credit + EXCLUDED.total_credit,
                updated_at   = NOW();
        END IF;

        IF NEW.contact_id IS NOT NULL AND COALESCE(NEW.debit, 0) + COALESCE(NEW.credit, 0) > 0 THEN
            INSERT INTO mandi.party_daily_balances
                (organization_id, contact_id, summary_date, total_debit, total_credit)
            VALUES
                (NEW.organization_id, NEW.contact_id, NEW.entry_date::DATE,
                 COALESCE(NEW.debit, 0), COALESCE(NEW.credit, 0))
            ON CONFLICT (organization_id, contact_id, summary_date)
            DO UPDATE SET
                total_debit  = mandi.party_daily_balances.total_debit  + EXCLUDED.total_debit,
                total_credit = mandi.party_daily_balances.total_credit + EXCLUDED.total_credit,
                updated_at   = NOW();
        END IF;
    END IF;

    -- UPDATE: reverse old values and apply new (handles status changes AND amount edits)
    IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status = 'reversed' THEN
        IF NEW.account_id IS NOT NULL THEN
            UPDATE mandi.account_daily_balances SET
                total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                updated_at   = NOW()
            WHERE organization_id = NEW.organization_id
              AND account_id      = NEW.account_id
              AND summary_date    = NEW.entry_date::DATE;
        END IF;

        IF NEW.contact_id IS NOT NULL THEN
            UPDATE mandi.party_daily_balances SET
                total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                updated_at   = NOW()
            WHERE organization_id = NEW.organization_id
              AND contact_id      = NEW.contact_id
              AND summary_date    = NEW.entry_date::DATE;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. Rebuild rollup tables from scratch to catch all previously missed entries
TRUNCATE mandi.account_daily_balances;
TRUNCATE mandi.party_daily_balances;

INSERT INTO mandi.account_daily_balances
    (organization_id, account_id, summary_date, total_debit, total_credit)
SELECT
    organization_id,
    account_id,
    entry_date::DATE,
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
FROM mandi.ledger_entries
WHERE account_id IS NOT NULL
GROUP BY organization_id, account_id, entry_date::DATE
ON CONFLICT (organization_id, account_id, summary_date)
DO UPDATE SET
    total_debit  = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at   = NOW();

INSERT INTO mandi.party_daily_balances
    (organization_id, contact_id, summary_date, total_debit, total_credit)
SELECT
    organization_id,
    contact_id,
    entry_date::DATE,
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
FROM mandi.ledger_entries
WHERE contact_id IS NOT NULL
GROUP BY organization_id, contact_id, entry_date::DATE
ON CONFLICT (organization_id, contact_id, summary_date)
DO UPDATE SET
    total_debit  = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at   = NOW();
