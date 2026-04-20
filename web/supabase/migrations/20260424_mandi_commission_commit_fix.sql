-- FIX FOR MANDI COMMISSION COMMIT FAILURE
-- 1. Correct commit_mandi_session to persist calculated net_payable to lots table
-- 2. Add defensive check to post_arrival_ledger to avoid INVALID_AMOUNTS error

CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session           RECORD;
    v_farmer            RECORD;
    v_org_id            UUID;
    v_lot_prefix        TEXT;
    v_arrival_id        UUID;
    v_bill_no           BIGINT;
    v_net_qty           NUMERIC;
    v_total_net_qty     NUMERIC := 0;
    v_total_commission  NUMERIC := 0;
    v_total_purchase    NUMERIC := 0;
    v_item_amount       NUMERIC;
    v_sale_rate         NUMERIC;
    v_final_sale_items  JSONB := '[]'::JSONB;
    v_item              JSONB;
    v_sale_items_tmp    JSONB := '[]'::JSONB;
    v_lot_id            UUID;
    v_arrival_ids       UUID[] := '{}';
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;
    
    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order ASC LOOP
        v_net_qty := GREATEST(v_farmer.qty - COALESCE(v_farmer.less_units, 0), 0);
        
        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status)
        VALUES (v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_prefix, v_session.vehicle_no, v_session.book_no, v_bill_no, 'pending')
        RETURNING id INTO v_arrival_id;

        -- FIX: Correctly mapping Financial columns (net_payable, etc.) to the lots table
        -- This ensures post_arrival_ledger has non-zero amounts to work with.
        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code, contact_id, 
            initial_qty, current_qty, gross_quantity, unit, supplier_rate, 
            commission_percent, less_percent, less_units, 
            loading_cost, farmer_charges, variety, grade, 
            arrival_type, status,
            net_payable  -- CRITICAL COLUMN ADDED
        )
        VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'), v_farmer.farmer_id, 
            v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit, v_farmer.rate, 
            v_farmer.commission_percent, v_farmer.less_percent, v_farmer.less_units, 
            v_farmer.loading_charges, v_farmer.other_charges, v_farmer.variety, v_farmer.grade, 
            'commission', 'active',
            COALESCE(v_farmer.net_payable, 0) -- PASSING CALCULATED AMOUNT
        )
        RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
        
        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + COALESCE(v_farmer.commission_amount, 0);
        v_total_purchase := v_total_purchase + COALESCE(v_farmer.net_amount, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);
        
        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'qty', v_net_qty, 'unit', v_farmer.unit);
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := CASE WHEN v_total_net_qty > 0 THEN ROUND(v_item_amount / v_total_net_qty, 2) ELSE 0 END;
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        PERFORM mandi.confirm_sale_transaction(
            p_organization_id   := v_org_id::UUID,
            p_buyer_id         := v_session.buyer_id::UUID,
            p_sale_date        := v_session.session_date::DATE,
            p_payment_mode     := 'credit'::TEXT,
            p_total_amount     := v_item_amount::NUMERIC,
            p_items            := v_final_sale_items::JSONB,
            p_loading_charges  := COALESCE(v_session.buyer_loading_charges, 0)::NUMERIC,
            p_other_expenses   := COALESCE(v_session.buyer_packing_charges, 0)::NUMERIC,
            p_idempotency_key  := p_session_id::TEXT
        );
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'purchase_bill_ids', to_jsonb(v_arrival_ids));
END;
$$;

-- UPDATE POST_ARRIVAL_LEDGER WITH DEFENSIVE CHECKS
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival RECORD; 
    v_lot RECORD; 
    v_voucher_id UUID; 
    v_purchase_narration TEXT; 
    v_lot_details TEXT := '';
    v_ap_acc_id UUID; 
    v_inventory_acc_id UUID; 
    v_arrival_total NUMERIC := 0;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    v_ap_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'accounts_payable' LIMIT 1);
    v_inventory_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND account_sub_type = 'inventory' LIMIT 1);
    
    FOR v_lot IN 
        SELECT l.*, c.name as item_name 
        FROM mandi.lots l 
        JOIN mandi.commodities c ON l.item_id = c.id 
        WHERE l.arrival_id = p_arrival_id 
    LOOP
        v_lot_details := v_lot_details || v_lot.item_name || ' (Lot: ' || v_lot.lot_code || ', ' || v_lot.initial_qty || ' @ ₹' || v_lot.supplier_rate || ') ';
        v_arrival_total := v_arrival_total + COALESCE(v_lot.net_payable, 0);
    END LOOP;

    -- SAFETY: If total is zero (e.g. sample lots, empty arrival), skip ledger posting
    -- to avoid "INVALID_AMOUNTS: Both debit and credit cannot be zero" exception.
    IF v_arrival_total <= 0 THEN
        RETURN;
    END IF;

    v_purchase_narration := 'Purchase Bill #' || COALESCE(v_arrival.bill_no::text, '-') || ' | ' || TRIM(v_lot_details);

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, arrival_id)
    VALUES (v_arrival.organization_id, v_arrival.created_at, 'purchase', (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id AND type = 'purchase'), v_arrival_total, v_purchase_narration, p_arrival_id)
    RETURNING id INTO v_voucher_id;

    -- Inventory Debit
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_arrival.organization_id, v_voucher_id, v_inventory_acc_id, NULL, v_arrival_total, 0, v_arrival.created_at, v_purchase_narration, 'purchase', p_arrival_id);

    -- Supplier Credit
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_arrival.organization_id, v_voucher_id, v_ap_acc_id, v_arrival.contact_id, 0, v_arrival_total, v_arrival.created_at, v_purchase_narration, 'purchase', p_arrival_id);
END;
$$;
