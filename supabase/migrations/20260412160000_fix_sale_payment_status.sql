-- ============================================================
-- FIX PARTIAL PAYMENT STATUS AND 0 AMOUNT BUG
-- Migration: 20260412160000_fix_sale_payment_status.sql
-- ============================================================

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
    p_cheque_no         text     DEFAULT NULL,
    p_cheque_date       date     DEFAULT NULL,
    p_cheque_status     boolean  DEFAULT false,
    p_bank_name         text     DEFAULT NULL,
    p_bank_account_id   uuid     DEFAULT NULL,
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
AS $function$
DECLARE
    v_sale_id           UUID;
    v_sales_acct_id     UUID;
    v_bill_no           BIGINT;
    v_contact_bill_no   BIGINT;
    v_gross_total       NUMERIC;
    v_total_inc_tax     NUMERIC;
    v_receipt_amount    NUMERIC := 0;
    v_payment_status    TEXT := 'pending';
    v_sale_voucher_id   UUID;
    v_sale_voucher_no   BIGINT;
    v_rcpt_voucher_id   UUID;
    v_rcpt_voucher_no   BIGINT;
    v_cash_bank_acc_id  UUID;
    v_cheque_status_txt TEXT;
    v_item              jsonb;
    v_item_qty          NUMERIC;
    v_item_rate         NUMERIC;
    v_item_amount       NUMERIC;
    v_item_gst          NUMERIC;
    v_bill_label        TEXT;
BEGIN
    -- ── 1. Idempotency Guard ──────────────────────────────────────
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no, contact_bill_no
        INTO v_sale_id, v_bill_no, v_contact_bill_no
        FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key::uuid
          AND organization_id = p_organization_id
        LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no,
                'contact_bill_no', v_contact_bill_no, 'message', 'Duplicate skipped'
            );
        END IF;
    END IF;

    -- ── 2. Validate items ────────────────────────────────────────
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    -- ── 3. Compute totals ────────────────────────────────────────
    v_gross_total := ROUND(
        COALESCE(p_total_amount,      0)
      + COALESCE(p_market_fee,        0)
      + COALESCE(p_nirashrit,         0)
      + COALESCE(p_misc_fee,          0)
      + COALESCE(p_loading_charges,   0)
      + COALESCE(p_unloading_charges, 0)
      + COALESCE(p_other_expenses,    0), 2);
    v_total_inc_tax := ROUND(v_gross_total + COALESCE(p_gst_total, 0), 2);

    -- ── 4. Payment Status (strict math) ─────────────────────────
    v_cheque_status_txt := CASE
        WHEN p_payment_mode = 'cheque' AND p_cheque_status = true  THEN 'Cleared'
        WHEN p_payment_mode = 'cheque'                              THEN 'Pending'
        ELSE NULL
    END;

    IF LOWER(p_payment_mode) IN ('cash','upi','upi/bank','bank_transfer', 'card')
       OR (LOWER(p_payment_mode) = 'cheque' AND p_cheque_status = true)
    THEN
        -- Using p_amount_received exactly if provided, to support partial entries (even passing 0)
        v_receipt_amount := CASE
            WHEN p_amount_received IS NOT NULL THEN ROUND(p_amount_received, 2)
            ELSE v_total_inc_tax
        END;

        -- Exact math comparison for statuses
        v_payment_status := CASE
            WHEN v_receipt_amount >= v_total_inc_tax THEN 'paid'
            WHEN v_receipt_amount > 0 THEN 'partial'
            ELSE 'pending'
        END;
    END IF;
    -- credit/cheque-pending stay 'pending' out of IF block.

    -- ── 5. Insert Sale Record ────────────────────────────────────
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date,
        total_amount, total_amount_inc_tax,
        payment_mode, payment_status,
        market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses,
        due_date, cheque_no, cheque_date, bank_name,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount,
        is_cheque_cleared, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date,
        p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status,
        p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses,
        p_due_date, p_cheque_no, p_cheque_date, p_bank_name,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount,
        p_cheque_status, p_idempotency_key::uuid
    ) RETURNING id, bill_no, contact_bill_no
      INTO v_sale_id, v_bill_no, v_contact_bill_no;

    v_bill_label := COALESCE(v_contact_bill_no, v_bill_no)::text;

    -- ── 6. Insert Sale Items + Decrement Lot Stock ───────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_item_qty    := ROUND((v_item->>'qty')::numeric,  3);
        v_item_rate   := ROUND((v_item->>'rate')::numeric, 2);
        v_item_amount := ROUND(v_item_qty * v_item_rate,   2);
        v_item_gst    := ROUND(COALESCE((v_item->>'gst_amount')::numeric, 0), 2);

        INSERT INTO mandi.sale_items (
            organization_id, sale_id, lot_id, qty, rate, amount, unit, tax_amount
        ) VALUES (
            p_organization_id, v_sale_id,
            (v_item->>'lot_id')::uuid,
            v_item_qty, v_item_rate, v_item_amount,
            COALESCE(v_item->>'unit', 'Box'),
            v_item_gst
        );

        -- Decrement lot stock
        UPDATE mandi.lots
        SET current_qty = current_qty - v_item_qty
        WHERE id = (v_item->>'lot_id')::uuid
          AND organization_id = p_organization_id;

        -- Guard: reject if over-sold
        IF EXISTS (
            SELECT 1 FROM mandi.lots
            WHERE id = (v_item->>'lot_id')::uuid AND current_qty < 0
        ) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot ID %. Transaction Aborted.',
                (v_item->>'lot_id');
        END IF;
    END LOOP;

    -- ── 7. SALE VOUCHER + LEDGER LEG (Items Sold → Debit Buyer) ──
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_sale_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id AND type = 'sales';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, cheque_no, cheque_date,
        cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sales', v_sale_voucher_no,
        v_total_inc_tax, 'Invoice #' || v_bill_label,
        v_sale_id, p_buyer_id, p_payment_mode,
        p_cheque_no, p_cheque_date, v_cheque_status_txt, p_bank_account_id
    ) RETURNING id INTO v_sale_voucher_id;

    -- DR Buyer: Items sold (Naam — buyer owes us)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit,
        entry_date, description, transaction_type, reference_no, reference_id
    ) VALUES (
        p_organization_id, v_sale_voucher_id, p_buyer_id,
        v_total_inc_tax, 0,
        p_sale_date,
        'Invoice #' || v_bill_label,
        'sale',
        v_bill_label,
        v_sale_id
    );

    -- Find Sales Account
    SELECT id INTO v_sales_acct_id FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
      AND name NOT ILIKE '%Commission%'
    ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
    LIMIT 1;

    -- CR Sales Account: Revenue increases (Jama)
    -- Insert unconditionally to ensure the voucher mathematically balances (debit=credit)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, description, transaction_type, reference_no, reference_id
    ) VALUES (
        p_organization_id, v_sale_voucher_id, v_sales_acct_id,
        0, v_total_inc_tax,
        p_sale_date,
        'Invoice #' || v_bill_label,
        'sales',
        v_bill_label,
        v_sale_id
    );

    -- ── 8. RECEIPT VOUCHER + LEDGER LEGS (Payment Received) ──────
    --    Only for instant payments: Cash, UPI, Cleared Cheque
    IF v_receipt_amount > 0 THEN
        -- Resolve cash/bank account
        IF LOWER(p_payment_mode) = 'cash' THEN
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = 1001 LIMIT 1;
        ELSIF p_bank_account_id IS NOT NULL THEN
            v_cash_bank_acc_id := p_bank_account_id;
        ELSE
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = 1002 LIMIT 1;
        END IF;
        -- Final fallback
        IF v_cash_bank_acc_id IS NULL THEN
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts
            WHERE organization_id = p_organization_id AND code = 1001 LIMIT 1;
        END IF;

        IF v_cash_bank_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_rcpt_voucher_no
            FROM mandi.vouchers
            WHERE organization_id = p_organization_id AND type = 'receipt';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, narration, amount,
                contact_id, invoice_id, bank_account_id,
                cheque_no, cheque_date, cheque_status, is_cleared, cleared_at
            ) VALUES (
                p_organization_id, p_sale_date, 'receipt', v_rcpt_voucher_no,
                'Payment against Invoice #' || v_bill_label, v_receipt_amount,
                p_buyer_id, v_sale_id, v_cash_bank_acc_id,
                p_cheque_no, p_cheque_date, v_cheque_status_txt,
                CASE WHEN p_payment_mode = 'cheque' THEN true ELSE false END,
                CASE WHEN p_payment_mode = 'cheque' THEN p_sale_date ELSE NULL END
            ) RETURNING id INTO v_rcpt_voucher_id;

            -- CR Buyer: Payment received (Jama — buyer paid us)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_no, reference_id
            ) VALUES (
                p_organization_id, v_rcpt_voucher_id, p_buyer_id,
                0, v_receipt_amount,
                p_sale_date,
                'Payment against Invoice #' || v_bill_label,
                'receipt',
                v_bill_label,
                v_sale_id
            );

            -- DR Cash/Bank: Asset increases (Jama for our accounts)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_no, reference_id
            ) VALUES (
                p_organization_id, v_rcpt_voucher_id, v_cash_bank_acc_id,
                v_receipt_amount, 0,
                p_sale_date,
                'Cash Received - Invoice #' || v_bill_label,
                'receipt',
                v_bill_label,
                v_sale_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'message', 'Sale created. Status: ' || v_payment_status
    );
END;
$function$;
