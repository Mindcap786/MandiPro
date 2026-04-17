-- Migration: Daily Financial Rollups
-- Descriptions: Creates account_daily_balances and party_daily_balances mapping tables with auto-refresh triggers for faster aggregate dashboard rendering.

CREATE TABLE IF NOT EXISTS mandi.account_daily_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES mandi.accounts(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    total_debit DECIMAL(15,2) DEFAULT 0,
    total_credit DECIMAL(15,2) DEFAULT 0,
    net_movement DECIMAL(15,2) GENERATED ALWAYS AS (total_debit - total_credit) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, account_id, summary_date)
);

CREATE TABLE IF NOT EXISTS mandi.party_daily_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES mandi.contacts(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    total_debit DECIMAL(15,2) DEFAULT 0,
    total_credit DECIMAL(15,2) DEFAULT 0,
    net_movement DECIMAL(15,2) GENERATED ALWAYS AS (total_debit - total_credit) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, contact_id, summary_date)
);

-- RLS
ALTER TABLE mandi.account_daily_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandi.party_daily_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_account_daily_balances" ON mandi.account_daily_balances FOR ALL
USING (organization_id = core.get_my_org_id())
WITH CHECK (organization_id = core.get_my_org_id());

CREATE POLICY "tenant_isolation_party_daily_balances" ON mandi.party_daily_balances FOR ALL
USING (organization_id = core.get_my_org_id())
WITH CHECK (organization_id = core.get_my_org_id());

-- Seed Historic Data
INSERT INTO mandi.account_daily_balances (organization_id, account_id, summary_date, total_debit, total_credit)
SELECT organization_id, account_id, entry_date::DATE, SUM(debit), SUM(credit)
FROM mandi.ledger_entries
WHERE status = 'active' AND account_id IS NOT NULL
GROUP BY organization_id, account_id, entry_date::DATE
ON CONFLICT (organization_id, account_id, summary_date)
DO UPDATE SET
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at = NOW();

INSERT INTO mandi.party_daily_balances (organization_id, contact_id, summary_date, total_debit, total_credit)
SELECT organization_id, contact_id, entry_date::DATE, SUM(debit), SUM(credit)
FROM mandi.ledger_entries
WHERE status = 'active' AND contact_id IS NOT NULL
GROUP BY organization_id, contact_id, entry_date::DATE
ON CONFLICT (organization_id, contact_id, summary_date)
DO UPDATE SET
    total_debit = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    updated_at = NOW();

-- Trigger Logic
CREATE OR REPLACE FUNCTION mandi.refresh_daily_balances()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT (Active new entries)
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        IF NEW.account_id IS NOT NULL THEN
            INSERT INTO mandi.account_daily_balances (organization_id, account_id, summary_date, total_debit, total_credit)
            VALUES (NEW.organization_id, NEW.account_id, NEW.entry_date::DATE, NEW.debit, NEW.credit)
            ON CONFLICT (organization_id, account_id, summary_date) 
            DO UPDATE SET 
                total_debit = mandi.account_daily_balances.total_debit + EXCLUDED.total_debit,
                total_credit = mandi.account_daily_balances.total_credit + EXCLUDED.total_credit,
                updated_at = NOW();
        END IF;

        IF NEW.contact_id IS NOT NULL THEN
            INSERT INTO mandi.party_daily_balances (organization_id, contact_id, summary_date, total_debit, total_credit)
            VALUES (NEW.organization_id, NEW.contact_id, NEW.entry_date::DATE, NEW.debit, NEW.credit)
            ON CONFLICT (organization_id, contact_id, summary_date) 
            DO UPDATE SET 
                total_debit = mandi.party_daily_balances.total_debit + EXCLUDED.total_debit,
                total_credit = mandi.party_daily_balances.total_credit + EXCLUDED.total_credit,
                updated_at = NOW();
        END IF;
    END IF;

    -- Handle UPDATE (when an entry's status becomes 'reversed')
    IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status = 'reversed' THEN
        IF NEW.account_id IS NOT NULL THEN
            UPDATE mandi.account_daily_balances SET
                total_debit = total_debit - NEW.debit,
                total_credit = total_credit - NEW.credit,
                updated_at = NOW()
            WHERE organization_id = NEW.organization_id 
            AND account_id = NEW.account_id
            AND summary_date = NEW.entry_date::DATE;
        END IF;

        IF NEW.contact_id IS NOT NULL THEN
            UPDATE mandi.party_daily_balances SET
                total_debit = total_debit - NEW.debit,
                total_credit = total_credit - NEW.credit,
                updated_at = NOW()
            WHERE organization_id = NEW.organization_id 
            AND contact_id = NEW.contact_id
            AND summary_date = NEW.entry_date::DATE;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tg_refresh_daily_balances_insert ON mandi.ledger_entries;
CREATE TRIGGER tg_refresh_daily_balances_insert
AFTER INSERT ON mandi.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION mandi.refresh_daily_balances();

DROP TRIGGER IF EXISTS tg_refresh_daily_balances_update ON mandi.ledger_entries;
CREATE TRIGGER tg_refresh_daily_balances_update
AFTER UPDATE ON mandi.ledger_entries
FOR EACH ROW
WHEN (OLD.status = 'active' AND NEW.status = 'reversed')
EXECUTE FUNCTION mandi.refresh_daily_balances();
