-- MANDIPRO FINANCE STABILIZATION FINAL V3 (V7.2)
-- Goal: Fix crashes, parameter conflicts, and restore rich ledger details.

-- 0. CLEANUP OLD OVERLOADS TO PREVENT CONFLICTS
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(uuid, uuid, timestamp with time zone, timestamp with time zone);


-- 1. FIX post_arrival_ledger (party_id mapping)
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

    -- Supplier Credit (FIXED: party_id instead of contact_id)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_arrival.organization_id, v_voucher_id, v_ap_acc_id, v_arrival.party_id, 0, v_arrival_total, v_arrival.created_at, v_purchase_narration, 'purchase', p_arrival_id);
END;
$$;


-- 2. FIX confirm_sale_transaction (Rich Details Mapping)
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id         UUID,
    p_sale_date        DATE,
    p_payment_mode     TEXT,
    p_total_amount     NUMERIC,
    p_items            JSONB,
    p_market_fee       NUMERIC DEFAULT 0,
    p_nirashrit       NUMERIC DEFAULT 0,
    p_misc_fee         NUMERIC DEFAULT 0,
    p_loading_charges  NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses   NUMERIC DEFAULT 0,
    p_amount_received  NUMERIC DEFAULT NULL,
    p_idempotency_key  TEXT DEFAULT NULL,
    p_due_date        DATE DEFAULT NULL,
    p_bank_account_id  UUID DEFAULT NULL,
    p_cheque_no       TEXT DEFAULT NULL,
    p_cheque_date     DATE DEFAULT NULL,
    p_cheque_status   BOOLEAN DEFAULT FALSE,
    p_bank_name       TEXT DEFAULT NULL,
    p_cgst_amount     NUMERIC DEFAULT 0,
    p_sgst_amount     NUMERIC DEFAULT 0,
    p_igst_amount     NUMERIC DEFAULT 0,
    p_gst_total       NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_amount  NUMERIC DEFAULT 0,
    p_place_of_supply  TEXT DEFAULT NULL,
    p_buyer_gstin     TEXT DEFAULT NULL,
    p_is_igst         BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_receipt_voucher_id UUID;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_cash_acc_id UUID;
    v_bank_acc_id UUID;
    v_cheques_transit_acc_id UUID;
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
    v_receipt_narration TEXT;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_charges_total NUMERIC;
BEGIN
    -- Account lookup
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'accounts_receivable' LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'operating_revenue' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cash' LIMIT 1;
    SELECT id INTO v_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'bank' LIMIT 1;
    SELECT id INTO v_cheques_transit_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND account_sub_type = 'cheques_in_transit' LIMIT 1;

    v_total_inc_tax := ROUND((p_total_amount + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0) - COALESCE(p_discount_amount,0))::NUMERIC, 2);

    IF v_mode_lower IN ('cash','upi','bank_transfer','upi_cash','bank_upi','upi/bank','neft','rtgs') THEN
        IF p_amount_received IS NOT NULL AND p_amount_received < (v_total_inc_tax - 0.01) THEN v_payment_status := 'partial'; v_received := p_amount_received; ELSE v_payment_status := 'paid'; v_received := COALESCE(p_amount_received, v_total_inc_tax); END IF;
    ELSIF v_mode_lower = 'cheque' THEN v_payment_status := CASE WHEN p_cheque_status THEN 'paid' ELSE 'pending' END; v_received := CASE WHEN p_cheque_status THEN COALESCE(p_amount_received, v_total_inc_tax) ELSE 0 END;
    ELSIF v_mode_lower IN ('udhaar','credit') THEN v_payment_status := 'pending'; v_received := 0;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN v_payment_status := CASE WHEN p_amount_received >= (v_total_inc_tax - 0.01) THEN 'paid' ELSE 'partial' END; v_received := p_amount_received;
    ELSE v_payment_status := 'pending'; v_received := 0; END IF;

    -- 1. Create Sale Header
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, amount_received, market_fee, nirashrit,
        misc_fee, loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id, cgst_amount,
        sgst_amount, igst_amount, gst_total, discount_percent, discount_amount,
        place_of_supply, buyer_gstin, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, v_received, COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0),
        COALESCE(p_misc_fee,0), COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0), p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id, COALESCE(p_cgst_amount,0),
        COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0), COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0),
        p_place_of_supply, p_buyer_gstin, p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 2. Create Sale Items and gather details
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0); 
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        
        IF (v_item->>'lot_id') IS NOT NULL THEN
            SELECT lot_code INTO v_temp_lot_no FROM mandi.lots WHERE id = (v_item->>'lot_id')::UUID;
            SELECT i1.name INTO v_temp_item_name FROM mandi.commodities i1 JOIN mandi.lots l1 ON l1.item_id = i1.id WHERE l1.id = (v_item->>'lot_id')::UUID;
            v_item_details := v_item_details || COALESCE(v_temp_item_name,'Item') || ' (' || v_qty || ' @ ₹' || v_rate || ', Lot: ' || COALESCE(v_temp_lot_no,'-') || ') ';
        END IF;

        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, item_id, qty, rate, amount, organization_id) 
            VALUES (v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'item_id')::UUID, v_qty, v_rate, ROUND(v_qty * v_rate, 2), p_organization_id);
            
            IF (v_item->>'lot_id') IS NOT NULL THEN 
                UPDATE mandi.lots SET current_qty = ROUND(COALESCE(current_qty,0) - v_qty, 3) WHERE id = (v_item->>'lot_id')::UUID; 
            END IF;
        END IF;
    END LOOP;
    
    v_charges_total := COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0) + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0) + COALESCE(p_gst_total,0);
    v_sale_narration := 'Sale Invoice #' || COALESCE(v_contact_bill_no::text, v_bill_no::text) || ' | ' || TRIM(v_item_details);
    IF v_charges_total > 0 THEN v_sale_narration := v_sale_narration || ' | Fee/Exp: ₹' || v_charges_total; END IF;

    -- 3. Vouchers
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id) 
    VALUES (p_organization_id, p_sale_date, 'sale', (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale'), v_total_inc_tax, v_sale_narration, v_sale_id)
    RETURNING id INTO v_voucher_id;

    -- 4. Ledger Entries
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES 
    (p_organization_id, v_voucher_id, v_ar_acc_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, v_sale_narration, 'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL, 0, v_total_inc_tax, p_sale_date, v_sale_narration, 'sale', v_sale_id);

    -- 5. Receipt (if paid)
    IF v_received > 0 AND v_mode_lower NOT IN ('udhaar','credit') THEN
        v_payment_acc_id := CASE WHEN v_mode_lower IN ('cash','upi','upi_cash','bank_upi','upi/bank') THEN v_cash_acc_id WHEN v_mode_lower IN ('bank_transfer','neft','rtgs') THEN COALESCE(v_bank_acc_id, v_cash_acc_id) WHEN v_mode_lower = 'cheque' THEN COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id) ELSE v_cash_acc_id END;
        v_receipt_narration := 'Payment for Invoice #' || COALESCE(v_contact_bill_no::text, v_bill_no::text);

        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id) 
        VALUES (p_organization_id, p_sale_date, 'receipt', (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt'), v_received, v_receipt_narration, v_sale_id)
        RETURNING id INTO v_receipt_voucher_id;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES
        (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, NULL, v_received, 0, p_sale_date, v_receipt_narration, 'receipt', v_receipt_voucher_id),
        (p_organization_id, v_receipt_voucher_id, v_ar_acc_id, p_buyer_id, 0, v_received, p_sale_date, v_receipt_narration, 'receipt', v_receipt_voucher_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status, 'amount_received', v_received);
EXCEPTION WHEN OTHERS THEN 
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$$;


-- 3. UPGRADE get_ledger_statement (Rich Display logic)
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_start_date      DATE,
    p_end_date        DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows            JSONB;
    v_closing_balance NUMERIC;
    v_last_activity   TIMESTAMPTZ;
    v_contact_type    TEXT;
BEGIN
    SELECT type INTO v_contact_type FROM mandi.contacts WHERE id = p_contact_id;

    v_opening_balance := COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM mandi.ledger_entries
         WHERE organization_id = p_organization_id
           AND contact_id = p_contact_id
           AND entry_date < p_start_date), 
        0
    );

    v_last_activity := (SELECT MAX(entry_date) FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id);

    v_closing_balance := COALESCE(
        (SELECT SUM(debit) - SUM(credit)
         FROM mandi.ledger_entries
         WHERE organization_id = p_organization_id
           AND contact_id = p_contact_id
           AND entry_date <= p_end_date), 
        0
    );

    v_rows := (
        WITH raw_data AS (
            SELECT
                le.id, le.entry_date, le.voucher_id, le.transaction_type, le.description AS raw_description,
                le.debit, le.credit, le.reference_no, le.reference_id,
                COALESCE(a.id, v.arrival_id) AS arrival_id_calc,
                a.bill_no AS arrival_bill_no, a.reference_no AS arrival_ref_no,
                v.type AS v_type, v.voucher_no AS v_voucher_no, v.narration AS v_narration, v.invoice_id AS v_invoice_id,
                s.bill_no AS sale_bill_no, s.contact_bill_no AS sale_contact_bill_no,
                COALESCE(le.voucher_id::text, le.reference_id::text, le.id::text) AS group_id
            FROM  mandi.ledger_entries le
            LEFT  JOIN mandi.vouchers v ON le.voucher_id = v.id
            LEFT  JOIN mandi.sales s ON (le.reference_id = s.id OR v.invoice_id = s.id)
            LEFT  JOIN mandi.arrivals a ON (
                (le.transaction_type IN ('purchase', 'arrival', 'lot_purchase') AND le.reference_id = a.id)
                OR (le.reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = a.id))
                OR v.arrival_id = a.id
            )
            WHERE le.organization_id = p_organization_id
              AND le.contact_id      = p_contact_id
              AND le.entry_date BETWEEN p_start_date AND p_end_date
              AND COALESCE(le.status, 'active') != 'void'
        ),
        grouped_data AS (
            SELECT
                group_id,
                MIN(id::text)::uuid AS sort_id,
                MIN(entry_date) AS entry_date,
                SUM(debit)  AS debit,
                SUM(credit) AS credit,
                MAX(v_invoice_id::text)::uuid AS invoice_id,
                CASE
                    WHEN MAX(v_type) = 'sale' OR MAX(transaction_type) = 'sale' THEN
                        CASE WHEN SUM(debit) > 0 THEN 'SALE (INVOICE)' ELSE 'SALE (CASH)' END
                    WHEN MAX(transaction_type) IN ('purchase', 'lot_purchase') OR MAX(arrival_id_calc::text) IS NOT NULL THEN 'PURCHASE'
                    WHEN (MAX(v_type) IN ('receipt','payment') OR MAX(transaction_type) IN ('payment','receipt')) THEN
                        CASE WHEN v_contact_type = 'buyer' THEN 'RECEIPT' ELSE 'PAYMENT' END
                    ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
                END AS voucher_type,
                COALESCE(
                    'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                    'Bill #' || NULLIF(MAX(arrival_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_contact_bill_no::text), ''),
                    'INV #'  || NULLIF(MAX(sale_bill_no::text), ''),
                    MAX(v_voucher_no::text),
                    '-'
                ) AS voucher_no,
                COALESCE(
                    NULLIF(TRIM(MAX(v_narration)), ''),
                    NULLIF(TRIM(MAX(raw_description)), ''),
                    'Transaction'
                ) AS description
            FROM raw_data
            GROUP BY group_id
        ),
        ranked_tx AS (
            SELECT *, SUM(COALESCE(debit,0) - COALESCE(credit,0)) OVER (ORDER BY entry_date, sort_id) AS running_diff
            FROM grouped_data
        )
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', group_id, 'date', entry_date, 'voucher_type', voucher_type, 'voucher_no', voucher_no,
                'description', description, 'debit', debit, 'credit', credit,
                'running_balance', (v_opening_balance + running_diff)
            )
        ) FROM (SELECT * FROM ranked_tx ORDER BY entry_date DESC, sort_id DESC) t
    );

    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'last_activity', v_last_activity, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
