-- ============================================================
-- DECOUPLE PURCHASE AND SALE ACCOUNTING (FINANCIAL GROUND TRUTH)
-- Migration: 20260422130000_decouple_purchase_sale_ledgers.sql
-- ============================================================

BEGIN;

-- 1. Add 'Ground Truth' columns to mandi.lots
ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS settlement_goods_value NUMERIC,
    ADD COLUMN IF NOT EXISTS settlement_commission NUMERIC,
    ADD COLUMN IF NOT EXISTS settlement_expenses NUMERIC,
    ADD COLUMN IF NOT EXISTS settlement_net_payable NUMERIC,
    ADD COLUMN IF NOT EXISTS settlement_at TIMESTAMPTZ;

-- 2. Improved Function to calculate bill components (Pure Logic)
CREATE OR REPLACE FUNCTION mandi.calculate_lot_settlement(p_lot_id UUID)
RETURNS TABLE (
    goods_value NUMERIC,
    commission_amount NUMERIC,
    recovery_amount NUMERIC,
    net_payable NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot RECORD;
    v_effective_qty NUMERIC;
    v_sales_sum NUMERIC;
    v_goods_value NUMERIC;
    v_commission NUMERIC;
    v_recovery NUMERIC;
    v_arrival_type TEXT;
BEGIN
    SELECT l.*, COALESCE(a.arrival_type, 'direct') as res_arrival_type
    INTO v_lot
    FROM mandi.lots l
    LEFT JOIN mandi.arrivals a ON a.id = l.arrival_id
    WHERE l.id = p_lot_id;

    IF NOT FOUND THEN RETURN; END IF;

    v_arrival_type := v_lot.res_arrival_type;

    -- Calculate Effective Qty (Initial - Less)
    v_effective_qty := GREATEST(
        CASE
            WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0)
            ELSE COALESCE(v_lot.initial_qty, 0) * (1 - COALESCE(v_lot.less_percent, 0) / 100.0)
        END,
        0
    );

    -- For Commission arrivals, goods value comes from SALES if available
    IF v_arrival_type IN ('commission', 'farmer', 'supplier') THEN
        SELECT SUM(amount) INTO v_sales_sum FROM mandi.sale_items WHERE lot_id = p_lot_id;
        v_goods_value := COALESCE(v_sales_sum, ROUND(v_effective_qty * COALESCE(v_lot.supplier_rate, 0), 2));
    ELSE
        v_goods_value := ROUND(v_effective_qty * COALESCE(v_lot.supplier_rate, 0), 2);
    END IF;

    v_commission := ROUND(v_goods_value * COALESCE(v_lot.commission_percent, 0) / 100.0, 2);
    v_recovery := ROUND(
        COALESCE(v_lot.farmer_charges, 0) + 
        COALESCE(v_lot.loading_cost, 0) + 
        COALESCE(v_lot.packing_cost, 0), 
        2
    );

    RETURN QUERY SELECT 
        v_goods_value,
        v_commission,
        v_recovery,
        GREATEST(v_goods_value - v_commission - v_recovery, 0);
END;
$$;

-- 3. Robust post_arrival_ledger (The Standardizer)
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_comp RECORD;
    v_org_id UUID;
    v_voucher_id UUID;
    
    v_goods_total NUMERIC := 0;
    v_comm_total NUMERIC := 0;
    v_recovery_total NUMERIC := 0;
    v_net_payable_total NUMERIC := 0;
    v_header_expenses NUMERIC := 0;
    
    -- Accounts
    v_pur_acc_id UUID;
    v_pay_acc_id UUID;
    v_comm_acc_id UUID;
    v_exp_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id_header UUID;
    
    v_narration TEXT;
    v_item_summary TEXT;
BEGIN
    -- 1. Fetch Arrival Header
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;
    
    v_org_id := v_arrival.organization_id;
    v_header_expenses := COALESCE(v_arrival.transport_amount,0) + COALESCE(v_arrival.loading_amount,0) + COALESCE(v_arrival.packing_amount,0) + COALESCE(v_arrival.hamali_expenses,0) + COALESCE(v_arrival.other_expenses,0);

    -- 2. Process Lots & Lock Ground Truth
    FOR v_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        SELECT * INTO v_comp FROM mandi.calculate_lot_settlement(v_lot.id);
        
        -- LOCK the values
        UPDATE mandi.lots SET
            settlement_goods_value = v_comp.goods_value,
            settlement_commission = v_comp.commission_amount,
            settlement_expenses = v_comp.recovery_amount,
            settlement_net_payable = v_comp.net_payable,
            settlement_at = NOW(),
            -- Sync existing columns
            net_payable = v_comp.net_payable
        WHERE id = v_lot.id;
        
        v_goods_total := v_goods_total + v_comp.goods_value;
        v_comm_total := v_comm_total + v_comp.commission_amount;
        v_recovery_total := v_recovery_total + v_comp.recovery_amount;
        v_net_payable_total := v_net_payable_total + v_comp.net_payable;
    END LOOP;

    -- Adjust header level expenses
    v_net_payable_total := v_net_payable_total - v_header_expenses;

    -- 3. Cleanup existing ledger/vouchers for this arrival
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type IN ('purchase', 'purchase_payment', 'arrival', 'arrival_advance');
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type IN ('purchase', 'arrival');

    -- 4. Map Accounts
    SELECT id INTO v_pur_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Purchase%' OR code = '5001') LIMIT 1;
    SELECT id INTO v_pay_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Payable%' OR code = '2100') LIMIT 1;
    SELECT id INTO v_comm_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Commission Income%' OR code = '4100') LIMIT 1;
    SELECT id INTO v_exp_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Recovery%' OR name ILIKE '%Expenses%' OR code = '4200') LIMIT 1;

    -- 5. Create Voucher
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || initial_qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary FROM mandi.lots l JOIN mandi.commodities c ON c.id = l.item_id WHERE l.arrival_id = p_arrival_id;
    
    v_narration := 'Purchase Bill #' || v_arrival.bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Received');

    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id, party_id, arrival_id)
    VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_goods_total, v_narration, p_arrival_id, v_arrival.party_id, p_arrival_id)
    RETURNING id INTO v_voucher_id;

    -- 6. Ledger Entries
    -- DEBIT Purchase (Gross)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (v_org_id, v_voucher_id, v_pur_acc_id, ROUND(v_goods_total, 2), 0, v_arrival.arrival_date, v_narration, v_narration, 'purchase', p_arrival_id);
    
    -- CREDIT Party (Net)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (v_org_id, v_voucher_id, v_arrival.party_id, v_pay_acc_id, 0, ROUND(v_net_payable_total, 2), v_arrival.arrival_date, v_narration, v_narration, 'purchase', p_arrival_id);

    -- CREDIT Commission Income
    IF v_comm_total > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_comm_acc_id, 0, ROUND(v_comm_total, 2), v_arrival.arrival_date, 'Commission Income', v_narration, 'purchase', p_arrival_id);
    END IF;

    -- CREDIT Expense Recovery
    IF (v_recovery_total + v_header_expenses) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_exp_acc_id, 0, ROUND(v_recovery_total + v_header_expenses, 2), v_arrival.arrival_date, 'Expense Recovery', v_narration, 'purchase', p_arrival_id);
    END IF;

    -- 7. Handle Advance Payments (if any)
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        -- Map Payment Account
        IF v_arrival.advance_payment_mode = 'cash' THEN
            SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
        ELSE
            v_cash_acc_id := COALESCE(v_arrival.advance_bank_account_id, (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1));
        END IF;

        IF v_cash_acc_id IS NOT NULL THEN
            -- DEBIT Party
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_arrival.party_id, v_pay_acc_id, ROUND(v_arrival.advance_amount, 2), 0, v_arrival.arrival_date, 'Purchase Advance Payment', v_narration, 'purchase_payment', p_arrival_id);
            
            -- CREDIT Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_cash_acc_id, 0, ROUND(v_arrival.advance_amount, 2), v_arrival.arrival_date, 'Purchase Advance Payment', v_narration, 'purchase_payment', p_arrival_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'net_payable', v_net_payable_total);
END;
$$;

COMMIT;
