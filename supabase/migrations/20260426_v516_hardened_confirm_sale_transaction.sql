-- ============================================================
-- v5.16: Drop ALL overloaded confirm_sale_transaction versions
-- Replace with ONE hardened, robust version safe for all orgs
--
-- PROBLEM: 5 overloaded versions existed. PostgreSQL couldn't
-- pick the right one → silent failures for new orgs.
--
-- FIXES:
-- 1) 4-tier account resolution (code→sub_type→name→any)
-- 2) Explicit error if critical accounts missing (no silent fail)
-- 3) Both description AND narration populated
-- 4) DR Buyer uses account_id=AR + contact_id (party balances work)
-- 5) paid_amount set in sales INSERT
-- 6) status='posted' on all ledger_entries
-- 7) EXCEPTION handler returns JSON errors
-- ============================================================

-- Drop all overloads using OID-based approach
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'confirm_sale_transaction'
          AND n.nspname IN ('mandi', 'public')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.oid::regprocedure);
    END LOOP;
END;
$$;

CREATE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   UUID,
    p_buyer_id          UUID,
    p_sale_date         DATE,
    p_payment_mode      TEXT,
    p_total_amount      NUMERIC,
    p_items             JSONB,
    p_market_fee        NUMERIC  DEFAULT 0,
    p_nirashrit         NUMERIC  DEFAULT 0,
    p_misc_fee          NUMERIC  DEFAULT 0,
    p_loading_charges   NUMERIC  DEFAULT 0,
    p_unloading_charges NUMERIC  DEFAULT 0,
    p_other_expenses    NUMERIC  DEFAULT 0,
    p_amount_received   NUMERIC  DEFAULT NULL,
    p_idempotency_key   TEXT     DEFAULT NULL,
    p_due_date          DATE     DEFAULT NULL,
    p_bank_account_id   UUID     DEFAULT NULL,
    p_cheque_no         TEXT     DEFAULT NULL,
    p_cheque_date       DATE     DEFAULT NULL,
    p_cheque_status     BOOLEAN  DEFAULT FALSE,
    p_bank_name         TEXT     DEFAULT NULL,
    p_cgst_amount       NUMERIC  DEFAULT 0,
    p_sgst_amount       NUMERIC  DEFAULT 0,
    p_igst_amount       NUMERIC  DEFAULT 0,
    p_gst_total         NUMERIC  DEFAULT 0,
    p_discount_percent  NUMERIC  DEFAULT 0,
    p_discount_amount   NUMERIC  DEFAULT 0,
    p_place_of_supply   TEXT     DEFAULT NULL,
    p_buyer_gstin       TEXT     DEFAULT NULL,
    p_is_igst           BOOLEAN  DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_sale_id               UUID;
    v_bill_no               BIGINT;
    v_contact_bill_no       BIGINT;
    v_gross_total           NUMERIC;
    v_total_inc_tax         NUMERIC;
    v_sales_revenue_acc_id  UUID;
    v_ar_acc_id             UUID;
    v_cash_acc_id           UUID;
    v_bank_acc_id           UUID;
    v_cheques_transit_acc_id UUID;
    v_payment_status        TEXT;
    v_mode_lower            TEXT;
    v_voucher_id            UUID;
    v_receipt_voucher_id    UUID;
    v_received              NUMERIC := 0;
    v_item                  RECORD;
    v_qty                   NUMERIC;
    v_rate                  NUMERIC;
    v_updated_rows          INT;
    v_next_voucher_no       INT;
    v_payment_acc_id        UUID;
BEGIN
    -- 1. Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key AND organization_id = p_organization_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true);
        END IF;
    END IF;

    v_mode_lower := LOWER(COALESCE(p_payment_mode, ''));

    -- 2. Robust 4-tier account resolution
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    IF v_sales_revenue_acc_id IS NULL THEN
        SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND type = 'income'
          AND (account_sub_type = 'sales' OR name ILIKE '%direct%sales%' OR name ILIKE '%sales%revenue%')
        ORDER BY CASE WHEN account_sub_type = 'sales' THEN 0 ELSE 1 END LIMIT 1;
    END IF;
    IF v_sales_revenue_acc_id IS NULL THEN
        SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND type = 'income'
        ORDER BY created_at LIMIT 1;
    END IF;
    IF v_sales_revenue_acc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error',
            'No income/revenue account found. Create a Sales Revenue account (type=income) first.');
    END IF;

    SELECT id INTO v_ar_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND type = 'asset'
      AND (account_sub_type = 'receivable' OR name ILIKE '%receivable%') LIMIT 1;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND type = 'asset'
      AND account_sub_type = 'cash' AND name NOT ILIKE '%charges%'
    ORDER BY created_at LIMIT 1;
    IF v_cash_acc_id IS NULL THEN
        SELECT id INTO v_cash_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND type = 'asset'
          AND (name ILIKE '%cash in hand%' OR code = '1001')
          AND name NOT ILIKE '%charges%' AND name NOT ILIKE '%cheque%'
        ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cash_acc_id IS NULL THEN
        SELECT id INTO v_cash_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND type = 'asset'
          AND name ILIKE '%cash%' AND name NOT ILIKE '%charges%' AND name NOT ILIKE '%cheque%'
        ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cash_acc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error',
            'No Cash in Hand account found. Create one (type=asset, account_sub_type=cash) first.');
    END IF;

    IF p_bank_account_id IS NOT NULL THEN
        SELECT id INTO v_bank_acc_id FROM mandi.accounts
        WHERE id = p_bank_account_id AND organization_id = p_organization_id AND type = 'asset';
    END IF;
    IF v_bank_acc_id IS NULL THEN
        SELECT id INTO v_bank_acc_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND type = 'asset' AND account_sub_type = 'bank'
          AND name NOT ILIKE '%transit%' AND name NOT ILIKE '%cheque%' AND name NOT ILIKE '%charges%'
        ORDER BY code LIMIT 1;
    END IF;
    SELECT id INTO v_cheques_transit_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND type = 'asset' AND account_sub_type = 'bank'
      AND (name ILIKE '%transit%' OR name ILIKE '%cheque%') LIMIT 1;
    IF v_ar_acc_id IS NULL THEN v_ar_acc_id := v_cash_acc_id; END IF;

    -- 3. Stock deduction
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);
        IF v_qty > 0 AND (v_item.value->>'lot_id') IS NOT NULL THEN
            UPDATE mandi.lots SET current_qty = current_qty - v_qty,
                status = CASE WHEN current_qty - v_qty <= 0 THEN 'Sold' ELSE 'partial' END
            WHERE id = (v_item.value->>'lot_id')::UUID AND organization_id = p_organization_id AND current_qty >= v_qty;
            GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
            IF v_updated_rows = 0 THEN
                RETURN jsonb_build_object('success', false, 'error',
                    FORMAT('Insufficient stock or invalid lot: %s', v_item.value->>'lot_id'));
            END IF;
        END IF;
    END LOOP;

    -- 4. Totals
    v_gross_total   := p_total_amount - COALESCE(p_discount_amount,0)
                     + COALESCE(p_market_fee,0) + COALESCE(p_nirashrit,0) + COALESCE(p_misc_fee,0)
                     + COALESCE(p_loading_charges,0) + COALESCE(p_unloading_charges,0) + COALESCE(p_other_expenses,0);
    v_total_inc_tax := v_gross_total + COALESCE(p_gst_total,0);

    -- 5. Payment status
    v_payment_status := 'pending'; v_received := 0;
    IF v_mode_lower IN ('udhaar', 'credit') THEN NULL;
    ELSIF v_mode_lower IN ('cash', 'upi', 'bank_transfer', 'bank_upi') THEN
        IF COALESCE(p_amount_received,0) > 0 AND p_amount_received < (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'partial'; v_received := p_amount_received;
        ELSE v_payment_status := 'paid'; v_received := COALESCE(p_amount_received, v_total_inc_tax); END IF;
    ELSIF v_mode_lower = 'cheque' THEN
        v_payment_status := CASE WHEN p_cheque_status THEN 'paid' ELSE 'pending' END;
        v_received := COALESCE(p_amount_received, v_total_inc_tax);
    ELSIF COALESCE(p_amount_received,0) > 0 THEN
        v_payment_status := CASE WHEN p_amount_received >= (v_total_inc_tax - 0.01) THEN 'paid' ELSE 'partial' END;
        v_received := p_amount_received;
    END IF;

    -- 6. Insert sale
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, paid_amount,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, v_received,
        COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0),
        COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0), p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0),
        COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0),
        p_place_of_supply, p_buyer_gstin, p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 7. Line items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty  := COALESCE((v_item.value->>'qty')::NUMERIC, (v_item.value->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item.value->>'rate')::NUMERIC, (v_item.value->>'rate_per_unit')::NUMERIC, 0);
        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount) VALUES (
                v_sale_id,
                CASE WHEN (v_item.value->>'lot_id') IS NOT NULL THEN (v_item.value->>'lot_id')::UUID ELSE NULL END,
                v_qty, v_rate, v_qty * v_rate);
        END IF;
    END LOOP;

    -- 8. Invoice voucher + ledger (DR AR/Buyer, CR Revenue)
    SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_next_voucher_no
    FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, payment_mode, reference_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_next_voucher_no, v_total_inc_tax,
        'Sale #' || v_bill_no, v_sale_id, p_buyer_id, p_payment_mode, v_sale_id
    ) RETURNING id INTO v_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, contact_id,
        debit, credit, entry_date, description, narration, status, transaction_type, reference_id
    ) VALUES
    (p_organization_id, v_voucher_id, v_ar_acc_id, p_buyer_id,
     v_total_inc_tax, 0, p_sale_date, 'Sale Bill #'||v_bill_no, 'Sale to buyer - Bill #'||v_bill_no,
     'posted', 'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL,
     0, v_total_inc_tax, p_sale_date, 'Sales Revenue - Bill #'||v_bill_no, 'Sales Revenue - Bill #'||v_bill_no,
     'posted', 'sale', v_sale_id);

    -- 9. Receipt voucher
    IF v_received > 0 AND v_mode_lower NOT IN ('udhaar', 'credit') THEN
        v_payment_acc_id := CASE
            WHEN v_mode_lower IN ('cash','upi','upi_cash','bank_upi') THEN v_cash_acc_id
            WHEN v_mode_lower IN ('bank_transfer','neft','rtgs')      THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            WHEN v_mode_lower = 'cheque'                              THEN COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;

        SELECT COALESCE(MAX(voucher_no),0)+1 INTO v_next_voucher_no
        FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration, party_id, payment_mode, reference_id
        ) VALUES (
            p_organization_id, p_sale_date, 'receipt', v_next_voucher_no, v_received,
            'Receipt from buyer - Sale #'||v_bill_no, p_buyer_id, p_payment_mode, v_sale_id
        ) RETURNING id INTO v_receipt_voucher_id;

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, contact_id,
            debit, credit, entry_date, description, narration, status, transaction_type, reference_id
        ) VALUES
        (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, NULL,
         v_received, 0, p_sale_date,
         'Payment received ('||p_payment_mode||') - Bill #'||v_bill_no,
         'Payment received ('||p_payment_mode||') - Bill #'||v_bill_no,
         'posted', 'receipt', v_receipt_voucher_id),
        (p_organization_id, v_receipt_voucher_id, v_ar_acc_id, p_buyer_id,
         0, v_received, p_sale_date,
         'Payment from buyer - Bill #'||v_bill_no, 'Payment from buyer - Bill #'||v_bill_no,
         'posted', 'receipt', v_receipt_voucher_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status,
        'amount_received', v_received, 'voucher_id', v_voucher_id,
        'receipt_voucher_id', v_receipt_voucher_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.confirm_sale_transaction TO authenticated;
