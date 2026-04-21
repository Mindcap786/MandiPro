-- Reporting Enrichment: Enforce Lot/Bill identifiers in Ledgers and Daybook
-- Optimized for MandiPro Finance Stability

BEGIN;

-- 1. Enrich post_arrival_ledger to include Lot Codes in narration
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_temp_lot RECORD;
    v_item_names text;
    v_lot_codes text;
    v_narration text;
    v_bill_label text;
    v_org_id uuid;
    v_party_id uuid;
    v_total_payable numeric := 0;
    v_inventory_acc_id uuid;
    v_ap_acc_id uuid;
    v_cash_acc_id uuid;
    v_bank_acc_id uuid;
    v_payment_acc_id uuid;
    v_purchase_voucher_id uuid;
    v_payment_voucher_id uuid;
    v_next_v_no bigint;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- A. FORCE Math Refresh
    FOR v_temp_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id
    LOOP
        PERFORM mandi.refresh_lot_payment_status(v_temp_lot.id);
    END LOOP;

    -- B. Account Lookups
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'inventory' OR name ILIKE '%Stock%' OR code = '1200') ORDER BY (account_sub_type = 'inventory') DESC LIMIT 1;
    SELECT id INTO v_ap_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'accounts_payable' OR name ILIKE '%Payable%' OR name ILIKE '%Farmer%' OR code = '2100') ORDER BY (account_sub_type = 'accounts_payable') DESC LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'cash' OR name ILIKE 'Cash%') ORDER BY (code = '1001') DESC LIMIT 1;
    SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'bank' OR name ILIKE 'Bank%') ORDER BY (code = '1002') DESC LIMIT 1;
    IF v_arrival.advance_bank_account_id IS NOT NULL THEN v_bank_acc_id := v_arrival.advance_bank_account_id; END IF;

    -- C. Totals
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;
    
    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.bill_no::text, 'NEW');
    
    -- REDESIGN: Rich Narration with Lots
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names FROM mandi.lots l JOIN mandi.commodities i ON l.item_id = i.id WHERE l.arrival_id = p_arrival_id;
    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes FROM mandi.lots WHERE arrival_id = p_arrival_id;
    
    v_narration := 'Purchase #' || v_bill_label || ' | Lots: ' || COALESCE(v_lot_codes, '-') || ' | ' || COALESCE(v_item_names, 'Goods');

    -- D. CLEANUP
    DELETE FROM mandi.ledger_entries WHERE arrival_id = p_arrival_id;
    DELETE FROM mandi.vouchers WHERE arrival_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- E. CREATE VOUCHERS & LEDGERS
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, status)
    VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_next_v_no, v_total_payable, v_narration, v_party_id, p_arrival_id, p_arrival_id, 'active')
    RETURNING id INTO v_purchase_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

    -- F. ADVANCES
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        v_payment_acc_id := CASE WHEN LOWER(COALESCE(v_arrival.advance_payment_mode, 'cash')) IN ('bank', 'upi', 'cheque') THEN COALESCE(v_bank_acc_id, v_cash_acc_id) ELSE v_cash_acc_id END;
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, payment_mode, status)
        VALUES (v_org_id, v_arrival.arrival_date, 'payment', v_next_v_no, v_arrival.advance_amount, 'Advance on Bill #' || v_bill_label, v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, 'active')
        RETURNING id INTO v_payment_voucher_id;
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_payment_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');
    END IF;
END;
$function$;

-- 2. Enrich confirm_sale_transaction to include Lot Codes in narration
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   uuid,
    p_buyer_id          uuid,
    p_sale_date         date,
    p_payment_mode      text,
    p_total_amount      numeric,
    p_items             jsonb,
    p_market_fee        numeric  DEFAULT 0,
    p_nirashrit         numeric  DEFAULT 0,
    p_misc_fee          numeric  DEFAULT 0,
    p_loading_charges   numeric  DEFAULT 0,
    p_unloading_charges numeric  DEFAULT 0,
    p_other_expenses    numeric  DEFAULT 0,
    p_amount_received   numeric  DEFAULT NULL,
    p_idempotency_key   text     DEFAULT NULL,
    p_due_date          date     DEFAULT NULL,
    p_bank_account_id   uuid     DEFAULT NULL,
    p_cheque_no         text     DEFAULT NULL,
    p_cheque_date       date     DEFAULT NULL,
    p_cheque_status     boolean  DEFAULT false,
    p_bank_name         text     DEFAULT NULL,
    p_cgst_amount       numeric  DEFAULT 0,
    p_sgst_amount       numeric  DEFAULT 0,
    p_igst_amount       numeric  DEFAULT 0,
    p_gst_total         numeric  DEFAULT 0,
    p_discount_percent  numeric  DEFAULT 0,
    p_discount_amount   numeric  DEFAULT 0,
    p_place_of_supply   text     DEFAULT NULL,
    p_buyer_gstin       text     DEFAULT NULL,
    p_is_igst           boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_sale_id            UUID;
    v_bill_no            BIGINT;
    v_contact_bill_no    BIGINT;
    v_voucher_id         UUID;
    v_receipt_voucher_id UUID;
    v_item               JSONB;
    v_qty                NUMERIC;
    v_rate               NUMERIC;
    v_total_inc_tax      NUMERIC;
    v_ar_acc_id              UUID;
    v_sales_revenue_acc_id   UUID;
    v_cash_acc_id            UUID;
    v_bank_acc_id            UUID;
    v_cheques_transit_acc_id UUID;
    v_payment_acc_id         UUID;
    v_mode_lower      TEXT    := LOWER(COALESCE(p_payment_mode, ''));
    v_payment_status  TEXT;
    v_received        NUMERIC := 0;
    v_next_voucher_no BIGINT;
    v_lot_codes       TEXT;
    v_rec             RECORD;
BEGIN
    -- Idempotency check 
    IF p_idempotency_key IS NOT NULL THEN
        FOR v_rec IN (SELECT id, bill_no, contact_bill_no, payment_status, amount_received
                      FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1) LOOP
            RETURN jsonb_build_object('success', true, 'sale_id', v_rec.id, 'bill_no', v_rec.bill_no,
                'contact_bill_no', v_rec.contact_bill_no, 'payment_status', v_rec.payment_status,
                'amount_received', v_rec.amount_received, 'message', 'Idempotent request ignored');
        END LOOP;
    END IF;

    -- Accounts Lookup
    v_ar_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1100' OR account_sub_type = 'accounts_receivable') ORDER BY (code = '1100') DESC LIMIT 1);
    v_sales_revenue_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4001' OR name ILIKE 'Sales%Revenue%' OR name ILIKE 'Sale%') ORDER BY (code = '4001') DESC LIMIT 1);
    v_cash_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%') ORDER BY (code = '1001') DESC LIMIT 1);
    
    IF p_bank_account_id IS NOT NULL THEN v_bank_acc_id := p_bank_account_id;
    ELSE v_bank_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%') ORDER BY (code = '1002') DESC LIMIT 1);
    END IF;

    v_cheques_transit_acc_id := (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id AND (account_sub_type IN ('cheque','cheques_in_transit') OR name ILIKE '%Cheque%') LIMIT 1);
    IF v_ar_acc_id IS NULL THEN v_ar_acc_id := v_cash_acc_id; END IF;
    IF v_sales_revenue_acc_id IS NULL THEN v_sales_revenue_acc_id := v_cash_acc_id; END IF;
    IF v_cash_acc_id IS NULL THEN RAISE EXCEPTION 'SETUP_ERROR: Cash account not found.'; END IF;

    v_total_inc_tax := ROUND((COALESCE(p_total_amount,0) + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0) - COALESCE(p_discount_amount,0))::NUMERIC, 2);

    -- Payment status logic
    IF v_mode_lower IN ('cash','upi','bank_transfer','upi_cash','bank_upi','upi/bank','neft','rtgs') THEN
        IF p_amount_received IS NOT NULL AND p_amount_received < (v_total_inc_tax - 0.01) THEN v_payment_status := 'partial'; v_received := p_amount_received;
        ELSE v_payment_status := 'paid'; v_received := COALESCE(p_amount_received, v_total_inc_tax); END IF;
    ELSIF v_mode_lower = 'cheque' THEN
        v_payment_status := CASE WHEN p_cheque_status THEN 'paid' ELSE 'pending' END;
        v_received := CASE WHEN p_cheque_status THEN COALESCE(p_amount_received, v_total_inc_tax) ELSE 0 END;
    ELSE 
        v_payment_status := CASE WHEN COALESCE(p_amount_received, 0) > 0 THEN (CASE WHEN p_amount_received >= (v_total_inc_tax - 0.01) THEN 'paid' ELSE 'partial' END) ELSE 'pending' END;
        v_received := COALESCE(p_amount_received, 0);
    END IF;

    -- Lot Codes for Narration
    SELECT string_agg(DISTINCT lot_code, ', ') INTO v_lot_codes
    FROM mandi.lots WHERE id IN (SELECT (value->>'lot_id')::UUID FROM jsonb_array_elements(p_items) WHERE (value->>'lot_id') IS NOT NULL);

    -- Insert Sale
    INSERT INTO mandi.sales (organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax, payment_mode, payment_status, amount_received, market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses, due_date, cheque_no, cheque_date, bank_name, bank_account_id, cgst_amount, sgst_amount, igst_amount, gst_total, discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key)
    VALUES (p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax, p_payment_mode, v_payment_status, v_received, COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0), COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0), p_due_date, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id, COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0), COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0), p_place_of_supply, p_buyer_gstin, p_idempotency_key)
    RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- Insert items
    FOR v_item IN (SELECT value FROM jsonb_array_elements(p_items)) LOOP
        v_qty  := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, organization_id)
            VALUES (v_sale_id, CASE WHEN (v_item->>'lot_id') IS NOT NULL THEN (v_item->>'lot_id')::UUID ELSE NULL END, v_qty, v_rate, ROUND(v_qty * v_rate, 2), p_organization_id);
            IF (v_item->>'lot_id') IS NOT NULL THEN
                UPDATE mandi.lots SET current_qty = ROUND(COALESCE(current_qty,0) - v_qty, 3) WHERE id = (v_item->>'lot_id')::UUID;
            END IF;
        END IF;
    END LOOP;

    -- Voucher & Ledger
    SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_next_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id)
    VALUES (p_organization_id, p_sale_date, 'sale', v_next_voucher_no, v_total_inc_tax, 'Sale Invoice #' || v_bill_no, v_sale_id)
    RETURNING id INTO v_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES
    (p_organization_id, v_voucher_id, v_ar_acc_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 'Sale Bill #' || v_bill_no || ' | Lots: ' || COALESCE(v_lot_codes, '-') || ' | ' || COALESCE(p_payment_mode,''), 'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL, 0, v_total_inc_tax, p_sale_date, 'Sales Revenue - Bill #' || v_bill_no, 'sale', v_sale_id);

    -- Receipt logic
    IF v_received > 0 AND v_mode_lower NOT IN ('udhaar','credit') THEN
        v_payment_acc_id := CASE WHEN v_mode_lower IN ('cash','upi','upi_cash','bank_upi','upi/bank') THEN v_cash_acc_id WHEN v_mode_lower IN ('bank_transfer','neft','rtgs') THEN COALESCE(v_bank_acc_id, v_cash_acc_id) WHEN v_mode_lower = 'cheque' THEN COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id) ELSE v_cash_acc_id END;
        SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_next_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt';
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id)
        VALUES (p_organization_id, p_sale_date, 'receipt', v_next_voucher_no, v_received, 'Payment on Sale #' || v_bill_no || ' via ' || COALESCE(p_payment_mode,''), v_sale_id)
        RETURNING id INTO v_receipt_voucher_id;
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES
        (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, NULL, v_received, 0, p_sale_date, 'Payment on Sale #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'') || ')', 'receipt', v_receipt_voucher_id),
        (p_organization_id, v_receipt_voucher_id, v_ar_acc_id, p_buyer_id, 0, v_received, p_sale_date, 'Payment on Sale #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'') || ')', 'receipt', v_receipt_voucher_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status, 'amount_received', v_received);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Update Daybook RPC to ensure Lots are ALWAYS visible in descriptions for historical data
CREATE OR REPLACE FUNCTION mandi.get_daybook_transactions(
    p_organization_id uuid,
    p_from_date date,
    p_to_date date
)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_rows jsonb;
BEGIN
    WITH daybook_base AS (
        SELECT 
            le.id, le.entry_date, le.created_at, le.contact_id, c.name as party_name,
            -- DYNAMIC DESCRIPTION: Prepend Lot Codes if missing
            CASE 
                -- If it's a purchase and lot codes aren't in description
                WHEN le.transaction_type = 'purchase' AND le.description NOT ILIKE '%Lot%' THEN
                    COALESCE(le.description, '') || ' | Lots: ' || (SELECT string_agg(lot_code, ', ') FROM mandi.lots WHERE arrival_id = le.arrival_id)
                -- If it's a sale and lot codes aren't in description
                WHEN le.transaction_type = 'sale' AND le.description NOT ILIKE '%Lot%' THEN
                    COALESCE(le.description, '') || ' | Lots: ' || (SELECT string_agg(DISTINCT l.lot_code, ', ') FROM mandi.sale_items si JOIN mandi.lots l ON si.lot_id = l.id WHERE si.sale_id = le.reference_id)
                ELSE le.description
            END as enriched_description,
            le.debit, le.credit, le.transaction_type, le.voucher_id, le.products,
            COALESCE(s.contact_bill_no, a.bill_no, le.header_voucher_no, 0) as logical_ref_no,
            CASE 
                WHEN le.transaction_type IN ('sale', 'sales_revenue', 'purchase', 'lot_purchase', 'arrival') THEN 1
                WHEN le.transaction_type IN ('sale_payment', 'purchase_payment', 'receipt', 'payment') THEN 2
                ELSE 3
            END as sort_rank,
            CASE 
                WHEN le.transaction_type IN ('sale', 'sales_revenue', 'sale_payment') THEN 'SALE'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment', 'lot_purchase', 'arrival') THEN 'PURCHASE'
                WHEN le.transaction_type IN ('receipt', 'cash_receipt', 'sale_payment') AND le.credit > 0 THEN 'RECEIPT'
                WHEN le.transaction_type IN ('payment', 'purchase_payment') AND le.debit > 0 THEN 'PAYMENT'
                ELSE 'OTHER'
            END as section_type,
            CASE 
                WHEN le.transaction_type IN ('sale', 'sales_revenue') AND le.debit > 0 THEN 'Sale Invoice'
                WHEN le.transaction_type IN ('sale', 'sales_revenue', 'sale_payment', 'receipt', 'cash_receipt') AND le.credit > 0 THEN 'Cash Collected'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment', 'lot_purchase', 'arrival') AND le.credit > 0 THEN 'Purchase Bill'
                WHEN le.transaction_type IN ('purchase', 'purchase_payment') AND le.debit > 0 THEN 'Purchase Payment'
                WHEN le.transaction_type IN ('receipt', 'cash_receipt') THEN 'Cash Received'
                WHEN le.transaction_type = 'payment' THEN 'Payment Made'
                ELSE le.description
            END as category,
            ROW_NUMBER() OVER (PARTITION BY le.voucher_id, le.transaction_type ORDER BY le.id) as entry_seq
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.contacts c ON c.id = le.contact_id
        LEFT JOIN mandi.sales s ON s.id = (CASE WHEN le.transaction_type IN ('sale','receipt') THEN le.reference_id ELSE NULL END)
        LEFT JOIN mandi.arrivals a ON a.id = (CASE WHEN le.transaction_type IN ('purchase','payment') THEN le.reference_id ELSE NULL END)
        WHERE le.organization_id = p_organization_id
            AND le.entry_date BETWEEN p_from_date AND p_to_date
            AND COALESCE(le.status, 'active') IN ('active', 'posted')
            AND NOT (le.transaction_type IN ('sale_fee', 'sale_expense', 'gst')
                OR COALESCE(le.description, '') ILIKE ANY (ARRAY[
                    'Sales Revenue%', 'Sale Revenue%', 'Commission Income%',
                    'Transport Expense Recovery%', 'Transport Recovery Income%',
                    'Advance Contra (%', 'Stock In - %'
                ]))
    ),
    distinct_txns AS (SELECT * FROM daybook_base WHERE entry_seq = 1)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', dt.id::text, 'date', TO_CHAR(dt.entry_date, 'DD Mon YYYY'), 'time', TO_CHAR(dt.created_at, 'HH24:MI'),
            'section', dt.section_type, 'category', dt.category, 'party', COALESCE(dt.party_name, '-'),
            'description', COALESCE(dt.enriched_description, ''),
            'reference', '#' || COALESCE(dt.logical_ref_no::text, '-'),
            'naam', dt.debit, 'jama', dt.credit, 'products', COALESCE(dt.products, '[]'::jsonb)
        )
        ORDER BY dt.entry_date DESC, dt.logical_ref_no DESC, dt.sort_rank ASC, dt.created_at DESC
    ) INTO v_rows FROM distinct_txns dt;

    RETURN jsonb_build_object('success', true, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

COMMIT;
