-- This migration fixes the confirm_sale_transaction RPC to ensure correct Day Book tracking.
-- Udhaar (Credit) sales will only log the sale amounts (Debit Buyer, Credit Sales).
-- Paid sales will log the sale amounts AND the receipt amounts all under the same transaction voucher type 'sale'.

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
    p_cheque_status boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id UUID;
    v_sale_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_account_id UUID;
    v_sales_acct UUID;
    v_total_payable NUMERIC;
    v_existing_sale_id UUID;
    v_payment_status TEXT;
    v_sale_item_id UUID;
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
        ) RETURNING id INTO v_sale_item_id;

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

    -- 1. Create exactly one SALE voucher for the transaction
    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        cheque_no, cheque_date, is_cleared
    ) VALUES (
        p_organization_id,
        p_sale_date,
        'sale',
        v_bill_no,
        'Sale Invoice #' || v_bill_no || ' generated',
        v_total_payable,
        p_cheque_no,
        p_cheque_date,
        p_cheque_status
    ) RETURNING id INTO v_sale_voucher_id;

    -- Look up the canonical Sales Account
    SELECT id INTO v_sales_acct FROM mandi.accounts 
    WHERE organization_id = p_organization_id 
      AND code = '4001' LIMIT 1;

    IF v_sales_acct IS NULL THEN
        SELECT id INTO v_sales_acct FROM mandi.accounts 
        WHERE organization_id = p_organization_id 
          AND name ILIKE 'Sales%' LIMIT 1;
    END IF;

    -- 2. Log SALE Event (Always done for both Udhaar and Non-Udhaar)
    -- Debit Buyer
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit, entry_date, description
    ) VALUES (
        p_organization_id,
        v_sale_voucher_id,
        p_buyer_id,
        v_total_payable,
        0,
        p_sale_date,
        'Sale Invoice #' || v_bill_no
    );
    -- Credit Sales
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date, description
    ) VALUES (
        p_organization_id,
        v_sale_voucher_id,
        v_sales_acct,
        0,
        v_total_payable,
        p_sale_date,
        'Sale Invoice #' || v_bill_no
    );

    -- 3. Log PAYMENT Event (If any) UNDER THE SAME SALE VOUCHER!
    IF v_payment_status = 'paid' THEN
        IF p_bank_account_id IS NOT NULL THEN
            v_account_id := p_bank_account_id;
        ELSE
            IF p_payment_mode = 'cash' THEN
                SELECT id
                INTO v_account_id
                FROM mandi.accounts
                WHERE organization_id = p_organization_id
                  AND code = '1001'
                LIMIT 1;
            ELSE
                SELECT id
                INTO v_account_id
                FROM mandi.accounts
                WHERE organization_id = p_organization_id
                  AND code = '1002'
                LIMIT 1;
            END IF;

            IF v_account_id IS NULL THEN
                IF p_payment_mode = 'cash' THEN
                    SELECT id
                    INTO v_account_id
                    FROM mandi.accounts
                    WHERE organization_id = p_organization_id
                      AND name ILIKE 'Cash%'
                    LIMIT 1;
                ELSE
                    SELECT id
                    INTO v_account_id
                    FROM mandi.accounts
                    WHERE organization_id = p_organization_id
                      AND (name ILIKE 'Bank%' OR name ILIKE 'HDFC%')
                    LIMIT 1;
                END IF;
            END IF;
        END IF;

        IF v_account_id IS NOT NULL THEN
            -- Credit Buyer
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit, entry_date, description
            ) VALUES (
                p_organization_id,
                v_sale_voucher_id,
                p_buyer_id,
                0,
                v_total_payable,
                p_sale_date,
                'Payment Received - Inv #' || v_bill_no
            );

            -- Debit Cash/Bank
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit, entry_date, description
            ) VALUES (
                p_organization_id,
                v_sale_voucher_id,
                v_account_id,
                v_total_payable,
                0,
                p_sale_date,
                'Payment Received - Inv #' || v_bill_no
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;
