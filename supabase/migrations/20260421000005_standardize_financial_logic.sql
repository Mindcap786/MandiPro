-- MIGRATION: STANDARDIZING FINANCIAL TRANSACTIONS (v5.21)
-- 1. UPDATED confirm_sale_transaction: Handles immediate payments and tagging
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
    v_target_liquid_acc_id UUID;
    v_sale_voucher_id UUID;
    v_lot_codes TEXT := '';
    v_summary_narration TEXT;
    v_payment_mode_tag TEXT;
BEGIN
    -- Idempotency Check
    SELECT id INTO v_sale_id FROM mandi.sales WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
    IF v_sale_id IS NOT NULL THEN
        SELECT bill_no, contact_bill_no INTO v_bill_no, v_contact_bill_no FROM mandi.sales WHERE id = v_sale_id;
        RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'idempotent', true);
    END IF;

    -- Generate Bill Numbers
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    SELECT COALESCE(MAX(contact_bill_no), 0) + 1 INTO v_contact_bill_no FROM mandi.sales WHERE organization_id = p_organization_id AND buyer_id = p_buyer_id;

    -- Calculate Totals
    v_total_inc_tax := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses + p_gst_total - p_discount_amount;

    -- Insert Sale Record
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

    -- Prepare Narration
    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes FROM mandi.lots WHERE id IN (SELECT (value->>'lot_id')::uuid FROM jsonb_array_elements(p_items));
    
    v_payment_mode_tag := CASE 
        WHEN p_payment_mode = 'credit' THEN '[UDHAAR]'
        WHEN p_payment_mode = 'cash' THEN '[CASH]'
        ELSE '[' || UPPER(p_payment_mode) || ']' 
    END;

    v_summary_narration := v_payment_mode_tag || ' Sale Bill #' || v_bill_no || ' (Lot: ' || COALESCE(v_lot_codes, 'N/A') || ')';
    IF p_vehicle_number IS NOT NULL THEN v_summary_narration := v_summary_narration || ' [Veh: ' || p_vehicle_number || ']'; END IF;
    IF p_book_no IS NOT NULL THEN v_summary_narration := v_summary_narration || ' [Book: ' || p_book_no || ']'; END IF;

    -- Resolve Accounts
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Receivable%' OR code = '1200') LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Sales Revenue%' OR code = '4001') LIMIT 1;

    -- Create Voucher
    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, invoice_id, payment_mode, cheque_no, cheque_date, cheque_status, bank_name)
    VALUES (p_organization_id, p_sale_date, 'sale', v_total_inc_tax, v_summary_narration, v_sale_id, p_payment_mode, p_cheque_no, p_cheque_date, CASE WHEN p_cheque_status THEN 'cleared' ELSE 'pending' END, p_bank_name)
    RETURNING id INTO v_sale_voucher_id;

    -- 1. Sale Leg: Debit Buyer (Receivable)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, p_buyer_id, v_ar_acc_id, v_total_inc_tax, 0, p_sale_date, v_summary_narration, v_summary_narration, 'sale', v_sale_id);

    -- 2. Sale Leg: Credit Revenue
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, v_summary_narration, v_summary_narration, 'sale', v_sale_id);

    -- 3. Immediate Payment Legs (If any payment received)
    IF COALESCE(p_amount_received, 0) > 0 THEN
        -- Resolve Target Liquid Account
        IF p_payment_mode = 'cash' THEN
            SELECT id INTO v_target_liquid_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
        ELSE
            -- Bank/UPI/Cheque
            IF p_bank_account_id IS NOT NULL THEN
                v_target_liquid_acc_id := p_bank_account_id;
            ELSE
                SELECT id INTO v_target_liquid_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1;
            END IF;
        END IF;

        IF v_target_liquid_acc_id IS NOT NULL THEN
            -- Debit Liquid Account (Cash/Bank)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (p_organization_id, v_sale_voucher_id, v_target_liquid_acc_id, p_amount_received, 0, p_sale_date, 'Payment Received (Immediate)', v_summary_narration, 'sale_payment', v_sale_id);

            -- Credit Buyer (Receivable) - to settle the debit created above
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (p_organization_id, v_sale_voucher_id, p_buyer_id, v_ar_acc_id, 0, p_amount_received, p_sale_date, 'Payment Settled (Immediate)', v_summary_narration, 'sale_payment', v_sale_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no);
END;
$function$;

-- 2. UPDATED post_arrival_ledger: Handles Arrival Advances and payment legs
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
    v_bank_acc_id UUID;
    v_target_liquid_acc_id UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id UUID;
    v_party_payable_acc_id UUID;

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
    -- Fetch Arrival
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

    -- Clean old entries
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type IN ('purchase', 'purchase_payment')
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    -- Prepare Details
    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes FROM mandi.lots WHERE arrival_id = p_arrival_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'name', COALESCE(comm.name, 'Item'),
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

    -- Narration
    v_summary_desc := CASE 
        WHEN v_arrival_type = 'commission' THEN '[COMMISSION] Arrival #' || v_reference_no
        ELSE '[DIRECT] Purchase #' || v_reference_no
    END || ' (Lot: ' || COALESCE(v_lot_codes, 'N/A') || ')';
    IF v_vehicle_no != '' THEN v_summary_desc := v_summary_desc || ' | Veh: ' || v_vehicle_no; END IF;

    -- Resolve Accounts
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    IF v_purchase_acc_id IS NULL THEN
        SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND type = 'expense' AND (account_sub_type = 'purchase' OR name ILIKE '%purchase%') LIMIT 1;
    END IF;

    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Inventory%' OR name ILIKE '%Stock%') LIMIT 1;
    IF v_inventory_acc_id IS NULL THEN v_inventory_acc_id := v_purchase_acc_id; END IF;

    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Commission Income%' OR code = '4003') LIMIT 1;
    SELECT id INTO v_party_payable_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Payable%' OR code = '2100') LIMIT 1;

    -- Sum up lots
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

    -- Voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id) 
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, v_summary_desc, v_gross_bill, v_party_id, p_arrival_id) 
    RETURNING id INTO v_main_voucher_id;

    -- Ledger Entries
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Goods Received', v_summary_desc, 'purchase', p_arrival_id, v_products);

    IF v_party_id IS NOT NULL THEN
        -- Credit Party (Payable)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, v_party_payable_acc_id, 0, v_net_payable, v_arrival_date, v_summary_desc, v_summary_desc, 'purchase', p_arrival_id, v_products);
        
        -- Charges
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', v_summary_desc, 'purchase', p_arrival_id, NULL);
        END IF;

        -- ADVANCE PAYMENT RECORDING
        IF v_total_paid_advance > 0 THEN
            -- Resolve Liquid Account
            IF COALESCE(v_arrival.advance_payment_mode, 'cash') = 'cash' THEN
                SELECT id INTO v_target_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
            ELSE
                SELECT id INTO v_target_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1;
            END IF;

            IF v_target_liquid_acc_id IS NOT NULL THEN
                -- Debit Party (reducing payable)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_party_id, v_party_payable_acc_id, v_total_paid_advance, 0, v_arrival_date, 'Advance Paid (Immediate)', v_summary_desc, 'purchase_payment', p_arrival_id);

                -- Credit Liquid Account (Cash/Bank)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_target_liquid_acc_id, 0, v_total_paid_advance, v_arrival_date, 'Advance Paid (Immediate Outflow)', v_summary_desc, 'purchase_payment', p_arrival_id);
            END IF;
        END IF;
    END IF;

    UPDATE mandi.arrivals SET status = 'completed' WHERE id = p_arrival_id;
    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'net_payable', v_net_payable);
END;
$function$;
