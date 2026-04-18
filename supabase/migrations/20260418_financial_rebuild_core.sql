-- ============================================================================
-- MIGRATION: 20260418_financial_rebuild_core.sql
-- PURPOSE: Restore accounting integrity, fix 404 RPCs, and enforce double-entry.
-- FIX: REBUILDS get_ledger_statement to fix "a.total_value does not exist"
-- FIX: REBUILDS confirm_sale_transaction with ACCOUNTING logic
-- ============================================================================

BEGIN;

-- 1. ENFORCE DOUBLE-ENTRY INTEGRITY (Triggers)
CREATE OR REPLACE FUNCTION mandi.check_voucher_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
    v_imbalance NUMERIC;
BEGIN
    IF NEW.voucher_id IS NULL THEN RETURN NEW; END IF;

    SELECT SUM(debit), SUM(credit) INTO v_total_debit, v_total_credit
    FROM mandi.ledger_entries WHERE voucher_id = NEW.voucher_id;

    v_imbalance := ABS(COALESCE(v_total_debit, 0) - COALESCE(v_total_credit, 0));

    IF v_imbalance > 0.01 THEN
        RAISE EXCEPTION 'Double-entry integrity violation: Voucher % is imbalanced by ₹%. (Dr: ₹%, Cr: ₹%)', 
            NEW.voucher_id, v_imbalance, v_total_debit, v_total_credit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_double_entry ON mandi.ledger_entries;
CREATE CONSTRAINT TRIGGER trg_enforce_double_entry
AFTER INSERT OR UPDATE ON mandi.ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION mandi.check_voucher_balance();


-- 2. ROBUST FINANCIAL SUMMARY RPC
CREATE OR REPLACE FUNCTION mandi.get_financial_summary(
    p_org_id UUID,
    _cache_bust BIGINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public
AS $$
DECLARE
    v_receivables NUMERIC := 0;
    v_farmer_paya NUMERIC := 0;
    v_supp_paya   NUMERIC := 0;
    v_cash_bal    NUMERIC := 0;
    v_bank_bal    NUMERIC := 0;
    v_cash_acc_id UUID;
BEGIN
    -- Receivables
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables
    FROM (
        SELECT contact_id, SUM(debit - credit) as balance
        FROM mandi.ledger_entries le
        JOIN mandi.contacts c ON le.contact_id = c.id
        WHERE le.organization_id = p_org_id AND le.status = 'active' AND c.type = 'buyer'
        GROUP BY contact_id
    ) t WHERE balance > 0;

    -- Farmer Payables
    SELECT ABS(COALESCE(SUM(balance), 0)) INTO v_farmer_paya
    FROM (
        SELECT contact_id, SUM(debit - credit) as balance
        FROM mandi.ledger_entries le
        JOIN mandi.contacts c ON le.contact_id = c.id
        WHERE le.organization_id = p_org_id AND le.status = 'active' AND c.type = 'farmer'
        GROUP BY contact_id
    ) t WHERE balance < 0;

    -- Supplier Payables
    SELECT ABS(COALESCE(SUM(balance), 0)) INTO v_supp_paya
    FROM (
        SELECT contact_id, SUM(debit - credit) as balance
        FROM mandi.ledger_entries le
        JOIN mandi.contacts c ON le.contact_id = c.id
        WHERE le.organization_id = p_org_id AND le.status = 'active' AND c.type = 'supplier'
        GROUP BY contact_id
    ) t WHERE balance < 0;

    -- Cash in Hand
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = p_org_id AND code = '1001' LIMIT 1;
    SELECT COALESCE(SUM(debit - credit), 0) + COALESCE((SELECT opening_balance FROM mandi.accounts WHERE id = v_cash_acc_id), 0)
    INTO v_cash_bal FROM mandi.ledger_entries WHERE account_id = v_cash_acc_id AND status = 'active';

    -- Bank Balances
    SELECT SUM(balance) INTO v_bank_bal FROM (
        SELECT a.id, COALESCE(SUM(le.debit - le.credit), 0) + a.opening_balance as balance
        FROM mandi.accounts a
        LEFT JOIN mandi.ledger_entries le ON a.id = le.account_id AND le.status = 'active'
        WHERE a.organization_id = p_org_id AND (a.account_sub_type = 'bank' OR a.name ILIKE '%bank%') AND a.code != '1001'
        GROUP BY a.id, a.opening_balance
    ) b;

    RETURN jsonb_build_object(
        'receivables', v_receivables,
        'farmer_payables', v_farmer_paya,
        'supplier_payables', v_supp_paya,
        'cash', jsonb_build_object('balance', v_cash_bal),
        'bank', jsonb_build_object('balance', COALESCE(v_bank_bal, 0)),
        'timestamp', now()
    );
END;
$$;


-- 3. REBUILT GET_LEDGER_STATEMENT (Drill-down support)
DROP FUNCTION IF EXISTS mandi.get_ledger_statement(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id UUID,
    p_contact_id UUID,
    p_from_date TIMESTAMP WITH TIME ZONE,
    p_to_date TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_closing_balance NUMERIC := 0;
    v_rows JSONB;
BEGIN
    -- Opening Balance
    SELECT COALESCE(SUM(debit - credit), 0) INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date < p_from_date AND status = 'active';

    WITH base_entries AS (
        SELECT le.*, v.type as voucher_header_type, v.voucher_no as header_v_no, v.narration as header_narration,
               s.id as sale_id, a.id as arrival_id
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.vouchers v ON le.voucher_id = v.id
        LEFT JOIN mandi.sales s ON (s.id = le.reference_id OR s.id = v.invoice_id)
        LEFT JOIN mandi.arrivals a ON (a.id = le.reference_id OR a.id = v.arrival_id)
        WHERE le.organization_id = p_organization_id AND le.contact_id = p_contact_id 
          AND le.entry_date BETWEEN p_from_date AND p_to_date AND le.status = 'active'
    ),
    sale_products AS (
        SELECT st.sale_id, jsonb_agg(jsonb_build_object('name', c.name, 'qty', si.qty, 'rate', si.rate, 'amount', si.amount)) as products
        FROM (SELECT DISTINCT sale_id FROM base_entries WHERE sale_id IS NOT NULL) st
        JOIN mandi.sale_items si ON si.sale_id = st.sale_id
        LEFT JOIN mandi.commodities c ON c.id = si.item_id
        GROUP BY st.sale_id
    ),
    arrival_products AS (
        SELECT at.arrival_id, jsonb_agg(jsonb_build_object('name', c.name, 'qty', l.initial_qty, 'rate', l.supplier_rate, 'amount', l.initial_qty * l.supplier_rate)) as products
        FROM (SELECT DISTINCT arrival_id FROM base_entries WHERE arrival_id IS NOT NULL) at
        JOIN mandi.lots l ON l.arrival_id = at.arrival_id
        LEFT JOIN mandi.commodities c ON c.id = l.item_id
        GROUP BY at.arrival_id
    ),
    statement_rows AS (
        SELECT be.*,
               COALESCE(sp.products, ap.products, be.products, '[]'::jsonb) as resolved_products,
               v_opening_balance + SUM(debit - credit) OVER (ORDER BY entry_date ASC, id ASC) as running_balance
        FROM base_entries be
        LEFT JOIN sale_products sp ON sp.sale_id = be.sale_id
        LEFT JOIN arrival_products ap ON ap.arrival_id = be.arrival_id
    )
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'date', entry_date, 'debit', debit, 'credit', credit, 'description', COALESCE(description, header_narration, 'Transaction'),
        'voucher_no', COALESCE(reference_no, header_v_no::text, '-'), 'voucher_type', UPPER(COALESCE(transaction_type, voucher_header_type, 'TRX')),
        'products', resolved_products, 'running_balance', running_balance
    ) ORDER BY entry_date DESC, id DESC) INTO v_rows FROM statement_rows;

    SELECT v_opening_balance + COALESCE(SUM(debit - credit), 0) INTO v_closing_balance
    FROM mandi.ledger_entries WHERE organization_id = p_organization_id AND contact_id = p_contact_id AND entry_date <= p_to_date AND status = 'active';

    RETURN jsonb_build_object('opening_balance', v_opening_balance, 'closing_balance', v_closing_balance, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;


-- 4. CONSOLIDATED SALES RPC (Fixed Accounting)
CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_sale_date         DATE,
    p_buyer_id          UUID,
    p_items             JSONB,
    p_total_amount      NUMERIC,
    p_payment_mode      TEXT,
    p_idempotency_key   UUID,
    p_amount_received   NUMERIC DEFAULT 0,
    p_cheque_no         TEXT DEFAULT NULL,
    p_cheque_number     TEXT DEFAULT NULL, -- Backwards compatibility alias
    p_bank_account_id   UUID DEFAULT NULL,
    p_market_fee        NUMERIC DEFAULT 0,
    p_nirashrit         NUMERIC DEFAULT 0,
    p_misc_fee          NUMERIC DEFAULT 0,
    p_loading_charges   NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses    NUMERIC DEFAULT 0,
    p_gst_total         NUMERIC DEFAULT 0,
    p_cgst_amount       NUMERIC DEFAULT 0,
    p_sgst_amount       NUMERIC DEFAULT 0,
    p_igst_amount       NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_item RECORD;
    v_sales_acc UUID;
    v_buyer_acc UUID;
    v_cash_acc UUID;
    v_bank_acc UUID;
    v_grand_total NUMERIC;
BEGIN
    -- Idempotency check
    SELECT id INTO v_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true); END IF;

    -- Account resolution
    SELECT id INTO v_sales_acc FROM mandi.accounts WHERE code = '4001' LIMIT 1;
    SELECT id INTO v_buyer_acc FROM mandi.accounts WHERE code = '1002' LIMIT 1;
    SELECT id INTO v_cash_acc FROM mandi.accounts WHERE code = '1001' LIMIT 1;
    v_bank_acc := p_bank_account_id;

    v_grand_total := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses + p_gst_total;

    -- 1. RECORD SALE
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, payment_mode, idempotency_key, 
        cheque_no, market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        gst_total, cgst_amount, sgst_amount, igst_amount
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, v_grand_total, p_payment_mode, p_idempotency_key,
        COALESCE(p_cheque_no, p_cheque_number), p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        p_gst_total, p_cgst_amount, p_sgst_amount, p_igst_amount
    ) RETURNING id INTO v_sale_id;

    -- 2. DEDUCT STOCK
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        UPDATE mandi.lots SET current_qty = current_qty - (v_item.value->>'qty')::NUMERIC WHERE id = (v_item.value->>'lot_id')::UUID;
        INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount) 
        VALUES (v_sale_id, (v_item.value->>'lot_id')::UUID, (v_item.value->>'qty')::NUMERIC, (v_item.value->>'rate')::NUMERIC, (v_item.value->>'amount')::NUMERIC);
    END LOOP;

    -- 3. CREATE ACCOUNTING VOUCHER (Invoice)
    INSERT INTO mandi.vouchers (organization_id, date, type, reference_id, narration)
    VALUES (p_organization_id, p_sale_date, 'sale', v_sale_id, 'Sale Invoice Reconstruction')
    RETURNING id INTO v_voucher_id;

    -- Debit Buyer, Credit Sales
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, transaction_type)
    VALUES 
        (p_organization_id, v_voucher_id, p_buyer_id, v_buyer_acc, v_grand_total, 0, p_sale_date, 'sale'),
        (p_organization_id, v_voucher_id, NULL, v_sales_acc, 0, v_grand_total, p_sale_date, 'sale');

    -- 4. RECORD PAYMENT (If any)
    IF p_amount_received > 0 THEN
        INSERT INTO mandi.vouchers (organization_id, date, type, reference_id, narration)
        VALUES (p_organization_id, p_sale_date, 'receipt', v_sale_id, 'Payment against Sale')
        RETURNING id INTO v_voucher_id;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, transaction_type)
        VALUES 
            (p_organization_id, v_voucher_id, NULL, CASE WHEN p_payment_mode = 'cash' THEN v_cash_acc ELSE v_bank_acc END, p_amount_received, 0, p_sale_date, 'receipt'),
            (p_organization_id, v_voucher_id, p_buyer_id, v_buyer_acc, 0, p_amount_received, p_sale_date, 'receipt');
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END;
$$;


-- 5. PUBLIC WRAPPERS
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_org_id UUID, _cache_bust BIGINT DEFAULT 0)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$ SELECT mandi.get_financial_summary(p_org_id, _cache_bust); $$;

DROP FUNCTION IF EXISTS public.get_ledger_statement(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
CREATE OR REPLACE FUNCTION public.get_ledger_statement(
    p_organization_id UUID, p_contact_id UUID, p_from_date TIMESTAMP WITH TIME ZONE, p_to_date TIMESTAMP WITH TIME ZONE
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$ SELECT mandi.get_ledger_statement(p_organization_id, p_contact_id, p_from_date, p_to_date); $$;


-- 6. REPAIR BROKEN VOUCHERS
DO $$
DECLARE v_v RECORD; v_suspense UUID; v_imbalance NUMERIC;
BEGIN
    SELECT id INTO v_suspense FROM mandi.accounts WHERE code = '3001' OR name ILIKE '%Opening Balance Offset%' LIMIT 1;
    IF v_suspense IS NULL THEN SELECT id INTO v_suspense FROM mandi.accounts WHERE type = 'equity' LIMIT 1; END IF;
    FOR v_v IN SELECT voucher_id, organization_id, SUM(debit) as d, SUM(credit) as c, MAX(entry_date) as dt FROM mandi.ledger_entries WHERE voucher_id IS NOT NULL GROUP BY voucher_id, organization_id HAVING ABS(SUM(debit)-SUM(credit)) > 0.01 LOOP
        v_imbalance := v_v.d - v_v.c;
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, status, transaction_type)
        VALUES (v_v.organization_id, v_v.voucher_id, v_suspense, CASE WHEN v_imbalance < 0 THEN ABS(v_imbalance) ELSE 0 END, CASE WHEN v_imbalance > 0 THEN v_imbalance ELSE 0 END, v_v.dt, 'Integrity Repair: Imbalance offset', 'active', 'adjustment');
    END LOOP;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
