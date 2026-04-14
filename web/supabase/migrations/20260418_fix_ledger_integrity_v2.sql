-- ============================================================
-- LEDGER INTEGRITY & DETAIL RESTORATION (FINAL UNIFIED ENGINE)
-- Migration: 20260418_fix_ledger_integrity_v2.sql
-- ============================================================

-- 1. DROP ALL REDUNDANT TRIGGERS (SINGLE SOURCE OF TRUTH: RPCs)
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS sync_sales_to_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS trg_sync_sale_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS sync_lot_purchase_ledger ON mandi.lots;
DROP FUNCTION IF EXISTS mandi.sync_sales_ledger_fn CASCADE;
DROP FUNCTION IF EXISTS mandi.sync_lot_purchase_ledger CASCADE;

-- 2. UPDATE confirm_sale_transaction (CLEAN SIGNATURE + ATOMIC RECEIPT)
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, numeric, date, uuid);

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC, -- Raw Sub-total
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_misc_fee NUMERIC DEFAULT 0,
    p_loading_charges NUMERIC DEFAULT 0,
    p_unloading_charges NUMERIC DEFAULT 0,
    p_other_expenses NUMERIC DEFAULT 0,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_igst_amount NUMERIC DEFAULT 0,
    p_gst_total NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_percent NUMERIC DEFAULT 0,
    p_idempotency_key UUID DEFAULT NULL,
    p_amount_received NUMERIC DEFAULT 0,
    p_due_date DATE DEFAULT NULL,
    p_bank_account_id UUID DEFAULT NULL,
    p_place_of_supply TEXT DEFAULT NULL,
    p_buyer_gstin TEXT DEFAULT NULL,
    p_is_igst BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_sales_acc UUID;
    v_cgst_acc UUID;
    v_sgst_acc UUID;
    v_igst_acc UUID;
    v_market_fee_acc UUID;
    v_bank_acc UUID;
    v_total_receivable NUMERIC;
    v_existing_sale_id UUID;
    v_my_org_id UUID;
BEGIN
    -- 1. Security Assertion
    v_my_org_id := core.get_my_org_id();
    IF v_my_org_id IS NULL OR v_my_org_id <> p_organization_id THEN
        RAISE EXCEPTION 'Unauthorized: Org Mismatch';
    END IF;

    -- 2. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id), 'message', 'Duplicate stopped');
        END IF;
    END IF;

    -- 3. Grand Total Calculation
    v_total_receivable := (p_total_amount - p_discount_amount) + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses + p_gst_total;

    -- 4. Account Resolution
    SELECT id INTO v_sales_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '3001' OR name ILIKE 'Sales%') LIMIT 1;
    SELECT id INTO v_cgst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%CGST Output%' OR name ILIKE '%CGST Payable%') LIMIT 1;
    SELECT id INTO v_sgst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%SGST Output%' OR name ILIKE '%SGST Payable%') LIMIT 1;
    SELECT id INTO v_igst_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE '%IGST Output%' OR name ILIKE '%IGST Payable%') LIMIT 1;
    SELECT id INTO v_market_fee_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (name ILIKE 'Market Fee%' OR name ILIKE 'Mandi Tax%') LIMIT 1;

    -- Fallbacks
    v_sales_acc := COALESCE(v_sales_acc, (SELECT id FROM mandi.accounts WHERE organization_id = p_organization_id LIMIT 1));
    v_cgst_acc := COALESCE(v_cgst_acc, v_sales_acc);
    v_sgst_acc := COALESCE(v_sgst_acc, v_sales_acc);
    v_igst_acc := COALESCE(v_igst_acc, v_sales_acc);
    v_market_fee_acc := COALESCE(v_market_fee_acc, v_sales_acc);

    -- 5. Insert Sale Main Record
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;
    
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no, 
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, 
        other_expenses, cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_amount, discount_percent, idempotency_key, payment_status, 
        total_amount_inc_tax, due_date, created_at, place_of_supply, buyer_gstin, is_igst
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges,
        p_other_expenses, p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_amount, p_discount_percent, p_idempotency_key, 
        CASE WHEN p_payment_mode = 'credit' THEN 'pending' ELSE 'paid' END,
        v_total_receivable, p_due_date, NOW(), p_place_of_supply, p_buyer_gstin, p_is_igst
    ) RETURNING id INTO v_sale_id;

    -- 6. Items & Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (organization_id, sale_id, lot_id, qty, rate, amount, unit)
        VALUES (p_organization_id, v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'qty')::NUMERIC, (v_item->>'rate')::NUMERIC, (v_item->>'amount')::NUMERIC, v_item->>'unit');

        UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::NUMERIC WHERE id = (v_item->>'lot_id')::UUID;
    END LOOP;

    -- 7. LEDGER POSTING
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, invoice_id, amount)
    VALUES (p_organization_id, p_sale_date, 'sales', v_bill_no, 'Sale Invoice #' || v_bill_no, v_sale_id, v_total_receivable)
    RETURNING id INTO v_voucher_id;

    -- Entry 1: Debit Buyer (AR)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_receivable, 0, p_sale_date, 'sale', v_sale_id, v_bill_no::TEXT);

    -- Entry 2: Credit Sales (Net Revenue)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
    VALUES (p_organization_id, v_voucher_id, v_sales_acc, 0, p_total_amount - p_discount_amount, p_sale_date, 'sale', v_sale_id, v_bill_no::TEXT);

    -- Entry 3: Credit Fees
    IF (p_market_fee + p_nirashrit + p_misc_fee) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_market_fee_acc, 0, p_market_fee + p_nirashrit + p_misc_fee, p_sale_date, 'sale_fee', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- Entry 4: Credit Taxes
    IF p_cgst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_cgst_acc, 0, p_cgst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;
    IF p_sgst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_sgst_acc, 0, p_sgst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;
    IF p_igst_amount > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_igst_acc, 0, p_igst_amount, p_sale_date, 'gst', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- Entry 5: Credit Expenses (Loading etc)
    IF (p_loading_charges + p_unloading_charges + p_other_expenses) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_sales_acc, 0, p_loading_charges + p_unloading_charges + p_other_expenses, p_sale_date, 'sale_expense', v_sale_id, v_bill_no::TEXT);
    END IF;

    -- 8. CASH RECEIPT GENERATION (FIX FOR RECEIVABLES WHEN PAID)
    IF p_amount_received > 0 THEN
        -- Resolve Bank/Cash Account
        IF p_bank_account_id IS NOT NULL THEN
            v_bank_acc := p_bank_account_id;
        ELSE
            SELECT id INTO v_bank_acc FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR name ILIKE 'Cash%') LIMIT 1;
            v_bank_acc := COALESCE(v_bank_acc, v_sales_acc);
        END IF;

        -- Create Receipt Voucher
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, invoice_id, amount)
        VALUES (p_organization_id, p_sale_date, 'receipt', v_bill_no, 'Sale Payment #' || v_bill_no, v_sale_id, p_amount_received)
        RETURNING id INTO v_voucher_id;

        -- Debit Bank/Cash (Cash inflow)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, v_bank_acc, p_amount_received, 0, p_sale_date, 'sale_payment', v_sale_id, v_bill_no::TEXT);

        -- Credit Buyer (AR) (Paid off)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, reference_id, reference_no)
        VALUES (p_organization_id, v_voucher_id, p_buyer_id, 0, p_amount_received, p_sale_date, 'sale_payment', v_sale_id, v_bill_no::TEXT);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. FIX get_ledger_statement (RESTORE ITEM DETAILS JOIN LOGIC)
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(
    p_organization_id uuid,
    p_contact_id      uuid,
    p_start_date      timestamp with time zone,
    p_end_date        timestamp with time zone
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
BEGIN
    -- ── 1. Opening Balance ─
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_opening_balance
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id
      AND  entry_date      < p_start_date;

    -- ── 2. Last Activity Date ────────────────────────────────────
    SELECT MAX(entry_date)
    INTO   v_last_activity
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id;

    -- ── 3. Statement Rows (grouped by voucher/arrival) ───────────
    WITH raw_data AS (
        SELECT
            le.id,
            le.entry_date,
            le.voucher_id,
            le.transaction_type,
            le.description          AS raw_description,
            le.debit,
            le.credit,
            le.reference_no,
            le.reference_id,
            a.id                    AS arrival_id,
            a.bill_no               AS arrival_bill_no,
            a.reference_no          AS arrival_ref_no,
            v.type                  AS v_type,
            v.voucher_no            AS v_voucher_no,
            v.narration             AS v_narration,
            v.invoice_id            AS v_invoice_id,
            COALESCE(le.voucher_id::text, le.reference_id::text, le.id::text) AS group_id
        FROM  mandi.ledger_entries le
        LEFT  JOIN mandi.arrivals a ON (
            (le.transaction_type IN ('purchase', 'arrival', 'lot_purchase') AND le.reference_id = a.id)
            OR (le.reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = a.id))
        )
        LEFT  JOIN mandi.vouchers v ON le.voucher_id = v.id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id      = p_contact_id
          AND le.entry_date BETWEEN p_start_date AND p_end_date
    ),
    grouped_data AS (
        SELECT
            group_id,
            MIN(id::text)::uuid                                         AS sort_id,
            MIN(entry_date)                                             AS entry_date,
            SUM(debit)                                                  AS debit,
            SUM(credit)                                                 AS credit,
            MAX(v_invoice_id)                                           AS invoice_id,
            MAX(reference_id)                                           AS primary_ref_id,
            CASE
                WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN
                    CASE WHEN SUM(debit) > 0 THEN 'SALE (CREDIT)' ELSE 'SALE (CASH)' END
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN 'PURCHASE'
                WHEN (MAX(v_type) IN ('receipt','payment') OR MAX(transaction_type) = 'payment') AND SUM(credit) > 0 THEN 'PAYMENT'
                WHEN SUM(credit) > 0 AND MAX(v_type) IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
            END                                                         AS voucher_type,
            COALESCE(
                'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                'Bill #' || MAX(arrival_bill_no)::text,
                MAX(v_voucher_no)::text,
                MAX(reference_no),
                '-'
            )                                                           AS voucher_no,
            CASE
                WHEN COUNT(*) > 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text, 'Multi') || ' (Multi-item)'
                WHEN COUNT(*) = 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no),''), MAX(arrival_bill_no)::text, '-')
                WHEN COUNT(*) > 1 THEN 'Grouped Transaction'
                ELSE MAX(COALESCE(raw_description, v_narration, 'Transaction'))
            END                                                         AS description,
            array_agg(DISTINCT voucher_id)   FILTER (WHERE voucher_id   IS NOT NULL) AS voucher_ids,
            array_agg(DISTINCT reference_id) FILTER (WHERE reference_id IS NOT NULL) AS reference_ids,
            array_agg(DISTINCT arrival_id)   FILTER (WHERE arrival_id   IS NOT NULL) AS arrival_ids
        FROM raw_data
        GROUP BY group_id
    ),
    ranked_tx AS (
        SELECT
            *,
            SUM(COALESCE(debit,0) - COALESCE(credit,0))
                OVER (ORDER BY entry_date, sort_id)    AS running_diff
        FROM grouped_data
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id',              group_id,
            'date',            entry_date,
            'voucher_type',    voucher_type,
            'voucher_no',      voucher_no,
            'description',     description,
            'debit',           debit,
            'credit',          credit,
            'products', (
                SELECT jsonb_agg(p) FROM (
                    -- Sales invoice items
                    SELECT DISTINCT ON (si.id)
                        jsonb_build_object(
                            'name',   i.name,
                            'qty',    si.qty,
                            'unit',   COALESCE(si.unit,'Units'),
                            'rate',   si.rate,
                            'lot_no', l1.lot_code
                        ) AS p
                    FROM  mandi.sales      s
                    JOIN  mandi.sale_items si ON si.sale_id = s.id
                    JOIN  mandi.lots       l1 ON si.lot_id  = l1.id
                    JOIN  mandi.commodities i ON l1.item_id = i.id
                    WHERE s.id = OuterQuery.invoice_id
                       OR s.id = ANY(OuterQuery.reference_ids)

                    UNION ALL

                    -- Purchase lot items
                    SELECT DISTINCT ON (l2.id)
                        jsonb_build_object(
                            'name',   i1.name,
                            'qty',    l2.initial_qty,
                            'unit',   l2.unit,
                            'rate',   l2.supplier_rate,
                            'lot_no', l2.lot_code
                        ) AS p
                    FROM  mandi.lots        l2
                    JOIN  mandi.commodities i1 ON l2.item_id = i1.id
                    JOIN  mandi.arrivals    a2 ON l2.arrival_id = a2.id
                    WHERE a2.id = ANY(OuterQuery.arrival_ids)
                       OR l2.id = ANY(OuterQuery.reference_ids)
                       OR l2.id = OuterQuery.primary_ref_id
                ) t
            ),
            'charges', (
                SELECT jsonb_agg(c) FROM (
                    SELECT jsonb_build_object('label', label, 'amount', amount) AS c
                    FROM (
                        SELECT 'Market Fee' AS label, market_fee::numeric      AS amount FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Nirashrit',           nirashrit::numeric                  FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Loading',             loading_charges::numeric            FROM mandi.sales WHERE id = OuterQuery.invoice_id OR id = ANY(OuterQuery.reference_ids)
                        UNION ALL
                        SELECT 'Transportation',      hire_charges::numeric               FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                        UNION ALL
                        SELECT 'Hamali',              hamali_expenses::numeric            FROM mandi.arrivals WHERE id = ANY(OuterQuery.arrival_ids)
                    ) charges WHERE amount > 0
                ) t2
            ),
            'running_balance', (v_opening_balance + running_diff)
        )
    )
    INTO v_rows
    FROM (SELECT * FROM ranked_tx ORDER BY entry_date DESC, sort_id DESC) OuterQuery;

    -- ── 4. Closing Balance ─────────
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO   v_closing_balance
    FROM   mandi.ledger_entries
    WHERE  organization_id = p_organization_id
      AND  contact_id      = p_contact_id
      AND  entry_date      <= p_end_date;

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'last_activity',   v_last_activity,
        'transactions',    COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;

-- 4. CLEANUP EXISTING DOUBLE ENTRIES
-- Delete trigger-based rows if an RPC-based row exists for the same Sale
DELETE FROM mandi.ledger_entries
WHERE voucher_id IS NULL
  AND reference_id IN (SELECT id FROM mandi.sales)
  AND (description ILIKE 'Invoice #%' OR description ILIKE 'Sale Invoice #%')
  AND EXISTS (
      SELECT 1 FROM mandi.ledger_entries le2
      WHERE le2.reference_id = mandi.ledger_entries.reference_id
        AND le2.voucher_id IS NOT NULL 
        AND le2.id <> mandi.ledger_entries.id
  );
