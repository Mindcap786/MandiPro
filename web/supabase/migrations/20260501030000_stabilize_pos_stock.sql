-- Migration: 20260501030000_stabilize_pos_stock.sql
-- Description: Fixes POS validation, Account deletion constraints, and Seeds Storage Locations.

BEGIN;

-- 1. Relax Ledger Reference Validation
-- For 'receipt' types, allow reference_id to be either a Voucher ID or a Sale ID.
CREATE OR REPLACE FUNCTION mandi.validate_ledger_references()
RETURNS TRIGGER AS $$
DECLARE
    v_reference_exists BOOLEAN;
BEGIN
    -- Skip validation for certain types
    IF NEW.transaction_type IN ('adjustment', 'opening_balance', 'closing_entry', 'damage', 'transfer', 'return') THEN
        RETURN NEW;
    END IF;

    -- VALIDATION 1: Sales/Goods must have valid reference
    IF NEW.transaction_type IN ('sale', 'goods') THEN
        SELECT EXISTS(SELECT 1 FROM mandi.sales WHERE id = NEW.reference_id)
        INTO v_reference_exists;
        
        IF NOT v_reference_exists THEN
            RAISE EXCEPTION 'INVALID_REFERENCE: Sale ID % does not exist', NEW.reference_id;
        END IF;
    END IF;

    -- VALIDATION 2: Arrival must have valid reference
    IF NEW.transaction_type IN ('goods_arrival', 'purchase') THEN
        SELECT EXISTS(SELECT 1 FROM mandi.arrivals WHERE id = NEW.reference_id)
        INTO v_reference_exists;
        
        IF NOT v_reference_exists THEN
            RAISE EXCEPTION 'INVALID_REFERENCE: Arrival ID % does not exist', NEW.reference_id;
        END IF;
    END IF;

    -- VALIDATION 3: Receipt must have valid voucher OR sale reference
    IF NEW.transaction_type = 'receipt' THEN
        SELECT EXISTS(
            SELECT 1 FROM mandi.vouchers WHERE id = NEW.reference_id
            UNION ALL
            SELECT 1 FROM mandi.sales WHERE id = NEW.reference_id
        ) INTO v_reference_exists;
        
        IF NOT v_reference_exists THEN
            RAISE EXCEPTION 'INVALID_REFERENCE: Receipt Source (Voucher/Sale) ID % does not exist', NEW.reference_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix Account Deletion Foreign Key
-- Change lots_advance_bank_account_id_fkey to ON DELETE SET NULL
ALTER TABLE mandi.lots DROP CONSTRAINT IF EXISTS lots_advance_bank_account_id_fkey;
ALTER TABLE mandi.lots ADD CONSTRAINT lots_advance_bank_account_id_fkey 
    FOREIGN KEY (advance_bank_account_id) REFERENCES mandi.accounts(id) ON DELETE SET NULL;

-- 3. Seed Storage Locations for all Organizations
INSERT INTO mandi.storage_locations (organization_id, name, location_type, is_active)
SELECT DISTINCT organization_id, 'Mandi', 'warehouse', true
FROM core.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM mandi.storage_locations sl 
    WHERE sl.organization_id = o.id AND sl.name = 'Mandi'
);

INSERT INTO mandi.storage_locations (organization_id, name, location_type, is_active)
SELECT DISTINCT organization_id, 'Cold Storage', 'warehouse', true
FROM core.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM mandi.storage_locations sl 
    WHERE sl.organization_id = o.id AND sl.name = 'Cold Storage'
);

-- 4. Re-sync Ledger Trigger (if missing)
DROP TRIGGER IF EXISTS trg_validate_ledger_references ON mandi.ledger_entries;
CREATE TRIGGER trg_validate_ledger_references
    BEFORE INSERT OR UPDATE ON mandi.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION mandi.validate_ledger_references();

COMMIT;
