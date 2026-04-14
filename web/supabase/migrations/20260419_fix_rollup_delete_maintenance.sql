-- ============================================================
-- FIX: Rollup Trigger Missing DELETE Support
-- Migration: 20260419_fix_rollup_delete_maintenance.sql
--
-- PROBLEM: The mandi.refresh_daily_balances trigger did not handle
-- TG_OP = 'DELETE'. When purchase bills were edited, the old ledger
-- entries were deleted and new ones inserted. The deletes were ignored
-- by the rollup, but the inserts were added, causing balances to endlessly inflate.
--
-- SOLUTION:
--   A. Update mandi.refresh_daily_balances to reverse totals on DELETE.
--   B. Add the AFTER DELETE trigger to mandi.ledger_entries.
--   C. Rebuild the rollup tables to permanently fix any corrupted balances.
-- ============================================================

CREATE OR REPLACE FUNCTION mandi.refresh_daily_balances()
RETURNS TRIGGER AS $$
BEGIN
    -- INSERT: add new values
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

    -- DELETE: subtract old values
    IF TG_OP = 'DELETE' THEN
        IF OLD.account_id IS NOT NULL THEN
            UPDATE mandi.account_daily_balances SET
                total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                updated_at   = NOW()
            WHERE organization_id = OLD.organization_id
              AND account_id      = OLD.account_id
              AND summary_date    = OLD.entry_date::DATE;
        END IF;

        IF OLD.contact_id IS NOT NULL THEN
            UPDATE mandi.party_daily_balances SET
                total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                updated_at   = NOW()
            WHERE organization_id = OLD.organization_id
              AND contact_id      = OLD.contact_id
              AND summary_date    = OLD.entry_date::DATE;
        END IF;
    END IF;

    -- UPDATE: reverse old values and apply new (handles status changes AND amount edits)
    IF TG_OP = 'UPDATE' THEN
        -- If status changed to reversed, only subtract OLD values
        IF OLD.status = 'active' AND NEW.status = 'reversed' THEN
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
        ELSE 
            -- For regular updates (amounts changed, date changed, etc.)
            -- We subtract OLD completely and add NEW.
            -- This is safer than trying to calculate delta, especially if dates or accounts changed.
            
            -- 1. Reverse OLD
            IF OLD.account_id IS NOT NULL THEN
                UPDATE mandi.account_daily_balances SET
                    total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                    total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                    updated_at   = NOW()
                WHERE organization_id = OLD.organization_id
                  AND account_id      = OLD.account_id
                  AND summary_date    = OLD.entry_date::DATE;
            END IF;

            IF OLD.contact_id IS NOT NULL THEN
                UPDATE mandi.party_daily_balances SET
                    total_debit  = GREATEST(total_debit  - COALESCE(OLD.debit, 0),  0),
                    total_credit = GREATEST(total_credit - COALESCE(OLD.credit, 0), 0),
                    updated_at   = NOW()
                WHERE organization_id = OLD.organization_id
                  AND contact_id      = OLD.contact_id
                  AND summary_date    = OLD.entry_date::DATE;
            END IF;

            -- 2. Apply NEW
            IF NEW.account_id IS NOT NULL AND NEW.status = 'active' THEN
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

            IF NEW.contact_id IS NOT NULL AND NEW.status = 'active' THEN
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
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Attach the DELETE trigger
DROP TRIGGER IF EXISTS tg_refresh_daily_balances_delete ON mandi.ledger_entries;
CREATE TRIGGER tg_refresh_daily_balances_delete
AFTER DELETE ON mandi.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION mandi.refresh_daily_balances();

-- C. Rebuild the rollup tables
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
WHERE account_id IS NOT NULL AND status = 'active'
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
WHERE contact_id IS NOT NULL AND status = 'active'
GROUP BY organization_id, contact_id, entry_date::DATE
ON CONFLICT (organization_id, contact_id, summary_date)
DO UPDATE SET
    total_debit  = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at   = NOW();
