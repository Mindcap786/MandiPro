DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid,uuid,date,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,date,uuid,text,date,boolean,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,boolean);

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
    v_rec             RECORD;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        FOR v_rec IN (SELECT id, bill_no, contact_bill_no, payment_status, amount_received
                      FROM mandi.sales WHERE idempotency_key = p_idempotency_key LIMIT 1) LOOP
            RETURN jsonb_build_object('success', true, 'sale_id', v_rec.id, 'bill_no', v_rec.bill_no,
                'contact_bill_no', v_rec.contact_bill_no, 'payment_status', v_rec.payment_status,
                'amount_received', v_rec.amount_received, 'message', 'Idempotent request ignored');
        END LOOP;
    END IF;

    v_ar_acc_id := (SELECT id FROM mandi.accounts
                    WHERE organization_id = p_organization_id
                      AND (code = '1100' OR account_sub_type = 'accounts_receivable')
                    ORDER BY (code = '1100') DESC LIMIT 1);

    v_sales_revenue_acc_id := (SELECT id FROM mandi.accounts
                               WHERE organization_id = p_organization_id
                                 AND (code = '4001' OR name ILIKE 'Sales%Revenue%' OR name ILIKE 'Sale%')
                               ORDER BY (code = '4001') DESC LIMIT 1);

    v_cash_acc_id := (SELECT id FROM mandi.accounts
                      WHERE organization_id = p_organization_id
                        AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%')
                      ORDER BY (code = '1001') DESC LIMIT 1);

    IF p_bank_account_id IS NOT NULL THEN
        v_bank_acc_id := p_bank_account_id;
    ELSE
        v_bank_acc_id := (SELECT id FROM mandi.accounts
                          WHERE organization_id = p_organization_id
                            AND (code = '1002' OR account_sub_type = 'bank' OR name ILIKE 'Bank%')
                          ORDER BY (code = '1002') DESC LIMIT 1);
    END IF;

    v_cheques_transit_acc_id := (SELECT id FROM mandi.accounts
                                 WHERE organization_id = p_organization_id
                                   AND (account_sub_type IN ('cheque','cheques_in_transit') OR name ILIKE '%Cheque%')
                                 LIMIT 1);

    IF v_ar_acc_id IS NULL THEN v_ar_acc_id := v_cash_acc_id; END IF;
    IF v_sales_revenue_acc_id IS NULL THEN v_sales_revenue_acc_id := v_cash_acc_id; END IF;

    IF v_cash_acc_id IS NULL THEN
        RAISE EXCEPTION 'SETUP_ERROR: Cash account not found. Create a Cash account with code 1001.';
    END IF;

    v_total_inc_tax := ROUND((
        COALESCE(p_total_amount,0)       + COALESCE(p_market_fee,0)        +
        COALESCE(p_nirashrit,0)          + COALESCE(p_misc_fee,0)          +
        COALESCE(p_loading_charges,0)    + COALESCE(p_unloading_charges,0) +
        COALESCE(p_other_expenses,0)     + COALESCE(p_gst_total,0)         -
        COALESCE(p_discount_amount,0)
    )::NUMERIC, 2);

    IF v_mode_lower IN ('cash','upi','bank_transfer','upi_cash','bank_upi','upi/bank','neft','rtgs') THEN
        IF p_amount_received IS NOT NULL AND p_amount_received < (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'partial'; v_received := p_amount_received;
        ELSE
            v_payment_status := 'paid'; v_received := COALESCE(p_amount_received, v_total_inc_tax);
        END IF;
    ELSIF v_mode_lower = 'cheque' THEN
        v_payment_status := CASE WHEN p_cheque_status THEN 'paid' ELSE 'pending' END;
        v_received := CASE WHEN p_cheque_status THEN COALESCE(p_amount_received, v_total_inc_tax) ELSE 0 END;
    ELSIF v_mode_lower IN ('udhaar','credit') THEN
        v_payment_status := 'pending'; v_received := 0;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN
        v_payment_status := CASE WHEN p_amount_received >= (v_total_inc_tax - 0.01) THEN 'paid' ELSE 'partial' END;
        v_received := p_amount_received;
    ELSE
        v_payment_status := 'pending'; v_received := 0;
    END IF;

    FOR v_rec IN (
        WITH new_sale AS (
            INSERT INTO mandi.sales (
                organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
                payment_mode, payment_status, amount_received,
                market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
                due_date, cheque_no, cheque_date, bank_name, bank_account_id,
                cgst_amount, sgst_amount, igst_amount, gst_total,
                discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
            ) VALUES (
                p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
                p_payment_mode, v_payment_status, v_received,
                COALESCE(p_market_fee,0), COALESCE(p_nirashrit,0), COALESCE(p_misc_fee,0),
                COALESCE(p_loading_charges,0), COALESCE(p_unloading_charges,0), COALESCE(p_other_expenses,0),
                p_due_date, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
                COALESCE(p_cgst_amount,0), COALESCE(p_sgst_amount,0), COALESCE(p_igst_amount,0), COALESCE(p_gst_total,0),
                COALESCE(p_discount_percent,0), COALESCE(p_discount_amount,0),
                p_place_of_supply, p_buyer_gstin, p_idempotency_key
            ) RETURNING id, bill_no, contact_bill_no
        )
        SELECT * FROM new_sale
    ) LOOP
        v_sale_id := v_rec.id;
        v_bill_no := v_rec.bill_no;
        v_contact_bill_no := v_rec.contact_bill_no;
    END LOOP;

    FOR v_item IN (SELECT value FROM jsonb_array_elements(p_items)) LOOP
        v_qty  := COALESCE((v_item->>'qty')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'rate_per_unit')::NUMERIC, 0);
        IF v_qty > 0 THEN
            INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, organization_id)
            VALUES (v_sale_id,
                CASE WHEN (v_item->>'lot_id') IS NOT NULL THEN (v_item->>'lot_id')::UUID ELSE NULL END,
                v_qty, v_rate, ROUND(v_qty * v_rate, 2), p_organization_id);
            IF (v_item->>'lot_id') IS NOT NULL THEN
                UPDATE mandi.lots SET current_qty = ROUND(COALESCE(current_qty,0) - v_qty, 3)
                WHERE id = (v_item->>'lot_id')::UUID;
            END IF;
        END IF;
    END LOOP;

    v_next_voucher_no := (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale');

    FOR v_rec IN (
        WITH new_voucher AS (
            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, amount, narration, invoice_id
            ) VALUES (
                p_organization_id, p_sale_date, 'sale', v_next_voucher_no, v_total_inc_tax,
                'Sale Invoice #' || v_bill_no, v_sale_id
            ) RETURNING id
        )
        SELECT * FROM new_voucher
    ) LOOP
        v_voucher_id := v_rec.id;
    END LOOP;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, contact_id,
        debit, credit, entry_date, description, transaction_type, reference_id
    ) VALUES
    (p_organization_id, v_voucher_id, v_ar_acc_id, p_buyer_id,
     v_total_inc_tax, 0, p_sale_date,
     'Sale Bill #' || v_bill_no || ' | ' || COALESCE(p_payment_mode,''),
     'sale', v_sale_id),
    (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, NULL,
     0, v_total_inc_tax, p_sale_date,
     'Sales Revenue - Bill #' || v_bill_no,
     'sale', v_sale_id);

    IF v_received > 0 AND v_mode_lower NOT IN ('udhaar','credit') THEN
        v_payment_acc_id := CASE
            WHEN v_mode_lower IN ('cash','upi','upi_cash','bank_upi','upi/bank') THEN v_cash_acc_id
            WHEN v_mode_lower IN ('bank_transfer','neft','rtgs')                  THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            WHEN v_mode_lower = 'cheque'                                          THEN COALESCE(v_cheques_transit_acc_id, v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;

        v_next_voucher_no := (SELECT COALESCE(MAX(voucher_no),0)+1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt');

        FOR v_rec IN (
            WITH new_receipt AS (
                INSERT INTO mandi.vouchers (
                    organization_id, date, type, voucher_no, amount, narration, invoice_id
                ) VALUES (
                    p_organization_id, p_sale_date, 'receipt', v_next_voucher_no, v_received,
                    'Payment on Sale #' || v_bill_no || ' via ' || COALESCE(p_payment_mode,''),
                    v_sale_id
                ) RETURNING id
            )
            SELECT * FROM new_receipt
        ) LOOP
            v_receipt_voucher_id := v_rec.id;
        END LOOP;

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, contact_id,
            debit, credit, entry_date, description, transaction_type, reference_id
        ) VALUES
        (p_organization_id, v_receipt_voucher_id, v_payment_acc_id, NULL,
         v_received, 0, p_sale_date,
         'Payment on Sale #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'') || ')',
         'receipt', v_receipt_voucher_id),
        (p_organization_id, v_receipt_voucher_id, v_ar_acc_id, p_buyer_id,
         0, v_received, p_sale_date,
         'Payment on Sale #' || v_bill_no || ' (' || COALESCE(p_payment_mode,'') || ')',
         'receipt', v_receipt_voucher_id);
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
