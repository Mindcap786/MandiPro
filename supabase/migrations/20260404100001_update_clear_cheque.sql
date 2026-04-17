-- Update clear_cheque to sync state with mandi.lots before calling post_arrival_ledger
-- This ensures that when post_arrival_ledger rebuilds the ledger, it retains the cleared status and the selected target bank account.

CREATE OR REPLACE FUNCTION mandi.clear_cheque(p_voucher_id uuid, p_bank_account_id uuid, p_clear_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher mandi.vouchers%ROWTYPE;
    v_ledger_count integer := 0;
    v_discount_allowed_acc_id uuid;
    v_discount_received_acc_id uuid;
    v_reference_no text;
    v_balance record;
    v_receipt_txn_type text;
    v_payment_txn_type text;
    v_target_bank_id uuid;
    v_final_contact_id uuid;
BEGIN
    SELECT *
    INTO v_voucher
    FROM mandi.vouchers
    WHERE id = p_voucher_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    IF coalesce(v_voucher.cheque_status, '') = 'Cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cancelled cheque cannot be cleared');
    END IF;

    v_final_contact_id := COALESCE(v_voucher.contact_id, v_voucher.party_id);
    v_target_bank_id := COALESCE(p_bank_account_id, v_voucher.bank_account_id);

    IF v_target_bank_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bank account is required to clear cheque');
    END IF;

    SELECT COUNT(*)
    INTO v_ledger_count
    FROM mandi.ledger_entries
    WHERE voucher_id = p_voucher_id;

    SELECT id
    INTO v_discount_allowed_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_voucher.organization_id
      AND code = '4006'
    LIMIT 1;

    SELECT id
    INTO v_discount_received_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_voucher.organization_id
      AND code = '3003'
    LIMIT 1;

    v_reference_no := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN (
            SELECT coalesce(contact_bill_no, bill_no)::text
            FROM mandi.sales
            WHERE id = v_voucher.invoice_id
        )
        WHEN v_voucher.reference_id IS NOT NULL THEN (
            SELECT coalesce(contact_bill_no, bill_no)::text
            FROM mandi.arrivals
            WHERE id = v_voucher.reference_id
        )
        ELSE v_voucher.voucher_no::text
    END;

    v_receipt_txn_type := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN 'sale_payment'
        ELSE 'receipt'
    END;

    v_payment_txn_type := CASE
        WHEN v_voucher.reference_id IS NOT NULL THEN 'purchase'
        WHEN v_voucher.account_id IS NOT NULL AND v_voucher.party_id IS NULL THEN 'expense'
        ELSE 'payment'
    END;

    -- Only insert ledger entries if they don't exist yet
    IF v_ledger_count = 0 THEN
        IF v_voucher.type = 'receipt' THEN
            -- Leg 1: Debit Bank
            IF v_voucher.amount > 0 THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_target_bank_id, v_voucher.amount,
                    0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                );
            END IF;

            -- Discount Allowed (if any)
            IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_discount_allowed_acc_id, v_voucher.discount_amount,
                    0, p_clear_date::date, 'Discount Allowed', v_receipt_txn_type,
                    coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                );
            END IF;

            -- Leg 2: Credit Party
            IF v_final_contact_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_final_contact_id, 0,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                );
            ELSIF v_voucher.account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_voucher.account_id, 0,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                );
            END IF;

        ELSIF v_voucher.type = 'payment' THEN
            -- Leg 1: Debit Party
            IF v_final_contact_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_final_contact_id,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                    v_payment_txn_type, v_voucher.reference_id, v_reference_no
                );
            ELSIF v_voucher.account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_voucher.account_id,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                    v_payment_txn_type, v_voucher.reference_id, v_reference_no
                );
            END IF;

            -- Discount Received (if any)
            IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_final_contact_id IS NOT NULL AND v_discount_received_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_discount_received_acc_id, 0,
                    v_voucher.discount_amount, p_clear_date::date, 'Discount Received',
                    v_payment_txn_type, v_voucher.reference_id, v_reference_no
                );
            END IF;

            -- Leg 2: Credit Bank
            IF v_voucher.amount > 0 THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id, v_voucher.id, v_target_bank_id, 0,
                    v_voucher.amount, p_clear_date::date, 'Cheque Payment Cleared',
                    v_payment_txn_type, v_voucher.reference_id, v_reference_no
                );
            END IF;
        END IF;
    END IF;

    -- Update Voucher Status
    UPDATE mandi.vouchers
    SET is_cleared = true,
        cleared_at = p_clear_date,
        cheque_status = 'Cleared',
        bank_account_id = v_target_bank_id
    WHERE id = p_voucher_id;

    -- RE-TRIGGER STATUS UPDATES
    IF v_voucher.invoice_id IS NOT NULL THEN
        SELECT *
        FROM mandi.get_invoice_balance(v_voucher.invoice_id)
        INTO v_balance;

        UPDATE mandi.sales
        SET is_cheque_cleared = true,
            payment_status = CASE
                WHEN coalesce(v_balance.balance_due, 0) <= 0.01 THEN 'paid'
                WHEN coalesce(v_balance.amount_paid, 0) > 0 THEN 'partial'
                ELSE payment_status
            END
        WHERE id = v_voucher.invoice_id;
    END IF;

    -- 2. For Arrivals (Purchases)
    IF v_voucher.arrival_id IS NOT NULL THEN
        UPDATE mandi.lots SET advance_cheque_status = true, advance_bank_account_id = v_target_bank_id WHERE arrival_id = v_voucher.arrival_id AND advance > 0;
        PERFORM mandi.post_arrival_ledger(v_voucher.arrival_id);
    ELSIF v_voucher.reference_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM mandi.arrivals WHERE id = v_voucher.reference_id) THEN
            UPDATE mandi.lots SET advance_cheque_status = true, advance_bank_account_id = v_target_bank_id WHERE arrival_id = v_voucher.reference_id AND advance > 0;
            PERFORM mandi.post_arrival_ledger(v_voucher.reference_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cleared successfully');
END;
$function$;
