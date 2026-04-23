-- Migration: 20260501040000_fix_confirm_sale_signature.sql
-- Description: Corrects the parameter signature for confirm_sale_transaction in mandi schema.

BEGIN;

-- Drop the old one first (it might have different parameters)
-- We need to be careful with dependencies, but usually it's fine.

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_amount_received NUMERIC DEFAULT 0,
    p_idempotency_key TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_cheque_status TEXT DEFAULT 'pending',
    p_bank_name TEXT DEFAULT NULL,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT false,
    p_gst_enabled BOOLEAN DEFAULT false,
    p_narration TEXT DEFAULT NULL,
    p_vehicle_number TEXT DEFAULT NULL,
    p_book_no TEXT DEFAULT NULL,
    p_lot_no TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_sale_id uuid;
    v_item jsonb;
    v_bill_no bigint;
    v_contact_bill_no bigint;
BEGIN
    -- Check for existing idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1;
        IF v_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'is_duplicate', true);
        END IF;
    END IF;

    -- Generate global bill number (MAX+1 logic)
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no 
    FROM mandi.sales 
    WHERE organization_id = p_organization_id;

    -- Generate contact-specific bill number
    IF p_buyer_id IS NOT NULL THEN
        v_contact_bill_no := mandi.get_next_contact_bill_no(p_organization_id, p_buyer_id, 'sale');
    END IF;

    -- Create Sales Header
    INSERT INTO mandi.sales (
        organization_id,
        sale_date,
        buyer_id,
        total_amount,
        bill_no,
        contact_bill_no,
        payment_mode,
        narration,
        cheque_no,
        cheque_date,
        bank_name,
        bank_account_id,
        cheque_status,
        amount_received,
        due_date,
        market_fee,
        nirashrit,
        misc_fee,
        loading_charges,
        unloading_charges,
        other_expenses,
        status,
        payment_status,
        gst_enabled,
        cgst_amount,
        sgst_amount,
        igst_amount,
        gst_total,
        place_of_supply,
        buyer_gstin,
        is_igst,
        idempotency_key,
        created_by,
        vehicle_number,
        book_no,
        lot_no,
        discount_percent,
        discount_amount
    ) VALUES (
        p_organization_id,
        p_sale_date,
        p_buyer_id,
        p_total_amount,
        v_bill_no,
        v_contact_bill_no,
        p_payment_mode,
        p_narration,
        p_cheque_no,
        p_cheque_date,
        p_bank_name,
        p_bank_account_id,
        p_cheque_status,
        p_amount_received,
        p_due_date,
        p_market_fee,
        p_nirashrit,
        p_misc_fee,
        p_loading_charges,
        p_unloading_charges,
        p_other_expenses,
        'completed',
        CASE 
            WHEN p_amount_received >= p_total_amount THEN 'paid'
            WHEN p_amount_received > 0 THEN 'partial'
            ELSE 'pending'
        END,
        p_gst_enabled,
        p_cgst_amount,
        p_sgst_amount,
        p_igst_amount,
        p_gst_total,
        p_place_of_supply,
        p_buyer_gstin,
        p_is_igst,
        p_idempotency_key,
        p_created_by,
        p_vehicle_number,
        p_book_no,
        p_lot_no,
        p_discount_percent,
        p_discount_amount
    ) RETURNING id INTO v_sale_id;

    -- Create Sale Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO mandi.sale_items (
            sale_id,
            organization_id,
            item_id,
            lot_id,
            qty,
            rate,
            amount,
            unit,
            gst_rate,
            tax_amount,
            created_by
        ) VALUES (
            v_sale_id,
            p_organization_id,
            (v_item->>'item_id')::uuid,
            (v_item->>'lot_id')::uuid,
            (v_item->>'qty')::numeric,
            (v_item->>'rate')::numeric,
            (v_item->>'amount')::numeric,
            COALESCE(v_item->>'unit', 'Kg'),
            COALESCE((v_item->>'gst_rate')::numeric, 0),
            COALESCE((v_item->>'tax_amount')::numeric, 0),
            p_created_by
        );

        -- Update Lot Quantity (Atomic Stock Update)
        IF (v_item->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots
            SET current_qty = current_qty - (v_item->>'qty')::numeric
            WHERE id = (v_item->>'lot_id')::uuid;
        END IF;
    END LOOP;

    -- Trigger Financial Ledger Entries
    PERFORM mandi.post_sale_ledger(v_sale_id);

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the public wrapper in 'public' schema (if it exists and points here)
CREATE OR REPLACE FUNCTION public.confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_amount_received NUMERIC DEFAULT 0,
    p_idempotency_key TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_cheque_status TEXT DEFAULT 'pending',
    p_bank_name TEXT DEFAULT NULL,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT false,
    p_gst_enabled BOOLEAN DEFAULT false,
    p_narration TEXT DEFAULT NULL,
    p_vehicle_number TEXT DEFAULT NULL,
    p_book_no TEXT DEFAULT NULL,
    p_lot_no TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
    RETURN mandi.confirm_sale_transaction(
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, p_items,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_amount_received, p_idempotency_key, p_due_date, p_bank_account_id,
        p_cheque_no, p_cheque_date, p_cheque_status, p_bank_name,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount, p_place_of_supply, p_buyer_gstin, p_is_igst,
        p_gst_enabled, p_narration, p_vehicle_number, p_book_no, p_lot_no, p_created_by
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
