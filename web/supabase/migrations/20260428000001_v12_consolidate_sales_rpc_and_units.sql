-- Drop existing function overloads to ensure a clean slate
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,date,uuid,jsonb,numeric,numeric,numeric,numeric,text,text,text,date,text,uuid,boolean,numeric,date,numeric,numeric,numeric,numeric,numeric,numeric,boolean,numeric,numeric,numeric,numeric,text,text,boolean,text,uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,date,uuid,jsonb,numeric,numeric,numeric,numeric,text,text,text,date,text,uuid,boolean,numeric,date,numeric,numeric,numeric,numeric,numeric,numeric,boolean,numeric,numeric,numeric,numeric,text,text,boolean,text);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,date,uuid,jsonb,numeric,numeric,numeric,numeric,text,text,text,date,text,uuid,boolean,numeric,date,numeric,numeric,numeric,numeric,numeric,numeric);

-- CREATE unified RPC with correct UUID return type and sequence logic
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_sale_date date,
    p_buyer_id uuid,
    p_items jsonb,
    p_total_amount numeric DEFAULT 0,
    p_header_discount numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_payment_mode text DEFAULT 'credit',
    p_narration text DEFAULT NULL,
    p_cheque_number text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_bank text DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_amount_received numeric DEFAULT 0,
    p_due_date date DEFAULT NULL,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_gst_enabled boolean DEFAULT false,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false,
    p_idempotency_key text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
            RETURN v_sale_id;
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
        created_by
    ) VALUES (
        p_organization_id,
        p_sale_date,
        p_buyer_id,
        p_total_amount,
        v_bill_no,
        v_contact_bill_no,
        p_payment_mode,
        p_narration,
        p_cheque_number,
        p_cheque_date,
        p_cheque_bank,
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
        p_created_by
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
            v_item->>'unit',
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

    RETURN v_sale_id;
END;
$$;
