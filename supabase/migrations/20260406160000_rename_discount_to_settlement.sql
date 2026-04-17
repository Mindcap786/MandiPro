-- Rename discount accounts to settlement terminology
-- "Discount Allowed" (4006) → "Settlement Write-off" (expense: mandi loses money when buyer settles for less)
-- "Discount Received" (3003) → "Settlement Gain" (income: mandi gains when paying supplier less)

UPDATE mandi.accounts SET name = 'Settlement Write-off' WHERE code = '4006';
-- Also update any existing ledger descriptions
UPDATE mandi.ledger_entries SET description = 'Settlement Write-off' WHERE description = 'Discount Allowed';
UPDATE mandi.ledger_entries SET description = 'Settlement Gain' WHERE description = 'Discount Received';
UPDATE mandi.accounts SET name = 'Settlement Gain' WHERE code = '3003';

-- Update create_voucher to use settlement descriptions
CREATE OR REPLACE FUNCTION mandi.create_voucher(
    p_organization_id uuid,
    p_voucher_type text,
    p_date timestamp with time zone,
    p_amount numeric,
    p_payment_mode text,
    p_party_id uuid DEFAULT NULL,
    p_remarks text DEFAULT '',
    p_discount numeric DEFAULT 0,
    p_invoice_id uuid DEFAULT NULL,
    p_account_id uuid DEFAULT NULL,
    p_employee_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_cheque_status text DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL,
    p_lot_id uuid DEFAULT NULL,
    p_arrival_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id uuid;
    v_voucher_no bigint;
    v_contra_account_id uuid;
    v_writeoff_expense_acc_id uuid;   -- Settlement Write-off (4006) — expense for mandi
    v_settlement_gain_acc_id uuid;    -- Settlement Gain (3003) — income for mandi
    v_effective_txn_type text;
    v_payment_mode text := lower(coalesce(p_payment_mode, 'cash'));
    v_is_cleared boolean := lower(coalesce(p_cheque_status, '')) = 'cleared';
    v_is_pending_cheque boolean := v_payment_mode = 'cheque' AND NOT v_is_cleared;
BEGIN
    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id
      AND type = p_voucher_type;

    IF p_amount > 0 THEN
        IF p_bank_account_id IS NOT NULL THEN
            v_contra_account_id := p_bank_account_id;
        ELSIF v_payment_mode = 'cash' THEN
            SELECT id
            INTO v_contra_account_id
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
            INTO v_contra_account_id
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

        IF v_contra_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash/Bank Account not found for payment mode %', p_payment_mode;
        END IF;
    END IF;

    IF p_discount > 0 THEN
        -- Settlement Write-off: expense account (mandi's loss when buyer settles for less)
        SELECT id INTO v_writeoff_expense_acc_id
        FROM mandi.accounts
        WHERE organization_id = p_organization_id AND code = '4006'
        LIMIT 1;

        -- Settlement Gain: income account (mandi's gain when paying supplier less)
        SELECT id INTO v_settlement_gain_acc_id
        FROM mandi.accounts
        WHERE organization_id = p_organization_id AND code = '3003'
        LIMIT 1;

        -- Auto-create if missing
        IF v_writeoff_expense_acc_id IS NULL THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (p_organization_id, 'Settlement Write-off', 'expense', '4006', true)
            RETURNING id INTO v_writeoff_expense_acc_id;
        END IF;

        IF v_settlement_gain_acc_id IS NULL THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (p_organization_id, 'Settlement Gain', 'income', '3003', true)
            RETURNING id INTO v_settlement_gain_acc_id;
        END IF;
    END IF;

    INSERT INTO mandi.vouchers (
        organization_id, type, date, narration, invoice_id, amount, discount_amount,
        voucher_no, cheque_no, cheque_date, is_cleared, cheque_status,
        bank_name, party_id, account_id, payment_mode, bank_account_id, reference_id
    )
    VALUES (
        p_organization_id, p_voucher_type, p_date::date,
        coalesce(nullif(p_remarks, ''), initcap(p_voucher_type)),
        p_invoice_id, p_amount, p_discount, v_voucher_no,
        p_cheque_no, p_cheque_date, v_is_cleared,
        CASE WHEN v_payment_mode = 'cheque' THEN coalesce(p_cheque_status, CASE WHEN v_is_cleared THEN 'Cleared' ELSE 'Pending' END) ELSE NULL END,
        p_bank_name, p_party_id, p_account_id, p_payment_mode, p_bank_account_id, p_reference_id
    )
    RETURNING id INTO v_voucher_id;

    -- Pending cheques stay off-ledger until cleared
    IF v_is_pending_cheque THEN
        RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
    END IF;

    IF p_voucher_type = 'receipt' THEN
        -- Cash/Bank debit (money received)
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, CASE WHEN p_invoice_id IS NOT NULL THEN 'sale_payment' ELSE 'receipt' END,
                coalesce(p_reference_id, p_invoice_id), v_voucher_no::text,
                v_contra_account_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), p_amount, 0, v_voucher_id
            );
        END IF;

        -- Settlement Write-off debit (mandi's expense — buyer paid less)
        IF p_discount > 0 AND v_writeoff_expense_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, CASE WHEN p_invoice_id IS NOT NULL THEN 'sale_payment' ELSE 'receipt' END,
                coalesce(p_reference_id, p_invoice_id), v_voucher_no::text,
                v_writeoff_expense_acc_id, 'Settlement Write-off', p_discount, 0, v_voucher_id
            );
        END IF;

        -- Credit buyer (reduces their outstanding balance by amount + write-off)
        IF p_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, CASE WHEN p_invoice_id IS NOT NULL THEN 'sale_payment' ELSE 'receipt' END,
                coalesce(p_reference_id, p_invoice_id), v_voucher_no::text,
                p_party_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSIF p_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, CASE WHEN p_invoice_id IS NOT NULL THEN 'sale_payment' ELSE 'receipt' END,
                coalesce(p_reference_id, p_invoice_id), v_voucher_no::text,
                p_account_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSE
            RAISE EXCEPTION 'Receipt voucher requires either party_id or account_id';
        END IF;

    ELSIF p_voucher_type = 'payment' THEN
        v_effective_txn_type := CASE
            WHEN p_reference_id IS NOT NULL THEN 'purchase'
            WHEN p_account_id IS NOT NULL AND p_party_id IS NULL THEN 'expense'
            ELSE 'payment'
        END;

        -- Debit supplier (reduces their payable balance by amount + settlement gain)
        IF p_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                p_party_id, p_employee_id, coalesce(nullif(p_remarks, ''), 'Payment Made'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSIF p_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                p_account_id, p_employee_id, coalesce(nullif(p_remarks, ''), 'Mandi Expense'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSE
            RAISE EXCEPTION 'Payment voucher requires either party_id or account_id';
        END IF;

        -- Settlement Gain credit (mandi's income — paid supplier less)
        IF p_discount > 0 AND p_party_id IS NOT NULL AND v_settlement_gain_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                v_settlement_gain_acc_id, 'Settlement Gain', p_discount, 0, v_voucher_id
            );
        END IF;

        -- Cash/Bank credit (money paid out)
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                v_contra_account_id, 'Payment Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported voucher type %', p_voucher_type;
    END IF;

    -- Post-voucher: settle arrival if linked
    IF p_arrival_id IS NOT NULL THEN
        PERFORM mandi.post_arrival_ledger(p_arrival_id);
    ELSIF p_lot_id IS NOT NULL THEN
        DECLARE v_arr_id uuid;
        BEGIN
            SELECT arrival_id INTO v_arr_id FROM mandi.lots WHERE id = p_lot_id;
            IF v_arr_id IS NOT NULL THEN
                PERFORM mandi.post_arrival_ledger(v_arr_id);
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;
