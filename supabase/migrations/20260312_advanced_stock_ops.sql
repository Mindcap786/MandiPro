-- Advanced Stock Operations: Lot Splitting and Financial Accounting
-- Date: 2026-03-12

-- 1. Optimized Transfer with Lot Splitting
CREATE OR REPLACE FUNCTION public.transfer_stock_v3(
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
    -- 1. Get Source Lot Details
    SELECT * INTO v_source_lot
    FROM lots
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    IF v_source_lot IS NULL THEN
        RAISE EXCEPTION 'Lot not found';
    END IF;

    IF v_source_lot.current_qty < p_qty THEN
        RAISE EXCEPTION 'Insufficient quantity. Available: %, Requested: %', v_source_lot.current_qty, p_qty;
    END IF;

    -- 2. Handle Transfer
    IF v_source_lot.current_qty = p_qty THEN
        -- Full Transfer: Just update location
        UPDATE lots 
        SET storage_location = p_to_location
        WHERE id = p_lot_id;
        
        v_new_lot_id := p_lot_id;
    ELSE
        -- Partial Transfer: Split the lot
        v_new_lot_code := v_source_lot.lot_code || '-' || p_to_location || '-T' || floor(random() * 100);
        
        INSERT INTO lots (
            organization_id, 
            contact_id, 
            item_id, 
            lot_code, 
            initial_qty, 
            current_qty, 
            unit, 
            supplier_rate, 
            arrival_type, 
            storage_location, 
            shelf_life_days, 
            critical_age_days,
            created_at,
            mfg_date,
            expiry_date
        ) VALUES (
            v_source_lot.organization_id, 
            v_source_lot.contact_id, 
            v_source_lot.item_id, 
            v_new_lot_code,
            p_qty, 
            p_qty, 
            v_source_lot.unit, 
            v_source_lot.supplier_rate,
            v_source_lot.arrival_type, 
            p_to_location, 
            v_source_lot.shelf_life_days, 
            v_source_lot.critical_age_days,
            v_source_lot.created_at, -- Keep original creation date for age tracking
            v_source_lot.mfg_date,
            v_source_lot.expiry_date
        )
        RETURNING id INTO v_new_lot_id;

        -- Reduce Source Lot Qty
        UPDATE lots
        SET current_qty = current_qty - p_qty
        WHERE id = p_lot_id;
    END IF;

    -- 3. Log to Stock Ledger
    INSERT INTO stock_ledger (
        organization_id, 
        lot_id, 
        transaction_type, 
        qty_change, 
        source_location, 
        destination_location
    ) VALUES (
        p_organization_id, 
        v_new_lot_id, 
        'transfer', 
        0, 
        p_from_location, 
        p_to_location
    );

    RETURN jsonb_build_object('success', true, 'lot_id', v_new_lot_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Financial-Integrated Damage Recording
CREATE OR REPLACE FUNCTION public.record_lot_damage_v2(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_reason TEXT,
    p_damage_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_lot RECORD;
    v_damage_id UUID;
    v_damage_value NUMERIC;
    v_voucher_id UUID;
    v_loss_account_id UUID;
    v_inventory_account_id UUID;
BEGIN
    -- 1. Get Lot Details
    SELECT * INTO v_lot FROM lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;

    -- 2. Record Damage
    INSERT INTO damages (organization_id, lot_id, qty, reason, damage_date)
    VALUES (p_organization_id, p_lot_id, p_qty, p_reason, p_damage_date)
    RETURNING id INTO v_damage_id;

    -- Reduce Stock
    UPDATE lots SET current_qty = current_qty - p_qty WHERE id = p_lot_id;

    -- 3. Financial Integration (Only for Direct Purchase)
    IF v_lot.arrival_type = 'direct' THEN
        v_damage_value := p_qty * COALESCE(v_lot.supplier_rate, 0);
        
        -- Find Accounts
        -- Loss Account (Expense)
        SELECT id INTO v_loss_account_id FROM accounts 
        WHERE organization_id = p_organization_id AND (name ILIKE '%wastage%' OR name ILIKE '%loss%') 
        LIMIT 1;
        
        IF v_loss_account_id IS NULL THEN
            SELECT id INTO v_loss_account_id FROM accounts 
            WHERE organization_id = p_organization_id AND type = 'expense' 
            LIMIT 1;
        END IF;

        -- Purchase Account (Asset/Expense to reduce)
        SELECT id INTO v_inventory_account_id FROM accounts 
        WHERE organization_id = p_organization_id AND code = '4001' 
        LIMIT 1;

        IF v_damage_value > 0 AND v_loss_account_id IS NOT NULL THEN
            -- Create Voucher
            INSERT INTO vouchers (organization_id, date, type, narration, amount)
            VALUES (p_organization_id, p_damage_date, 'adjustment', 'Inventory Loss: ' || p_reason || ' (Lot: ' || v_lot.lot_code || ')', v_damage_value)
            RETURNING id INTO v_voucher_id;

            -- Debit Loss (Increase Expense)
            INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
            VALUES (p_organization_id, v_voucher_id, v_loss_account_id, v_damage_value, 0, p_damage_date, 'Stock Wastage Loss');

            -- Credit Purchases (Reduce Inventory/Expense)
            IF v_inventory_account_id IS NOT NULL THEN
                INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
                VALUES (p_organization_id, v_voucher_id, v_inventory_account_id, 0, v_damage_value, p_damage_date, 'Inventory Reduction');
            END IF;
        END IF;
    END IF;

    -- 4. Log to Stock Ledger
    INSERT INTO stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'damage', -p_qty, v_damage_id);

    RETURN jsonb_build_object('success', true, 'damage_id', v_damage_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
