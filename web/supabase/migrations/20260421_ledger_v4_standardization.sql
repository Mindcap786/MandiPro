-- ============================================================
-- MANDIPRO FINANCE STABILIZATION V4
-- Date: 2026-04-21
-- Includes:
-- 1. get_ledger_statement (Professional Grouping & Charging)
-- 2. post_arrival_ledger (Safe Idempotent Cleanup & Advance Tracking)
-- 3. confirm_sale_transaction (Strict Mathematical Payment Status & Atomic Postings)
-- ============================================================

-- 1. WORLD-CLASS LEDGER STATEMENT (V4)
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id uuid, 
    p_contact_id uuid, 
    p_start_date timestamp with time zone, 
    p_end_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows            JSONB;
    v_closing_balance NUMERIC;
    v_last_activity   TIMESTAMPTZ;
    v_contact_type    TEXT;
BEGIN
    SELECT type INTO v_contact_type FROM mandi.contacts WHERE id = p_contact_id;

    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_opening_balance
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id
      AND  entry_date      < p_start_date;

    SELECT MAX(entry_date)
    INTO   v_last_activity
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id;

    WITH raw_data AS (
        SELECT
            le.id, le.entry_date, le.voucher_id, le.transaction_type, le.description AS raw_description,
            le.debit, le.credit, le.reference_no, le.reference_id,
            COALESCE(a.id, v.arrival_id) AS arrival_id,
            a.bill_no AS arrival_bill_no, a.reference_no AS arrival_ref_no, a.total_value AS arrival_gross_total,
            v.type AS v_type, v.voucher_no AS v_voucher_no, v.narration AS v_narration, v.invoice_id AS v_invoice_id,
            s.bill_no AS sale_bill_no, s.contact_bill_no AS sale_contact_bill_no, s.total_amount_inc_tax AS sale_gross_total,
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
    ),
    grouped_data AS (
        SELECT
            group_id,
            MIN(id::text)::uuid AS sort_id,
            MIN(entry_date) AS entry_date,
            SUM(debit) AS debit,
            SUM(credit) AS credit,
            MAX(v_invoice_id) AS invoice_id,
            CASE
                WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN
                    CASE WHEN SUM(debit) > 0 THEN 'SALE (INVOICE)' ELSE 'SALE (CASH)' END
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN 'PURCHASE'
                WHEN (MAX(v_type) IN ('receipt','payment') OR MAX(transaction_type) IN ('payment','receipt')) THEN
                    CASE WHEN v_contact_type = 'buyer' THEN 'RECEIPT' ELSE 'PAYMENT' END
                ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
            END AS voucher_type,
            COALESCE(
                'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                'Bill #' || MAX(arrival_bill_no)::text,
                'INV #'  || NULLIF(MAX(sale_contact_bill_no), ''),
                'INV #'  || MAX(sale_bill_no)::text,
                MAX(v_voucher_no)::text,
                MAX(reference_no),
                '-'
            ) AS voucher_no,
            CASE
                WHEN (MAX(v_type) = 'receipt' OR (v_contact_type = 'buyer' AND SUM(credit) > 0)) AND MAX(sale_bill_no) IS NOT NULL THEN
                    'Receipt against Inv #' || COALESCE(NULLIF(MAX(sale_contact_bill_no),''), MAX(sale_bill_no)::text)
                WHEN (MAX(v_type) = 'payment' OR (v_contact_type != 'buyer' AND SUM(debit) > 0)) AND MAX(arrival_bill_no) IS NOT NULL THEN
                    'Payment for Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text)
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text, '-')
                WHEN COUNT(*) > 1 THEN 'Grouped Transaction'
                ELSE MAX(COALESCE(v_narration, raw_description, 'Transaction'))
            END AS description,
            array_agg(DISTINCT voucher_id) FILTER (WHERE voucher_id IS NOT NULL) as voucher_ids,
            array_agg(DISTINCT reference_id) FILTER (WHERE reference_id IS NOT NULL) as reference_ids,
            array_agg(DISTINCT arrival_id) FILTER (WHERE arrival_id IS NOT NULL) as arrival_ids
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
            'products', (
                SELECT jsonb_agg(p) FROM (
                    SELECT DISTINCT ON (si.id) jsonb_build_object('name', i.name, 'qty', COALESCE(si.quantity, si.qty), 'unit', COALESCE(si.unit,'Units'), 'rate', si.rate, 'lot_no', l1.lot_code) as p
                    FROM mandi.sales s JOIN mandi.sale_items si ON si.sale_id = s.id LEFT JOIN mandi.lots l1 ON si.lot_id = l1.id JOIN mandi.commodities i ON si.item_id = i.id
                    WHERE s.id = OuterQuery.invoice_id OR s.id = ANY(OuterQuery.reference_ids) OR s.id IN (SELECT invoice_id FROM mandi.vouchers WHERE id = ANY(OuterQuery.voucher_ids))
                    UNION ALL
                    SELECT DISTINCT ON (l2.id) jsonb_build_object('name', i1.name, 'qty', COALESCE(l2.initial_qty, l2.weight, 0), 'unit', l2.unit, 'rate', l2.supplier_rate, 'lot_no', l2.lot_code) as p
                    FROM mandi.lots l2 JOIN mandi.commodities i1 ON l2.item_id = i1.id JOIN mandi.arrivals a2 ON l2.arrival_id = a2.id
                    WHERE a2.id = ANY(OuterQuery.arrival_ids) OR l2.id = ANY(OuterQuery.reference_ids) OR a2.id IN (SELECT arrival_id FROM mandi.vouchers WHERE id = ANY(OuterQuery.voucher_ids))
                ) t
            ),
            'charges', (
                SELECT jsonb_agg(c) FROM (
                    SELECT jsonb_build_object('label', label, 'amount', amount) as c FROM (
                        SELECT 'Market Fee' as label, market_fee::numeric as amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL SELECT 'Nirashrit', nirashrit::numeric FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL SELECT 'Transportation', hire_charges::numeric FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                        UNION ALL SELECT 'Hamali', hamali_expenses::numeric FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                    ) charges WHERE amount > 0
                ) t2
            ),
            'running_balance', (v_opening_balance + running_diff)
        )
    ) INTO v_rows FROM (SELECT * FROM ranked_tx ORDER BY entry_date DESC, sort_id DESC) OuterQuery;

    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) INTO v_closing_balance FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date <= p_end_date;
    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'last_activity', v_last_activity, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

-- 2. SAFE IDEMPOTENT ARRIVAL POSTING
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_arrival RECORD; v_lot RECORD; v_org_id UUID; v_party_id UUID; v_arrival_date DATE; v_reference_no TEXT;
    v_purchase_acc_id UUID; v_expense_recovery_acc_id UUID; v_cash_acc_id UUID; v_commission_income_acc_id UUID; v_inventory_acc_id UUID;
    v_total_commission NUMERIC := 0; v_total_inventory NUMERIC := 0; v_total_transport NUMERIC := 0;
    v_main_voucher_id UUID; v_voucher_no BIGINT; v_gross_bill NUMERIC; v_total_advance_cleared NUMERIC := 0; v_final_status TEXT := 'pending';
    v_adv RECORD; v_contra_acc UUID; v_pend_vo_no BIGINT;
BEGIN
    SELECT a.*, c.name AS party_name INTO v_arrival FROM mandi.arrivals a LEFT JOIN mandi.contacts c ON a.party_id = c.id WHERE a.id = p_arrival_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;
    v_org_id := v_arrival.organization_id; v_party_id := v_arrival.party_id; v_arrival_date := v_arrival.arrival_date; v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);

    -- SAFE CLEANUP: Delete only purchase-type entries for this specific arrival
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
    DELETE FROM mandi.ledger_entries WHERE reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id) AND transaction_type = 'purchase';
    DELETE FROM mandi.vouchers WHERE arrival_id = p_arrival_id AND type = 'purchase';

    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        DECLARE 
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_inventory := v_total_inventory + v_val;
            v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
        END;
    END LOOP;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0);
    v_gross_bill := v_total_inventory;

    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id)
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, 'Arrival ' || v_reference_no, v_gross_bill, v_party_id, p_arrival_id) RETURNING id INTO v_main_voucher_id;

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_org_id, v_main_voucher_id, v_purchase_acc_id, v_gross_bill, 0, v_arrival_date, 'Goods Received', 'purchase', p_arrival_id);
    IF v_party_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill, v_arrival_date, 'Goods Payable', 'purchase', p_arrival_id);
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
        END IF;
    END IF;

    -- Advance Handling
    FOR v_adv IN SELECT COALESCE(advance_payment_mode, 'cash') AS mode, COALESCE(advance_cheque_status, false) AS chq_cleared, SUM(advance) AS total_adv FROM mandi.lots WHERE arrival_id = p_arrival_id AND advance > 0 GROUP BY 1, 2 LOOP
        IF v_adv.mode = 'cash' OR (v_adv.mode = 'cheque' AND v_adv.chq_cleared = true) THEN
            v_total_advance_cleared := v_total_advance_cleared + v_adv.total_adv;
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_party_id, v_adv.total_adv, 0, v_arrival_date, 'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id);
            END IF;
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) VALUES (v_org_id, v_main_voucher_id, v_cash_acc_id, 0, v_adv.total_adv, v_arrival_date, 'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id);
        END IF;
    END LOOP;

    IF v_total_advance_cleared >= v_gross_bill AND v_gross_bill > 0 THEN v_final_status := 'paid';
    ELSIF v_total_advance_cleared > 0 THEN v_final_status := 'partial';
    ELSE v_final_status := 'pending'; END IF;

    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status);
END;
$function$;

-- 3. STRICT SALE TRANSACTION WITH MATHEMATICAL STATUS
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid, p_buyer_id uuid, p_sale_date date, p_payment_mode text, p_total_amount numeric, p_items jsonb,
    p_amount_received numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_sale_id UUID; v_bill_no BIGINT; v_total_inc_tax NUMERIC; v_payment_status TEXT := 'pending';
    v_voucher_id UUID; v_voucher_no BIGINT; v_sales_revenue_acc_id UUID; v_cash_acc_id UUID;
BEGIN
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
    v_total_inc_tax := p_total_amount; -- Plus GST if any

    IF COALESCE(p_amount_received, 0) >= v_total_inc_tax AND v_total_inc_tax > 0 THEN v_payment_status := 'paid';
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN v_payment_status := 'partial';
    ELSE v_payment_status := 'pending'; END IF;

    INSERT INTO mandi.sales (organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax, payment_mode, payment_status)
    VALUES (p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax, p_payment_mode, v_payment_status)
    RETURNING id, bill_no INTO v_sale_id, v_bill_no;

    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id)
    VALUES (p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax, 'Sale #' || v_bill_no, v_sale_id, p_buyer_id) RETURNING id INTO v_voucher_id;

    -- Standard Postings
    INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 'Sale #' || v_bill_no, 'sale', v_sale_id);
    INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, v_total_inc_tax, p_sale_date, 'Sales Revenue', 'sale', v_sale_id);

    IF COALESCE(p_amount_received, 0) > 0 THEN
        DECLARE v_rcpt_vo_no BIGINT; v_rcpt_vo_id UUID; BEGIN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_rcpt_vo_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt';
            INSERT INTO mandi.vouchers(organization_id, date, type, voucher_no, amount, narration, contact_id, invoice_id)
            VALUES (p_organization_id, p_sale_date, 'receipt', v_rcpt_vo_no, p_amount_received, 'Instant Receipt - Sale #' || v_bill_no, p_buyer_id, v_sale_id) RETURNING id INTO v_rcpt_vo_id;
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (p_organization_id, v_rcpt_vo_id, p_buyer_id, 0, p_amount_received, p_sale_date, 'Payment Received', 'receipt', v_sale_id);
            INSERT INTO mandi.ledger_entries(organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (p_organization_id, v_rcpt_vo_id, v_cash_acc_id, p_amount_received, 0, p_sale_date, 'Payment Deposit', 'receipt', v_sale_id);
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'payment_status', v_payment_status);
END;
$function$;
