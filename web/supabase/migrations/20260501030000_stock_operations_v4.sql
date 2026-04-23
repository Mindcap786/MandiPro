-- Standardizing RPC signatures for POS, Stock Transfer, and Returns
-- This script drops redundant overloaded functions and creates canonical versions.

-- 1. POS: confirm_sale_transaction
-- Drop all existing versions to clear overloading confusion
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, date, uuid, text, date, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text, boolean, boolean, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, date, uuid, jsonb, numeric, numeric, numeric, numeric, text, text, text, date, text, uuid, boolean, numeric, date, numeric, numeric, numeric, numeric, numeric, numeric, boolean, numeric, numeric, numeric, numeric, text, text, boolean, text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_payment_mode text,
    p_total_amount numeric,
    p_items jsonb,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_amount_received numeric DEFAULT 0,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false,
    p_gst_enabled boolean DEFAULT false,
    p_narration text DEFAULT NULL,
    p_vehicle_number text DEFAULT NULL,
    p_book_no text DEFAULT NULL,
    p_lot_no text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id uuid;
    v_item jsonb;
    v_bill_no bigint;
    v_contact_bill_no bigint;
BEGIN
    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1;
        IF v_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'is_duplicate', true);
        END IF;
    END IF;

    -- Bill numbers
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    IF p_buyer_id IS NOT NULL THEN
        v_contact_bill_no := mandi.get_next_contact_bill_no(p_organization_id, p_buyer_id, 'sale');
    END IF;

    -- Create Sales Header
    INSERT INTO mandi.sales (
        organization_id, sale_date, buyer_id, total_amount, bill_no, contact_bill_no, 
        payment_mode, narration, cheque_no, cheque_date, bank_name, bank_account_id, 
        cheque_status, amount_received, due_date, market_fee, nirashrit, misc_fee, 
        loading_charges, unloading_charges, other_expenses, status, payment_status, 
        gst_enabled, cgst_amount, sgst_amount, igst_amount, gst_total, place_of_supply, 
        buyer_gstin, is_igst, idempotency_key, created_by, vehicle_number, book_no, 
        lot_no, discount_percent, discount_amount
    ) VALUES (
        p_organization_id, p_sale_date, p_buyer_id, p_total_amount, v_bill_no, v_contact_bill_no, 
        p_payment_mode, p_narration, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id, 
        p_cheque_status, p_amount_received, p_due_date, p_market_fee, p_nirashrit, p_misc_fee, 
        p_loading_charges, p_unloading_charges, p_other_expenses, 'completed',
        CASE 
            WHEN p_amount_received >= p_total_amount THEN 'paid'
            WHEN p_amount_received > 0 THEN 'partial'
            ELSE 'pending'
        END,
        p_gst_enabled, p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total, p_place_of_supply, 
        p_buyer_gstin, p_is_igst, p_idempotency_key, p_created_by, p_vehicle_number, p_book_no, 
        p_lot_no, p_discount_percent, p_discount_amount
    ) RETURNING id INTO v_sale_id;

    -- Sale Items & Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (
            sale_id, organization_id, item_id, lot_id, qty, rate, amount, unit, gst_rate, tax_amount, created_by
        ) VALUES (
            v_sale_id, p_organization_id, (v_item->>'item_id')::uuid, (v_item->>'lot_id')::uuid, 
            (v_item->>'qty')::numeric, (v_item->>'rate')::numeric, (v_item->>'amount')::numeric, 
            COALESCE(v_item->>'unit', 'Kg'), COALESCE((v_item->>'gst_rate')::numeric, 0), 
            COALESCE((v_item->>'tax_amount')::numeric, 0), p_created_by
        );

        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::numeric WHERE id = (v_item->>'lot_id')::uuid;
        END IF;
    END LOOP;

    -- Financials
    PERFORM mandi.post_sale_ledger(v_sale_id);

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END;
$$;

-- 2. Stock Transfer
CREATE OR REPLACE FUNCTION mandi.transfer_stock_v3(
    p_organization_id uuid,
    p_lot_id uuid,
    p_qty numeric,
    p_from_location text,
    p_to_location text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lot RECORD;
    v_transfer_id uuid;
BEGIN
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;
    IF v_lot.current_qty < p_qty THEN RAISE EXCEPTION 'Insufficient quantity for transfer'; END IF;

    -- Record Transfer
    INSERT INTO mandi.stock_transfers (organization_id, lot_id, qty, from_location, to_location, transfer_date)
    VALUES (p_organization_id, p_lot_id, p_qty, p_from_location, p_to_location, CURRENT_DATE)
    RETURNING id INTO v_transfer_id;

    -- Full transfer: Update location
    IF v_lot.current_qty = p_qty THEN
        UPDATE mandi.lots SET storage_location = p_to_location, updated_at = NOW() WHERE id = p_lot_id;
    ELSE
        -- Partial transfer: Split lot
        INSERT INTO mandi.lots (
            organization_id, item_id, contact_id, arrival_id, initial_qty, current_qty, 
            unit, storage_location, supplier_rate, sale_rate, lot_code, arrival_type, created_at
        ) VALUES (
            v_lot.organization_id, v_lot.item_id, v_lot.contact_id, v_lot.arrival_id, p_qty, p_qty, 
            v_lot.unit, p_to_location, v_lot.supplier_rate, v_lot.sale_rate, v_lot.lot_code, v_lot.arrival_type, v_lot.created_at
        );
        
        UPDATE mandi.lots SET current_qty = current_qty - p_qty, updated_at = NOW() WHERE id = p_lot_id;
    END IF;

    -- Stock Ledger Log
    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'transfer_out', -p_qty, v_transfer_id);

    RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
END;
$$;

-- 3. Stock Return (Renamed to avoid collision)
CREATE OR REPLACE FUNCTION mandi.process_lot_purchase_return_v3(
    p_organization_id uuid,
    p_lot_id uuid,
    p_qty numeric,
    p_rate numeric,
    p_remarks text,
    p_return_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lot RECORD;
    v_return_id UUID;
    v_return_value NUMERIC;
    v_voucher_id UUID;
    v_inventory_account_id UUID;
BEGIN
    SELECT * INTO v_lot FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_lot IS NULL THEN RAISE EXCEPTION 'Lot not found'; END IF;
    IF v_lot.current_qty < p_qty THEN RAISE EXCEPTION 'Insufficient stock for return.'; END IF;

    -- Record Return
    INSERT INTO mandi.purchase_returns (organization_id, lot_id, qty, rate, remarks, return_date)
    VALUES (p_organization_id, p_lot_id, p_qty, p_rate, p_remarks, p_return_date)
    RETURNING id INTO v_return_id;

    UPDATE mandi.lots SET current_qty = current_qty - p_qty, updated_at = NOW() WHERE id = p_lot_id;

    -- Financials
    v_return_value := p_qty * p_rate;
    SELECT id INTO v_inventory_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;

    IF v_return_value > 0 AND v_inventory_account_id IS NOT NULL AND v_lot.contact_id IS NOT NULL THEN
        INSERT INTO mandi.vouchers (organization_id, date, type, narration, amount, contact_id)
        VALUES (p_organization_id, p_return_date, 'debit_note', 'Stock Return: ' || p_remarks || ' (Lot: ' || v_lot.lot_code || ')', v_return_value, v_lot.contact_id)
        RETURNING id INTO v_voucher_id;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_lot.contact_id, v_return_value, 0, p_return_date, 'Purchase Return (Debit Note)');

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_inventory_account_id, 0, v_return_value, p_return_date, 'Inventory Credit (Return)');
    END IF;

    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'return', -p_qty, v_return_id);

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id, 'voucher_id', v_voucher_id);
END;
$$;
