-- Migration: 20260501020000_stock_operations_v3.sql
-- Description: Robust Stock Operations (Damage, Transfer, Return) with Financial Integration in mandi schema.

BEGIN;

-- 1. Financial-Integrated Damage Recording v3
CREATE OR REPLACE FUNCTION mandi.record_lot_damage_v3(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_reason TEXT,
    p_damage_date DATE DEFAULT CURRENT_DATE,
    p_loss_borne_by TEXT DEFAULT 'mandi' -- 'mandi' or 'supplier'
) RETURNS JSONB AS $$
DECLARE
    v_lot RECORD;
    v_damage_id UUID;
    v_damage_value NUMERIC;
    v_voucher_id UUID;
    v_debit_account_id UUID;
    v_inventory_account_id UUID;
    v_narration TEXT;
BEGIN
    -- 1. Get Lot Details
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;
    IF v_lot.current_qty < p_qty THEN RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_lot.current_qty, p_qty; END IF;

    -- 2. Record Damage Entry
    INSERT INTO mandi.damages (organization_id, lot_id, qty, reason, damage_date, metadata)
    VALUES (p_organization_id, p_lot_id, p_qty, p_reason, p_damage_date, jsonb_build_object('loss_borne_by', p_loss_borne_by))
    RETURNING id INTO v_damage_id;

    -- Reduce Stock
    UPDATE mandi.lots 
    SET current_qty = current_qty - p_qty,
        updated_at = NOW()
    WHERE id = p_lot_id;

    -- 3. Financial Integration
    v_damage_value := p_qty * COALESCE(v_lot.supplier_rate, 0);
    
    -- Inventory/Purchase Account (CR side - reducing asset/expense)
    SELECT id INTO v_inventory_account_id FROM mandi.accounts 
    WHERE organization_id = p_organization_id AND code = '4001' 
    LIMIT 1;

    IF p_loss_borne_by = 'supplier' THEN
        -- DR Supplier Account (Reduce Payable)
        v_debit_account_id := v_lot.contact_id;
        v_narration := 'Stock Damage (Supplier Borne): ' || p_reason || ' (Lot: ' || v_lot.lot_code || ')';
    ELSE
        -- DR Loss/Wastage Account (Increase Expense)
        SELECT id INTO v_debit_account_id FROM mandi.accounts 
        WHERE organization_id = p_organization_id AND (name ILIKE '%wastage%' OR name ILIKE '%loss%') 
        LIMIT 1;
        
        IF v_debit_account_id IS NULL THEN
            SELECT id INTO v_debit_account_id FROM mandi.accounts 
            WHERE organization_id = p_organization_id AND type = 'expense' 
            LIMIT 1;
        END IF;
        v_narration := 'Inventory Loss: ' || p_reason || ' (Lot: ' || v_lot.lot_code || ')';
    END IF;

    IF v_damage_value > 0 AND v_debit_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
        -- Create Voucher
        INSERT INTO mandi.vouchers (organization_id, date, type, narration, amount, contact_id)
        VALUES (p_organization_id, p_damage_date, 'adjustment', v_narration, v_damage_value, CASE WHEN p_loss_borne_by = 'supplier' THEN v_lot.contact_id ELSE NULL END)
        RETURNING id INTO v_voucher_id;

        -- Debit (Loss or Supplier)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_debit_account_id, v_damage_value, 0, p_damage_date, v_narration);

        -- Credit Purchases (Reduction)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_inventory_account_id, 0, v_damage_value, p_damage_date, 'Inventory Reduction (Damage)');
    END IF;

    -- 4. Log to Stock Ledger
    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'damage', -p_qty, v_damage_id);

    RETURN jsonb_build_object('success', true, 'damage_id', v_damage_id, 'voucher_id', v_voucher_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Optimized Transfer with Lot Splitting v3
CREATE OR REPLACE FUNCTION mandi.transfer_stock_v3(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_from_location TEXT,
    p_to_location TEXT
) RETURNS JSONB AS $$
DECLARE
    v_source_lot RECORD;
    v_new_lot_id UUID;
    v_new_lot_code TEXT;
BEGIN
    -- 1. Get Source Lot
    SELECT * INTO v_source_lot FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_source_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;
    IF v_source_lot.current_qty < p_qty THEN RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_source_lot.current_qty, p_qty; END IF;

    -- 2. Handle Transfer
    IF v_source_lot.current_qty = p_qty THEN
        -- Full Transfer: Just update location
        UPDATE mandi.lots 
        SET storage_location = p_to_location,
            updated_at = NOW()
        WHERE id = p_lot_id;
        v_new_lot_id := p_lot_id;
    ELSE
        -- Partial Transfer: Split the lot
        v_new_lot_code := v_source_lot.lot_code || '-T' || floor(random() * 1000);
        
        INSERT INTO mandi.lots (
            organization_id, contact_id, arrival_id, item_id, 
            lot_code, initial_qty, current_qty, unit, 
            supplier_rate, commission_percent, arrival_type, status,
            storage_location, created_by, created_at, mfg_date, expiry_date
        ) VALUES (
            v_source_lot.organization_id, v_source_lot.contact_id, v_source_lot.arrival_id, v_source_lot.item_id,
            v_new_lot_code, p_qty, p_qty, v_source_lot.unit,
            v_source_lot.supplier_rate, v_source_lot.commission_percent, v_source_lot.arrival_type, v_source_lot.status,
            p_to_location, v_source_lot.created_by, v_source_lot.created_at, v_source_lot.mfg_date, v_source_lot.expiry_date
        ) RETURNING id INTO v_new_lot_id;

        -- Reduce Source Lot
        UPDATE mandi.lots SET current_qty = current_qty - p_qty, updated_at = NOW() WHERE id = p_lot_id;
    END IF;

    -- 3. Log to Stock Ledger
    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, source_location, destination_location)
    VALUES (p_organization_id, v_new_lot_id, 'transfer', 0, p_from_location, p_to_location);

    RETURN jsonb_build_object('success', true, 'lot_id', v_new_lot_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Purchase Return Process
CREATE OR REPLACE FUNCTION mandi.process_purchase_return(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_rate NUMERIC,
    p_remarks TEXT,
    p_return_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_lot RECORD;
    v_return_id UUID;
    v_return_value NUMERIC;
    v_voucher_id UUID;
    v_inventory_account_id UUID;
BEGIN
    -- 1. Get Lot Details
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;
    IF v_lot.current_qty < p_qty THEN RAISE EXCEPTION 'Insufficient stock for return.'; END IF;

    -- 2. Record Return
    INSERT INTO mandi.purchase_returns (organization_id, lot_id, qty, rate, remarks, return_date)
    VALUES (p_organization_id, p_lot_id, p_qty, p_rate, p_remarks, p_return_date)
    RETURNING id INTO v_return_id;

    -- Reduce Stock
    UPDATE mandi.lots SET current_qty = current_qty - p_qty, updated_at = NOW() WHERE id = p_lot_id;

    -- 3. Financial Integration
    v_return_value := p_qty * p_rate;
    
    -- Find Inventory/Purchase Account
    SELECT id INTO v_inventory_account_id FROM mandi.accounts 
    WHERE organization_id = p_organization_id AND code = '4001' 
    LIMIT 1;

    IF v_return_value > 0 AND v_inventory_account_id IS NOT NULL AND v_lot.contact_id IS NOT NULL THEN
        -- Create Debit Note Voucher
        INSERT INTO mandi.vouchers (organization_id, date, type, narration, amount, contact_id)
        VALUES (p_organization_id, p_return_date, 'debit_note', 'Purchase Return: ' || p_remarks || ' (Lot: ' || v_lot.lot_code || ')', v_return_value, v_lot.contact_id)
        RETURNING id INTO v_voucher_id;

        -- Debit Supplier (Reduce Payable)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_lot.contact_id, v_return_value, 0, p_return_date, 'Purchase Return (Debit Note)');

        -- Credit Purchases (Reduce Expense/Asset)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_inventory_account_id, 0, v_return_value, p_return_date, 'Inventory Credit (Return)');
    END IF;

    -- 4. Log to Stock Ledger
    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'return', -p_qty, v_return_id);

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id, 'voucher_id', v_voucher_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mandi.record_lot_damage_v3(UUID, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.transfer_stock_v3(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mandi.process_purchase_return(UUID, UUID, NUMERIC, NUMERIC, TEXT, DATE) TO authenticated, service_role;

COMMIT;
