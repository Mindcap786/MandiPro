-- Fix: Record partial-payment receipt in daybook for Sales and POS
-- The previous function had no p_amount_received param, so partial receipts were silently dropped.

DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, uuid, date, uuid, text, date, boolean);

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id uuid,
    p_buyer_id uuid,
    p_sale_date date,
    p_payment_mode text,
    p_total_amount numeric,
    p_items jsonb,
    p_market_fee numeric DEFAULT 0,
    p_nirashrit numeric DEFAULT 0,
    p_misc_fee numeric DEFAULT 0,
    p_loading_charges numeric DEFAULT 0,
    p_unloading_charges numeric DEFAULT 0,
    p_other_expenses numeric DEFAULT 0,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_due_date date DEFAULT NULL::date,
    p_bank_account_id uuid DEFAULT NULL::uuid,
    p_cheque_no text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_cheque_status boolean DEFAULT false,
    p_amount_received numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id uuid;
    v_receipt_voucher_id uuid;
    v_bill_no bigint;
    v_item jsonb;
    v_account_id uuid;
    v_total_payable numeric;
    v_existing_sale_id uuid;
    v_payment_status text;
    v_receipt_amount numeric;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id
        INTO v_existing_sale_id
        FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key;

        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'sale_id', v_existing_sale_id,
                'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
                'message', 'Duplicate skipped'
            );
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    v_payment_status := CASE
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid'
        WHEN p_payment_mode IN ('cheque', 'CHEQUE') AND p_cheque_status = true THEN 'paid'
        WHEN p_payment_mode = 'Partial' AND p_amount_received IS NOT NULL AND p_amount_received > 0 THEN 'partial'
        ELSE 'pending'
    END;

    SELECT COALESCE(MAX(bill_no), 0) + 1
    INTO v_bill_no
    FROM mandi.sales
    WHERE organization_id = p_organization_id;

    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, created_at, idempotency_key, due_date,
        cheque_no, cheque_date, is_cheque_cleared
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no,
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        v_payment_status, NOW(), p_idempotency_key, p_due_date,
        p_cheque_no, p_cheque_date, p_cheque_status
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (
            organization_id, sale_id, lot_id, qty, rate, amount, unit
        ) VALUES (
            p_organization_id,
            v_sale_id,
            (v_item->>'lot_id')::uuid,
            (v_item->>'qty')::numeric,
            (v_item->>'rate')::numeric,
            (v_item->>'amount')::numeric,
            v_item->>'unit'
        );

        UPDATE mandi.lots
        SET current_qty = current_qty - (v_item->>'qty')::numeric
        WHERE id = (v_item->>'lot_id')::uuid;

        IF EXISTS (
            SELECT 1
            FROM mandi.lots
            WHERE id = (v_item->>'lot_id')::uuid
              AND current_qty < 0
        ) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot ID %. Transaction Aborted.', (v_item->>'lot_id');
        END IF;
    END LOOP;

    v_total_payable := p_total_amount
        + p_market_fee
        + p_nirashrit
        + p_misc_fee
        + p_loading_charges
        + p_unloading_charges
        + p_other_expenses;

    -- Determine the actual cash received:
    -- For full payments (paid): receipt = total payable
    -- For partial payments (partial): receipt = amount_received (what was actually paid upfront)
    -- For credit/pending: no receipt
    IF v_payment_status = 'paid' THEN
        v_receipt_amount := v_total_payable;
    ELSIF v_payment_status = 'partial' AND p_amount_received > 0 THEN
        v_receipt_amount := p_amount_received;
    ELSE
        v_receipt_amount := 0;
    END IF;

    IF v_receipt_amount > 0 THEN
        -- Resolve the cash/bank account
        IF p_bank_account_id IS NOT NULL THEN
            v_account_id := p_bank_account_id;
        ELSIF p_payment_mode IN ('cash', 'Cash') OR v_payment_status = 'partial' THEN
            SELECT id
            INTO v_account_id
            FROM mandi.accounts
            WHERE organization_id = p_organization_id
              AND type = 'asset'
              AND (
                  code = '1001' OR
                  account_sub_type = 'cash' OR
                  name ILIKE 'Cash%'
              )
            ORDER BY (code = '1001') DESC, created_at
            LIMIT 1;
        ELSE
            SELECT id
            INTO v_account_id
            FROM mandi.accounts
            WHERE organization_id = p_organization_id
              AND type = 'asset'
              AND (
                  code = '1002' OR
                  account_sub_type = 'bank' OR
                  name ILIKE 'Bank%' OR
                  name ILIKE 'HDFC%'
              )
            ORDER BY (code = '1002') DESC, created_at
            LIMIT 1;
        END IF;

        IF v_account_id IS NOT NULL THEN
            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, narration, amount,
                cheque_no, cheque_date, is_cleared, invoice_id
            ) VALUES (
                p_organization_id, p_sale_date, 'receipt', v_bill_no,
                'Sale Payment #' || v_bill_no, v_receipt_amount,
                p_cheque_no, p_cheque_date, p_cheque_status,
                v_sale_id
            ) RETURNING id INTO v_receipt_voucher_id;

            -- Buyer credit leg (money received from buyer)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit, entry_date,
                description, transaction_type, reference_no
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_receipt_amount, p_sale_date,
                'Sale Payment #' || v_bill_no, 'sale_payment', v_bill_no::text
            );

            -- Cash/Bank debit leg (cash physically received)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit, entry_date,
                description, transaction_type, reference_no
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, v_account_id, v_receipt_amount, 0, p_sale_date,
                'Sale Payment #' || v_bill_no, 'sale_payment', v_bill_no::text
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;
