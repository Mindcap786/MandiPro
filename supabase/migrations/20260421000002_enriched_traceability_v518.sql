-- ============================================================
-- v5.18: Enriched Financial Traceability (Vehicle, Lot, Book)
-- ============================================================

BEGIN;

-- 1. Ensure columns exist on mandi.sales
ALTER TABLE mandi.sales 
    ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
    ADD COLUMN IF NOT EXISTS book_no TEXT;

-- 2. ENRICHED POST_ARRIVAL_LEDGER (v5.18)
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_reference_no TEXT;
    v_arrival_type TEXT;
    v_vehicle_no TEXT;

    -- Accounts
    v_purchase_acc_id UUID;
    v_expense_recovery_acc_id UUID;
    v_cash_acc_id UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id UUID;

    -- Aggregates
    v_total_commission NUMERIC := 0;
    v_total_inventory NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport NUMERIC := 0;
    v_total_paid_advance NUMERIC := 0;
    v_lot_count INT := 0;
    v_products JSONB := '[]'::jsonb;
    v_summary_desc TEXT;
    v_lot_codes TEXT := '';

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_bill NUMERIC;
    v_net_payable NUMERIC;
    v_final_status TEXT := 'pending';
BEGIN
    SELECT a.*, c.name as party_name INTO v_arrival
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;
    v_vehicle_no := COALESCE(v_arrival.vehicle_number, v_arrival.vehicle_no, '');

    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes
    FROM mandi.lots
    WHERE arrival_id = p_arrival_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(comm.name, 'Item'),
            'variety', COALESCE(l.variety, ''),
            'grade', COALESCE(l.grade, ''),
            'lot_no', l.lot_code,
            'qty', CASE WHEN COALESCE(l.less_units, 0) > 0 THEN COALESCE(l.initial_qty, 0) - COALESCE(l.less_units, 0) ELSE COALESCE(l.initial_qty, 0) * (1.0 - COALESCE(l.less_percent, 0) / 100.0) END,
            'unit', COALESCE(l.unit, comm.default_unit, 'Kg'),
            'rate', COALESCE(l.supplier_rate, 0),
            'amount', (CASE WHEN COALESCE(l.less_units, 0) > 0 THEN COALESCE(l.initial_qty, 0) - COALESCE(l.less_units, 0) ELSE COALESCE(l.initial_qty, 0) * (1.0 - COALESCE(l.less_percent, 0) / 100.0) END) * COALESCE(l.supplier_rate, 0)
        )
    ) INTO v_products
    FROM mandi.lots l
    LEFT JOIN mandi.commodities comm ON l.item_id = comm.id
    WHERE l.arrival_id = p_arrival_id;

    IF v_products IS NULL THEN v_products := '[]'::jsonb; END IF;

    IF jsonb_array_length(v_products) = 1 THEN
        v_summary_desc := (v_products->0->>'name') || 
                          CASE WHEN NULLIF(v_products->0->>'variety', '') IS NOT NULL THEN ' (' || (v_products->0->>'variety') || ')' ELSE '' END || ' ' ||
                          (v_products->0->>'qty') || ' ' || (v_products->0->>'unit') || ' @ ' || (v_products->0->>'rate') ||
                          ' | Lot: ' || v_lot_codes;
        IF v_vehicle_no != '' THEN v_summary_desc := v_summary_desc || ' | Veh: ' || v_vehicle_no; END IF;
        v_summary_desc := v_summary_desc || ' | Bill:' || v_reference_no;
    ELSE
        v_summary_desc := 'Pur. Bill #' || v_reference_no || ' (' || jsonb_array_length(v_products) || ' Items) | Lot: ' || v_lot_codes;
        IF v_vehicle_no != '' THEN v_summary_desc := v_summary_desc || ' | Veh: ' || v_vehicle_no; END IF;
    END IF;

    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    IF v_purchase_acc_id IS NULL THEN
        SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'expense' AND (account_sub_type = 'purchase' OR name ILIKE '%purchase%') LIMIT 1;
    END IF;

    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Inventory%' OR name ILIKE '%Stock%') LIMIT 1;
    IF v_inventory_acc_id IS NULL THEN v_inventory_acc_id := v_purchase_acc_id; END IF;

    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    IF v_expense_recovery_acc_id IS NULL THEN
        SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'income' AND name ILIKE '%Recovery%' LIMIT 1;
    END IF;

    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Commission Income%' OR code = '4003') LIMIT 1;
    
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_paid_advance := v_total_paid_advance + COALESCE(v_lot.advance, 0);
            IF v_arrival_type = 'commission' THEN
                v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
                v_total_inventory := v_total_inventory + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                v_total_commission := v_total_commission + ((v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN RETURN jsonb_build_object('success', true, 'msg', 'No lots'); END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_gross_bill := (CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END);
    v_net_payable := v_gross_bill - v_total_commission - v_total_transport;

    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id) 
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, v_summary_desc, v_gross_bill, v_party_id, p_arrival_id) 
    RETURNING id INTO v_main_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Fruit Value', v_summary_desc, 'purchase', p_arrival_id, v_products);

    IF v_party_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_net_payable, v_arrival_date, v_summary_desc, v_summary_desc, 'purchase', p_arrival_id, v_products);
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;
    ELSE
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery (No Party)', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income (No Party)', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;
    END IF;

    v_final_status := COALESCE(v_arrival.status, 'pending');
    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'message', 'Arrival recorded. Net Payable: ' || v_net_payable);
END;
$function$;

-- 3. ENRICHED CONFIRM_SALE_TRANSACTION (v5.18)
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC,
    p_items             JSONB,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_amount_received   NUMERIC DEFAULT NULL,
    p_idempotency_key   TEXT DEFAULT NULL,
    p_due_date          DATE DEFAULT NULL,
    p_bank_account_id   UUID DEFAULT NULL,
    p_cheque_no         TEXT DEFAULT NULL,
    p_cheque_date       DATE DEFAULT NULL,
    p_cheque_status     BOOLEAN DEFAULT FALSE,
    p_bank_name         TEXT DEFAULT NULL,
    p_cgst_amount       NUMERIC DEFAULT 0,
    p_sgst_amount       NUMERIC DEFAULT 0,
    p_igst_amount       NUMERIC DEFAULT 0,
    p_gst_total         NUMERIC DEFAULT 0,
    p_discount_percent  NUMERIC DEFAULT 0,
    p_discount_amount   NUMERIC DEFAULT 0,
    p_place_of_supply   TEXT DEFAULT NULL,
    p_buyer_gstin       TEXT DEFAULT NULL,
    p_is_igst           BOOLEAN DEFAULT FALSE,
    p_vehicle_number    TEXT DEFAULT NULL,
    p_book_no           TEXT DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_total_inc_tax NUMERIC;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_sale_voucher_id UUID;
    v_item RECORD;
    v_lot_codes TEXT := '';
    v_summary_narration TEXT;
BEGIN
    SELECT id INTO v_sale_id FROM mandi.sales WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
    IF v_sale_id IS NOT NULL THEN
        SELECT bill_no, contact_bill_no INTO v_bill_no, v_contact_bill_no FROM mandi.sales WHERE id = v_sale_id;
        RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'idempotent', true);
    END IF;

    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    SELECT COALESCE(MAX(contact_bill_no), 0) + 1 INTO v_contact_bill_no FROM mandi.sales WHERE organization_id = p_organization_id AND buyer_id = p_buyer_id;

    v_total_inc_tax := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses + p_gst_total - p_discount_amount;

    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, 
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, 
        other_expenses, amount_received, idempotency_key, due_date, 
        bill_no, contact_bill_no, vehicle_number, book_no
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges,
        p_other_expenses, COALESCE(p_amount_received, 0), p_idempotency_key, p_due_date,
        v_bill_no, v_contact_bill_no, p_vehicle_number, p_book_no
    ) RETURNING id INTO v_sale_id;

    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes FROM mandi.lots WHERE id IN (SELECT (value->>'lot_id')::uuid FROM jsonb_array_elements(p_items));

    v_summary_narration := 'Sale Bill #' || v_bill_no || ' (Lot: ' || COALESCE(v_lot_codes, 'N/A') || ')';
    IF p_vehicle_number IS NOT NULL THEN v_summary_narration := v_summary_narration || ' [Veh: ' || p_vehicle_number || ']'; END IF;
    IF p_book_no IS NOT NULL THEN v_summary_narration := v_summary_narration || ' [Book: ' || p_book_no || ']'; END IF;

    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Receivable%' OR code = '1200') LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Sales Revenue%' OR code = '4001') LIMIT 1;

    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, invoice_id)
    VALUES (p_organization_id, p_sale_date, 'sale', v_total_inc_tax, v_summary_narration, v_sale_id)
    RETURNING id INTO v_sale_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, p_buyer_id, v_ar_acc_id, v_total_inc_tax, 0, p_sale_date, v_summary_narration, v_summary_narration, 'sale', v_sale_id);

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, v_summary_narration, v_summary_narration, 'sale', v_sale_id);

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no);
END;
$function$;

-- 4. UPDATED COMMIT_MANDI_SESSION (v5.18)
CREATE OR REPLACE FUNCTION mandi.commit_mandi_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mandi', 'public', 'extensions'
AS $function$
DECLARE
    v_session RECORD;
    v_farmer RECORD;
    v_org_id UUID;
    v_lot_prefix TEXT;
    v_arrival_id UUID;
    v_lot_id UUID;
    v_bill_no BIGINT;
    v_less_units_calc NUMERIC;
    v_net_qty NUMERIC;
    v_gross_amount NUMERIC;
    v_less_amount NUMERIC;
    v_net_amount NUMERIC;
    v_commission_amount NUMERIC;
    v_net_payable NUMERIC;
    v_total_net_qty NUMERIC := 0;
    v_total_commission NUMERIC := 0;
    v_total_purchase NUMERIC := 0;
    v_sale_items_tmp JSONB := '[]'::JSONB;
    v_final_sale_items JSONB := '[]'::JSONB;
    v_item JSONB;
    v_item_amount NUMERIC := 0;
    v_sale_rate NUMERIC := 0;
    v_buyer_sale_id UUID;
    v_arrival_ids UUID[] := '{}';
BEGIN
    SELECT * INTO v_session FROM mandi.mandi_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
    IF v_session.status = 'committed' THEN RAISE EXCEPTION 'Session already committed'; END IF;

    v_org_id := v_session.organization_id;
    v_lot_prefix := COALESCE(NULLIF(v_session.lot_no, ''), 'MCS-' || TO_CHAR(v_session.session_date, 'YYMMDD'));

    FOR v_farmer IN SELECT * FROM mandi.mandi_session_farmers WHERE session_id = p_session_id ORDER BY sort_order, created_at LOOP
        v_less_units_calc := CASE WHEN COALESCE(v_farmer.less_units, 0) > 0 THEN v_farmer.less_units WHEN COALESCE(v_farmer.less_percent, 0) > 0 THEN ROUND(v_farmer.qty * v_farmer.less_percent / 100.0, 3) ELSE 0 END;
        v_net_qty := GREATEST(COALESCE(v_farmer.qty, 0) - v_less_units_calc, 0);
        v_gross_amount := ROUND(COALESCE(v_farmer.qty, 0) * COALESCE(v_farmer.rate, 0), 2);
        v_less_amount := ROUND(v_less_units_calc * COALESCE(v_farmer.rate, 0), 2);
        v_net_amount := ROUND(v_net_qty * COALESCE(v_farmer.rate, 0), 2);
        v_commission_amount := ROUND(v_net_amount * COALESCE(v_farmer.commission_percent, 0) / 100.0, 2);
        v_net_payable := ROUND(v_net_amount - v_commission_amount - COALESCE(v_farmer.loading_charges, 0) - COALESCE(v_farmer.other_charges, 0), 2);

        UPDATE mandi.mandi_session_farmers SET less_units = v_less_units_calc, net_qty = v_net_qty, gross_amount = v_gross_amount, less_amount = v_less_amount, net_amount = v_net_amount, commission_amount = v_commission_amount, net_payable = v_net_payable WHERE id = v_farmer.id;

        SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.arrivals WHERE organization_id = v_org_id;

        INSERT INTO mandi.arrivals (organization_id, arrival_date, party_id, arrival_type, lot_prefix, vehicle_number, reference_no, bill_no, status, advance, advance_payment_mode)
        VALUES (v_org_id, v_session.session_date, v_farmer.farmer_id, 'commission', v_lot_prefix, NULLIF(v_session.vehicle_no, ''), NULLIF(v_session.book_no, ''), v_bill_no, 'pending', 0, 'credit')
        RETURNING id INTO v_arrival_id;

        INSERT INTO mandi.lots (organization_id, arrival_id, item_id, contact_id, lot_code, initial_qty, current_qty, gross_quantity, unit, supplier_rate, commission_percent, less_percent, less_units, packing_cost, loading_cost, farmer_charges, variety, grade, arrival_type, status, net_payable, payment_status)
        VALUES (v_org_id, v_arrival_id, v_farmer.item_id, v_farmer.farmer_id, v_lot_prefix || '-' || LPAD(v_bill_no::TEXT, 3, '0'), v_net_qty, v_net_qty, v_farmer.qty, COALESCE(v_farmer.unit, 'Kg'), COALESCE(v_farmer.rate, 0), COALESCE(v_farmer.commission_percent, 0), COALESCE(v_farmer.less_percent, 0), v_less_units_calc, 0, COALESCE(v_farmer.loading_charges, 0), COALESCE(v_farmer.other_charges, 0), NULLIF(v_farmer.variety, ''), COALESCE(NULLIF(v_farmer.grade, ''), 'A'), 'commission', 'active', GREATEST(v_net_payable, 0), 'pending')
        RETURNING id INTO v_lot_id;

        UPDATE mandi.mandi_session_farmers SET arrival_id = v_arrival_id WHERE id = v_farmer.id;
        PERFORM mandi.post_arrival_ledger(v_arrival_id);

        v_total_net_qty := v_total_net_qty + v_net_qty;
        v_total_commission := v_total_commission + v_commission_amount;
        v_total_purchase := v_total_purchase + GREATEST(v_net_payable, 0);
        v_arrival_ids := array_append(v_arrival_ids, v_arrival_id);

        v_sale_items_tmp := v_sale_items_tmp || jsonb_build_object('lot_id', v_lot_id, 'item_id', v_farmer.item_id, 'qty', v_net_qty, 'unit', COALESCE(v_farmer.unit, 'Kg'));
    END LOOP;

    IF v_session.buyer_id IS NOT NULL AND v_total_net_qty > 0 THEN
        v_item_amount := ROUND(COALESCE(v_session.buyer_payable, 0) - COALESCE(v_session.buyer_loading_charges, 0) - COALESCE(v_session.buyer_packing_charges, 0), 2);
        v_sale_rate := ROUND(v_item_amount / v_total_net_qty, 2);

        FOR v_item IN SELECT value FROM jsonb_array_elements(v_sale_items_tmp) LOOP
            v_final_sale_items := v_final_sale_items || (v_item || jsonb_build_object('rate', v_sale_rate, 'amount', ROUND((v_item->>'qty')::NUMERIC * v_sale_rate, 2)));
        END LOOP;

        SELECT (mandi.confirm_sale_transaction(
            p_organization_id := v_org_id, p_buyer_id := v_session.buyer_id, p_sale_date := v_session.session_date,
            p_payment_mode := 'credit', p_total_amount := v_item_amount, p_items := v_final_sale_items,
            p_loading_charges := COALESCE(v_session.buyer_loading_charges, 0), p_other_expenses := COALESCE(v_session.buyer_packing_charges, 0),
            p_amount_received := 0, p_idempotency_key := 'mcs-' || p_session_id::TEXT,
            p_vehicle_number := v_session.vehicle_no, p_book_no := v_session.book_no
        ))->>'sale_id'::TEXT INTO v_buyer_sale_id;
    END IF;

    UPDATE mandi.mandi_sessions SET status = 'committed', buyer_sale_id = v_buyer_sale_id, total_purchase = v_total_purchase, total_commission = v_total_commission, updated_at = NOW() WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'purchase_bill_ids', to_jsonb(v_arrival_ids), 'sale_bill_id', v_buyer_sale_id, 'total_commission', v_total_commission, 'total_purchase', v_total_purchase, 'total_net_qty', v_total_net_qty);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;

COMMIT;
