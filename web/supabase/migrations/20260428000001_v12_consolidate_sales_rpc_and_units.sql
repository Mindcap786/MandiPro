-- 1. Drop all existing versions of confirm_sale_transaction to avoid "not unique" errors
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'DROP FUNCTION ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ');' as drop_cmd
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'confirm_sale_transaction'
        AND n.nspname = 'mandi'
    ) LOOP
        EXECUTE r.drop_cmd;
    END LOOP;
END $$;

-- 2. Create the unified Pro-Grade confirm_sale_transaction function
-- Matching the 33-parameter signature expected by the Next.js API route
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_sale_date         DATE,
    p_buyer_id          UUID,
    p_items             JSONB,
    p_total_amount      NUMERIC DEFAULT 0,
    p_header_discount   NUMERIC DEFAULT 0,
    p_discount_percent  NUMERIC DEFAULT 0,
    p_discount_amount   NUMERIC DEFAULT 0,
    p_payment_mode      TEXT DEFAULT 'credit',
    p_narration         TEXT DEFAULT NULL,
    p_cheque_number     TEXT DEFAULT NULL,
    p_cheque_date       DATE DEFAULT NULL,
    p_cheque_bank       TEXT DEFAULT NULL,
    p_bank_account_id   UUID DEFAULT NULL,
    p_cheque_status     BOOLEAN DEFAULT FALSE,
    p_amount_received   NUMERIC DEFAULT 0,
    p_due_date          DATE DEFAULT NULL,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_gst_enabled       BOOLEAN DEFAULT FALSE,
    p_cgst_amount       NUMERIC DEFAULT 0,
    p_sgst_amount       NUMERIC DEFAULT 0,
    p_igst_amount       NUMERIC DEFAULT 0,
    p_gst_total         NUMERIC DEFAULT 0,
    p_place_of_supply   TEXT DEFAULT NULL,
    p_buyer_gstin       TEXT DEFAULT NULL,
    p_is_igst           BOOLEAN DEFAULT FALSE,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_created_by        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id         UUID;
    v_voucher_id      UUID;
    v_bill_no         BIGINT;
    v_item            RECORD;
    v_payment_status  TEXT;
    v_total_paid      NUMERIC := COALESCE(p_amount_received, 0);
BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no INTO v_sale_id, v_bill_no 
        FROM mandi.sales 
        WHERE organization_id = p_organization_id 
          AND idempotency_key = p_idempotency_key;
        
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'message', 'Duplicate prevented');
        END IF;
    END IF;

    -- 2. Determine Payment Status
    v_payment_status := CASE
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid'
        WHEN p_payment_mode IN ('cheque', 'CHEQUE') AND p_cheque_status = TRUE THEN 'paid'
        WHEN v_total_paid >= p_total_amount AND p_total_amount > 0 THEN 'paid'
        WHEN v_total_paid > 0 THEN 'partial'
        ELSE 'pending'
    END;

    -- 3. Get Next Bill Sequence
    v_bill_no := core.next_sale_no(p_organization_id);
    
    -- 4. Create Sale Record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, idempotency_key, due_date,
        cheque_no, cheque_date, cheque_status, bank_name,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, narration,
        paid_amount, balance_due, created_by
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, 
        ROUND(p_total_amount::NUMERIC, 2), v_bill_no,
        ROUND(COALESCE(p_market_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_nirashrit, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_misc_fee, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_loading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_unloading_charges, 0)::NUMERIC, 2),
        ROUND(COALESCE(p_other_expenses, 0)::NUMERIC, 2),
        v_payment_status, p_idempotency_key, p_due_date,
        p_cheque_number, p_cheque_date, p_cheque_status, p_cheque_bank,
        ROUND(COALESCE(p_cgst_amount, 0), 2),
        ROUND(COALESCE(p_sgst_amount, 0), 2),
        ROUND(COALESCE(p_igst_amount, 0), 2),
        ROUND(COALESCE(p_gst_total, 0), 2),
        ROUND(COALESCE(p_discount_percent, 0), 2),
        ROUND(COALESCE(p_discount_amount, 0), 2),
        p_narration,
        v_total_paid,
        p_total_amount - v_total_paid,
        p_created_by
    ) RETURNING id INTO v_sale_id;

    -- 5. Process Sale Items & Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(lot_id UUID, quantity NUMERIC, rate_per_unit NUMERIC, amount NUMERIC) LOOP
        INSERT INTO mandi.sale_items (sale_id, lot_id, quantity, rate_per_unit, total_amount)
        VALUES (v_sale_id, v_item.lot_id, v_item.quantity, v_item.rate_per_unit, COALESCE(v_item.amount, v_item.quantity * v_item.rate_per_unit));

        -- Update Lot Quantities and Close if Empty
        UPDATE mandi.lots 
        SET current_qty = current_qty - v_item.quantity,
            status = CASE WHEN (current_qty - v_item.quantity) <= 0.01 THEN 'sold' ELSE status END
        WHERE id = v_item.lot_id;
    END LOOP;

    -- 6. Financial Posting (Double-Entry Ledger)
    PERFORM mandi.post_sale_ledger(v_sale_id);

    -- 7. Handle Instant Payment Voucher if paid_amount > 0
    IF v_total_paid > 0 THEN
        INSERT INTO mandi.vouchers (
            organization_id, date, party_id, type, amount, 
            payment_mode, sale_id, reference_no, narration, bank_account_id
        ) VALUES (
            p_organization_id, p_sale_date, p_buyer_id, 'receipt', v_total_paid,
            p_payment_mode, v_sale_id, 'INV-' || v_bill_no,
            'Payment received for invoice #' || v_bill_no,
            p_bank_account_id
        ) RETURNING id INTO v_voucher_id;
        
        PERFORM mandi.post_voucher_ledger_v2(v_voucher_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;

-- 3. Update commit_mandi_session to use the new unified signature
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

        INSERT INTO mandi.lots (
            organization_id, arrival_id, item_id, lot_code, contact_id, 
            initial_qty, current_qty, gross_quantity, unit, supplier_rate, 
            commission_percent, less_percent, less_units, 
            loading_cost, farmer_charges, variety, grade, 
            arrival_type, status,
            net_payable
        )
        VALUES (
            v_org_id, v_arrival_id, v_farmer.item_id, v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'), v_farmer.farmer_id, 
            v_net_qty, v_net_qty, v_farmer.qty, v_farmer.unit, v_farmer.rate, 
            v_farmer.commission_percent, v_farmer.less_percent, v_farmer.less_units, 
            v_farmer.loading_charges, v_farmer.other_charges, v_farmer.variety, v_farmer.grade, 
            'commission', 'active',
            COALESCE(v_farmer.net_payable, 0)
        )
        RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
        
        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + COALESCE(v_farmer.commission_amount, 0);
        v_total_purchase := v_total_purchase + COALESCE(v_farmer.net_amount, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);
        
        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'quantity', v_net_qty, 'unit', v_farmer.unit);
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := v_session.buyer_payable - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0);
        v_sale_rate := CASE WHEN v_total_net_qty > 0 THEN ROUND(v_item_amount / v_total_net_qty, 2) ELSE 0 END;
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate_per_unit', v_sale_rate, 'amount', ROUND((v_item->>'quantity')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        PERFORM mandi.confirm_sale_transaction(
            p_organization_id   := v_org_id,
            p_sale_date        := v_session.session_date,
            p_buyer_id         := v_session.buyer_id,
            p_items            := v_final_sale_items,
            p_total_amount     := v_item_amount,
            p_payment_mode     := 'credit',
            p_loading_charges  := COALESCE(v_session.buyer_loading_charges, 0),
            p_other_expenses   := COALESCE(v_session.buyer_packing_charges, 0),
            p_idempotency_key  := p_session_id::TEXT
        );
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'purchase_bill_ids', to_jsonb(v_arrival_ids));
END;
$function$;
