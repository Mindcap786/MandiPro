-- V11: Sales Financial Standardization & Unified Ledger
-- 1. Infrastructure for Unified Numbering using existing id_sequences
-- 2. Refactor confirm_sale_transaction for Single-Voucher architecture
-- 3. Update create_mixed_arrival for Sequential Bill Numbering
-- 4. Standardize Narrations

-- Function to get and increment internal sequence using existing id_sequences table
CREATE OR REPLACE FUNCTION mandi.get_internal_sequence(p_org_id UUID, p_type TEXT)
RETURNS BIGINT AS $$
DECLARE
    v_new_val BIGINT;
BEGIN
    INSERT INTO mandi.id_sequences (organization_id, entity_type, last_number, prefix, padding)
    VALUES (p_org_id, p_type, 1, '', 0)
    ON CONFLICT (organization_id, entity_type) 
    DO UPDATE SET last_number = id_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number INTO v_new_val;
    
    RETURN v_new_val;
END;
$$ LANGUAGE plpgsql;

-- Update create_mixed_arrival to use Internal Sequence for Bill Numbers
CREATE OR REPLACE FUNCTION mandi.create_mixed_arrival(p_arrival jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_arrival_id      UUID;
    v_party_id        UUID;
    v_organization_id UUID;
    v_lot             RECORD;
    v_lot_id          UUID;
    v_advance_amount  NUMERIC;
    v_advance_mode    TEXT;
    v_idempotency_key UUID;
    v_net_payable     NUMERIC;
    v_ledger_result   JSONB;
    v_lot_net         NUMERIC;
    v_arrival_type    TEXT;
    v_commission_pct  NUMERIC;
    v_metadata        JSONB := '{}'::jsonb;
    v_first_item      JSONB;
    v_bill_no         BIGINT;
BEGIN
    v_organization_id := (p_arrival->>'organization_id')::UUID;
    v_party_id        := (p_arrival->>'party_id')::UUID;
    v_advance_amount  := COALESCE((p_arrival->>'advance')::NUMERIC, 0);
    v_advance_mode    := COALESCE(p_arrival->>'advance_payment_mode', 'cash');
    v_arrival_type    := COALESCE(p_arrival->>'arrival_type', 'commission');

    -- Handle bill_no (ALWAYS fetch from internal sequence to maintain the true 'System' order)
    v_bill_no := (p_arrival->>'bill_no')::BIGINT;
    IF v_bill_no IS NULL THEN
        v_bill_no := mandi.get_internal_sequence(v_organization_id, 'bill_no');
    END IF;

    BEGIN
        v_idempotency_key := (p_arrival->>'idempotency_key')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key := NULL;
    END;

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required';
    END IF;

    IF v_party_id IS NULL THEN
        RAISE EXCEPTION 'Supplier/Party is required to process this transaction.';
    END IF;

    -- Idempotency check
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id, COALESCE(metadata, '{}'::jsonb) INTO v_arrival_id, v_metadata 
        FROM mandi.arrivals 
        WHERE idempotency_key = v_idempotency_key AND organization_id = v_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'arrival_id', v_arrival_id, 'idempotent', true, 'metadata', v_metadata);
        END IF;
    END IF;

    -- Extract metadata for history
    v_first_item := p_arrival->'items'->0;
    IF v_first_item IS NOT NULL THEN
        v_metadata := jsonb_build_object(
            'item_name', (SELECT name FROM mandi.commodities WHERE id = (v_first_item->>'item_id')::UUID),
            'qty', (v_first_item->>'qty')::NUMERIC,
            'unit', COALESCE(v_first_item->>'unit', 'Box'),
            'supplier_rate', COALESCE((v_first_item->>'supplier_rate')::NUMERIC, 0)
        );
    END IF;

    -- Create arrival record
    INSERT INTO mandi.arrivals (
        organization_id, party_id, arrival_type, arrival_date,
        vehicle_number, driver_name, driver_mobile,
        loaders_count, hire_charges, hamali_expenses, other_expenses,
        advance_amount, advance_payment_mode, reference_no, bill_no,
        idempotency_key, created_by, metadata
    ) VALUES (
        v_organization_id, v_party_id, v_arrival_type, (p_arrival->>'arrival_date')::DATE,
        p_arrival->>'vehicle_number', p_arrival->>'driver_name', p_arrival->>'driver_mobile',
        COALESCE((p_arrival->>'loaders_count')::INT, 0), 
        COALESCE((p_arrival->>'hire_charges')::NUMERIC, 0),
        COALESCE((p_arrival->>'hamali_expenses')::NUMERIC, 0), 
        COALESCE((p_arrival->>'other_expenses')::NUMERIC, 0),
        v_advance_amount, v_advance_mode, p_arrival->>'reference_no', v_bill_no,
        v_idempotency_key, p_created_by, v_metadata
    ) RETURNING id INTO v_arrival_id;

    -- Create lots
    FOR v_lot IN SELECT value FROM jsonb_array_elements(p_arrival->'items')
    LOOP
        v_commission_pct := COALESCE((v_lot.value->>'commission_percent')::NUMERIC, 0);
        
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, contact_id,
            lot_code, initial_qty, current_qty, unit, supplier_rate,
            commission_percent, arrival_type, status, 
            advance, advance_payment_mode,
            created_by
        ) VALUES (
            v_organization_id, v_arrival_id, (v_lot.value->>'item_id')::UUID, v_party_id,
            COALESCE(v_lot.value->>'lot_code', 'LOT-' || COALESCE(v_bill_no::text, '') || '-' || substr(gen_random_uuid()::text, 1, 4)),
            (v_lot.value->>'qty')::NUMERIC, (v_lot.value->>'qty')::NUMERIC, 
            COALESCE(v_lot.value->>'unit', 'Box'), 
            COALESCE((v_lot.value->>'supplier_rate')::NUMERIC, 0),
            v_commission_pct, v_arrival_type, 'available',
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_amount ELSE 0 END,
            CASE WHEN jsonb_array_length(p_arrival->'items') = 1 THEN v_advance_mode ELSE 'cash' END,
            p_created_by
        ) RETURNING id INTO v_lot_id;

        -- Post ledger
        v_lot_net := mandi.compute_lot_net_payable(v_lot_id);
        UPDATE mandi.lots SET net_payable = v_lot_net WHERE id = v_lot_id;
    END LOOP;

    -- Post arrival ledger
    IF v_party_id IS NOT NULL THEN
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'arrival_id', v_arrival_id,
        'bill_no', v_bill_no
    );
END;
$function$;

-- Update confirm_sale_transaction to use Single-Voucher and Internal Sequences
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
    p_cheque_no TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_cheque_status BOOLEAN DEFAULT FALSE,
    p_bank_name TEXT DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_payment_acc_id UUID;
    v_total_inc_tax NUMERIC;
    v_received NUMERIC;
    v_payment_status TEXT;
    v_mode_lower TEXT := LOWER(p_payment_mode);
    v_item JSONB;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_item_details TEXT := '';
    v_temp_lot_no TEXT;
    v_temp_item_name TEXT;
    v_sale_narration TEXT;
    v_voucher_no BIGINT;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_settlement_label TEXT;
BEGIN
    -- 1. Account lookup
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'accounts_receivable' LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'operating_revenue' LIMIT 1;
    
    -- Pick Payment Account
    IF v_mode_lower IN ('cash','upi','upi_cash','bank_upi','upi/bank') THEN
        SELECT id INTO v_payment_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1;
    ELSIF v_mode_lower IN ('bank_transfer','neft','rtgs','bank') THEN
        SELECT id INTO v_payment_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1;
    ELSIF v_mode_lower = 'cheque' THEN
        SELECT id INTO v_payment_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cheques_in_transit' LIMIT 1;
    END IF;
    -- Fallback
    IF v_payment_acc_id IS NULL THEN
        SELECT id INTO v_payment_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type IN ('cash','bank') LIMIT 1;
    END IF;

    -- 2. Calculations
    v_total_inc_tax := ROUND((p_total_amount + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0) - COALESCE(p_discount_amount,0))::NUMERIC, 2);

    IF v_mode_lower IN ('udhaar','credit') THEN 
        v_payment_status := 'pending'; v_received := 0; v_settlement_label := 'Credit (Udhaar)';
    ELSIF p_amount_received >= (v_total_inc_tax - 0.01) THEN 
        v_payment_status := 'paid'; v_received := v_total_inc_tax; v_settlement_label := 'Full Payment';
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN 
        v_payment_status := 'partial'; v_received := p_amount_received; v_settlement_label := 'Partial Payment';
    ELSE 
        v_payment_status := 'pending'; v_received := 0; v_settlement_label := 'Credit';
    END IF;

    -- 3. Sequences (Internal Counter logic - strictly sequential)
    v_contact_bill_no := mandi.get_internal_sequence(p_organization_id, 'bill_no');
    v_voucher_no      := mandi.get_internal_sequence(p_organization_id, 'voucher_no');

    -- 4. Create Sale Record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, amount_received, market_fee, nirashrit,
        misc_fee, loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id, cgst_amount,
        sgst_amount, igst_amount, gst_total, discount_percent, discount_amount,
        place_of_supply, buyer_gstin, idempotency_key, contact_bill_no
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, v_received, COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0),
        COALESCE(p_misc_fee,0), COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0), p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id, COALESCE(p_cgst_amount,0),
        COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0), COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0),
        p_place_of_supply, p_buyer_gstin, p_idempotency_key, v_contact_bill_no
    ) RETURNING id, bill_no INTO v_sale_id, v_bill_no;

    -- Ensure bill_no (user display) matches our internal contact_bill_no sequence
    IF v_bill_no IS NULL OR v_bill_no < v_contact_bill_no THEN 
        UPDATE mandi.sales SET bill_no = v_contact_bill_no WHERE id = v_sale_id;
        v_bill_no := v_contact_bill_no;
    END IF;

    -- 5. Items & Narration Summary
    v_item_details := '';
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0); 
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        
        IF (v_item->>'lot_id') IS NOT NULL AND v_qty > 0 THEN
            SELECT c.name, l.lot_code INTO v_temp_item_name, v_temp_lot_no 
            FROM mandi.lots l JOIN mandi.commodities c ON l.item_id = c.id WHERE l.id = (v_item->>'lot_id')::UUID;
            
            v_item_details := v_item_details || v_temp_item_name || ' (' || v_qty || ' @ ₹' || v_rate || ') ';
            
            INSERT INTO mandi.sale_items (sale_id, lot_id, item_id, qty, rate, amount, organization_id) 
            VALUES (v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'item_id')::UUID, v_qty, v_rate, ROUND(v_qty * v_rate, 2), p_organization_id);
            
            UPDATE mandi.lots SET current_qty = ROUND(COALESCE(current_qty,0) - v_qty, 3) WHERE id = (v_item->>'lot_id')::UUID; 
        END IF;
    END LOOP;

    v_sale_narration := 'Sale (' || v_settlement_label || ') - Bill #' || v_bill_no || ' | ' || TRIM(v_item_details);

    -- 6. Unified Voucher (SINGLE VOUCHER FOR SALE + PAYMENT)
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id) 
    VALUES (p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax, v_sale_narration, v_sale_id)
    RETURNING id INTO v_voucher_id;

    -- 7. Ledger Entries
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES 
    (p_organization_id, v_voucher_id, NULL, p_buyer_id, v_total_inc_tax, 0, p_sale_date, v_sale_narration, 'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL, 0, v_total_inc_tax, p_sale_date, v_sale_narration, 'sale', v_sale_id);

    -- Payment Legs (if immediate payment)
    IF v_received > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES
        (p_organization_id, v_voucher_id, v_payment_acc_id, NULL, v_received, 0, p_sale_date, 'Payment Received (' || v_settlement_label || ') - Bill #' || v_bill_no, 'receipt', v_sale_id),
        (p_organization_id, v_voucher_id, NULL, p_buyer_id, 0, v_received, p_sale_date, 'Payment Received (' || v_settlement_label || ') - Bill #' || v_bill_no, 'receipt', v_sale_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'sale_id', v_sale_id, 
        'bill_no', v_bill_no, 
        'voucher_no', v_voucher_no, 
        'payment_status', v_payment_status, 
        'amount_received', v_received
    );
END;
$$ LANGUAGE plpgsql;
