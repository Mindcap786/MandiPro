-- Unify contact-wise bill numbering, cheque clearing, and liquid-account transfers.

CREATE TABLE IF NOT EXISTS mandi.contact_bill_sequences (
    organization_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    sequence_type text NOT NULL CHECK (sequence_type IN ('sale', 'purchase')),
    last_bill_no bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, contact_id, sequence_type)
);

ALTER TABLE mandi.contact_bill_sequences
    ADD CONSTRAINT contact_bill_sequences_contact_fkey
    FOREIGN KEY (contact_id) REFERENCES mandi.contacts(id)
    ON DELETE CASCADE;

ALTER TABLE mandi.sales
    ADD COLUMN IF NOT EXISTS contact_bill_no bigint;

ALTER TABLE mandi.arrivals
    ADD COLUMN IF NOT EXISTS contact_bill_no bigint;

ALTER TABLE mandi.vouchers
    ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES mandi.contacts(id),
    ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES mandi.accounts(id),
    ADD COLUMN IF NOT EXISTS payment_mode text,
    ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES mandi.accounts(id),
    ADD COLUMN IF NOT EXISTS reference_id uuid,
    ADD COLUMN IF NOT EXISTS cheque_status text,
    ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

CREATE OR REPLACE FUNCTION mandi.next_contact_bill_no(
    p_organization_id uuid,
    p_contact_id uuid,
    p_sequence_type text
)
RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
    v_next_no bigint;
BEGIN
    INSERT INTO mandi.contact_bill_sequences (
        organization_id,
        contact_id,
        sequence_type,
        last_bill_no,
        updated_at
    )
    VALUES (
        p_organization_id,
        p_contact_id,
        p_sequence_type,
        1,
        now()
    )
    ON CONFLICT (organization_id, contact_id, sequence_type)
    DO UPDATE
    SET last_bill_no = mandi.contact_bill_sequences.last_bill_no + 1,
        updated_at = now()
    RETURNING last_bill_no INTO v_next_no;

    RETURN v_next_no;
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.assign_sale_contact_bill_no()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.contact_bill_no IS NULL AND NEW.buyer_id IS NOT NULL THEN
        NEW.contact_bill_no := mandi.next_contact_bill_no(
            NEW.organization_id,
            NEW.buyer_id,
            'sale'
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.assign_arrival_contact_bill_no()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.contact_bill_no IS NULL AND NEW.party_id IS NOT NULL THEN
        NEW.contact_bill_no := mandi.next_contact_bill_no(
            NEW.organization_id,
            NEW.party_id,
            'purchase'
        );
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_sale_contact_bill_no ON mandi.sales;
CREATE TRIGGER trg_assign_sale_contact_bill_no
BEFORE INSERT ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.assign_sale_contact_bill_no();

DROP TRIGGER IF EXISTS trg_assign_arrival_contact_bill_no ON mandi.arrivals;
CREATE TRIGGER trg_assign_arrival_contact_bill_no
BEFORE INSERT ON mandi.arrivals
FOR EACH ROW
EXECUTE FUNCTION mandi.assign_arrival_contact_bill_no();

WITH ranked_sales AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY organization_id, buyer_id
            ORDER BY sale_date NULLS LAST, created_at NULLS LAST, id
        ) AS seq_no
    FROM mandi.sales
    WHERE buyer_id IS NOT NULL
)
UPDATE mandi.sales s
SET contact_bill_no = ranked_sales.seq_no
FROM ranked_sales
WHERE s.id = ranked_sales.id
  AND s.contact_bill_no IS NULL;

WITH ranked_arrivals AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY organization_id, party_id
            ORDER BY arrival_date NULLS LAST, created_at NULLS LAST, id
        ) AS seq_no
    FROM mandi.arrivals
    WHERE party_id IS NOT NULL
)
UPDATE mandi.arrivals a
SET contact_bill_no = ranked_arrivals.seq_no
FROM ranked_arrivals
WHERE a.id = ranked_arrivals.id
  AND a.contact_bill_no IS NULL;

INSERT INTO mandi.contact_bill_sequences (organization_id, contact_id, sequence_type, last_bill_no, updated_at)
SELECT organization_id, buyer_id, 'sale', MAX(contact_bill_no), now()
FROM mandi.sales
WHERE buyer_id IS NOT NULL
  AND contact_bill_no IS NOT NULL
GROUP BY organization_id, buyer_id
ON CONFLICT (organization_id, contact_id, sequence_type)
DO UPDATE
SET last_bill_no = EXCLUDED.last_bill_no,
    updated_at = now();

INSERT INTO mandi.contact_bill_sequences (organization_id, contact_id, sequence_type, last_bill_no, updated_at)
SELECT organization_id, party_id, 'purchase', MAX(contact_bill_no), now()
FROM mandi.arrivals
WHERE party_id IS NOT NULL
  AND contact_bill_no IS NOT NULL
GROUP BY organization_id, party_id
ON CONFLICT (organization_id, contact_id, sequence_type)
DO UPDATE
SET last_bill_no = EXCLUDED.last_bill_no,
    updated_at = now();

CREATE OR REPLACE FUNCTION mandi.reset_contact_bill_no(
    p_organization_id uuid,
    p_contact_id uuid,
    p_type text,
    p_new_start bigint DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sequence_type text;
BEGIN
    v_sequence_type := CASE
        WHEN lower(coalesce(p_type, '')) IN ('sale', 'sales') THEN 'sale'
        ELSE 'purchase'
    END;

    INSERT INTO mandi.contact_bill_sequences (
        organization_id,
        contact_id,
        sequence_type,
        last_bill_no,
        updated_at
    )
    VALUES (
        p_organization_id,
        p_contact_id,
        v_sequence_type,
        GREATEST(coalesce(p_new_start, 1) - 1, 0),
        now()
    )
    ON CONFLICT (organization_id, contact_id, sequence_type)
    DO UPDATE
    SET last_bill_no = EXCLUDED.last_bill_no,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'contact_id', p_contact_id,
        'type', v_sequence_type,
        'next_bill_no', GREATEST(coalesce(p_new_start, 1), 1)
    );
END;
$function$;

DROP FUNCTION IF EXISTS mandi.create_voucher(uuid, text, timestamp with time zone, numeric, text, uuid, text, numeric, uuid, uuid, uuid, text, date, text, text, uuid);

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
    v_discount_allowed_acc_id uuid;
    v_discount_received_acc_id uuid;
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
        SELECT id
        INTO v_discount_allowed_acc_id
        FROM mandi.accounts
        WHERE organization_id = p_organization_id
          AND code = '4006'
        LIMIT 1;

        SELECT id
        INTO v_discount_received_acc_id
        FROM mandi.accounts
        WHERE organization_id = p_organization_id
          AND code = '3003'
        LIMIT 1;
    END IF;

    INSERT INTO mandi.vouchers (
        organization_id,
        type,
        date,
        narration,
        invoice_id,
        amount,
        discount_amount,
        voucher_no,
        employee_id,
        cheque_no,
        cheque_date,
        is_cleared,
        cheque_status,
        bank_name,
        party_id,
        account_id,
        payment_mode,
        bank_account_id,
        reference_id
    )
    VALUES (
        p_organization_id,
        p_voucher_type,
        p_date::date,
        coalesce(nullif(p_remarks, ''), initcap(p_voucher_type)),
        p_invoice_id,
        p_amount,
        p_discount,
        v_voucher_no,
        p_employee_id,
        p_cheque_no,
        p_cheque_date,
        v_is_cleared,
        CASE
            WHEN v_payment_mode = 'cheque' THEN coalesce(p_cheque_status, CASE WHEN v_is_cleared THEN 'Cleared' ELSE 'Pending' END)
            ELSE NULL
        END,
        p_bank_name,
        p_party_id,
        p_account_id,
        p_payment_mode,
        p_bank_account_id,
        p_reference_id
    )
    RETURNING id INTO v_voucher_id;

    -- Pending cheques stay off-ledger until the user marks them cleared.
    IF v_is_pending_cheque THEN
        RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
    END IF;

    IF p_voucher_type = 'receipt' THEN
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

        IF p_discount > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, CASE WHEN p_invoice_id IS NOT NULL THEN 'sale_payment' ELSE 'receipt' END,
                coalesce(p_reference_id, p_invoice_id), v_voucher_no::text,
                v_discount_allowed_acc_id, 'Discount Allowed', p_discount, 0, v_voucher_id
            );
        END IF;

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

        IF p_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                p_party_id, p_employee_id, coalesce(nullif(p_remarks, ''), 'Receipt Paid'), (p_amount + p_discount), 0, v_voucher_id
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

        IF p_discount > 0 AND p_party_id IS NOT NULL AND v_discount_received_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, p_reference_id, v_voucher_no::text,
                v_discount_received_acc_id, 'Discount Received', p_discount, 0, v_voucher_id
            );
        END IF;

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

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;

DROP FUNCTION IF EXISTS mandi.clear_cheque(uuid, uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION mandi.clear_cheque(
    p_voucher_id uuid,
    p_bank_account_id uuid,
    p_clear_date timestamp with time zone DEFAULT now()
)
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

    IF v_ledger_count = 0 THEN
        IF coalesce(p_bank_account_id, v_voucher.bank_account_id) IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Bank account is required to clear cheque');
        END IF;

        IF v_voucher.type = 'receipt' THEN
            IF v_voucher.amount > 0 THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    coalesce(p_bank_account_id, v_voucher.bank_account_id),
                    v_voucher.amount,
                    0,
                    p_clear_date::date,
                    coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type,
                    coalesce(v_voucher.reference_id, v_voucher.invoice_id),
                    v_reference_no
                );
            END IF;

            IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_discount_allowed_acc_id,
                    v_voucher.discount_amount,
                    0,
                    p_clear_date::date,
                    'Discount Allowed',
                    v_receipt_txn_type,
                    coalesce(v_voucher.reference_id, v_voucher.invoice_id),
                    v_reference_no
                );
            END IF;

            IF v_voucher.party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_voucher.party_id,
                    0,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    p_clear_date::date,
                    coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type,
                    coalesce(v_voucher.reference_id, v_voucher.invoice_id),
                    v_reference_no
                );
            ELSIF v_voucher.account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_voucher.account_id,
                    0,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    p_clear_date::date,
                    coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                    v_receipt_txn_type,
                    coalesce(v_voucher.reference_id, v_voucher.invoice_id),
                    v_reference_no
                );
            ELSE
                RETURN jsonb_build_object('success', false, 'message', 'Cheque receipt is missing party/account metadata');
            END IF;

        ELSIF v_voucher.type = 'payment' THEN
            IF v_voucher.party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_voucher.party_id,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    0,
                    p_clear_date::date,
                    coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                    v_payment_txn_type,
                    v_voucher.reference_id,
                    v_reference_no
                );
            ELSIF v_voucher.account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_voucher.account_id,
                    coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                    0,
                    p_clear_date::date,
                    coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                    v_payment_txn_type,
                    v_voucher.reference_id,
                    v_reference_no
                );
            ELSE
                RETURN jsonb_build_object('success', false, 'message', 'Cheque payment is missing party/account metadata');
            END IF;

            IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_voucher.party_id IS NOT NULL AND v_discount_received_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    v_discount_received_acc_id,
                    0,
                    v_voucher.discount_amount,
                    p_clear_date::date,
                    'Discount Received',
                    v_payment_txn_type,
                    v_voucher.reference_id,
                    v_reference_no
                );
            END IF;

            IF v_voucher.amount > 0 THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    v_voucher.organization_id,
                    v_voucher.id,
                    coalesce(p_bank_account_id, v_voucher.bank_account_id),
                    0,
                    v_voucher.amount,
                    p_clear_date::date,
                    'Payment Mode: cheque',
                    v_payment_txn_type,
                    v_voucher.reference_id,
                    v_reference_no
                );
            END IF;
        END IF;
    END IF;

    UPDATE mandi.vouchers
    SET is_cleared = true,
        cleared_at = p_clear_date,
        cheque_status = 'Cleared',
        bank_account_id = coalesce(p_bank_account_id, bank_account_id)
    WHERE id = p_voucher_id;

    IF v_voucher.invoice_id IS NOT NULL THEN
        SELECT *
        INTO v_balance
        FROM mandi.get_invoice_balance(v_voucher.invoice_id)
        LIMIT 1;

        UPDATE mandi.sales
        SET is_cheque_cleared = true,
            payment_status = CASE
                WHEN coalesce(v_balance.balance_due, 0) <= 0.01 THEN 'paid'
                WHEN coalesce(v_balance.amount_paid, 0) > 0 THEN 'partial'
                ELSE payment_status
            END
        WHERE id = v_voucher.invoice_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cleared successfully');
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.cancel_cheque(
    p_voucher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher mandi.vouchers%ROWTYPE;
BEGIN
    SELECT *
    INTO v_voucher
    FROM mandi.vouchers
    WHERE id = p_voucher_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    IF coalesce(v_voucher.is_cleared, false) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cleared cheque cannot be cancelled');
    END IF;

    UPDATE mandi.vouchers
    SET cheque_status = 'Cancelled',
        is_cleared = false,
        cleared_at = NULL
    WHERE id = p_voucher_id;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.transfer_liquid_funds(
    p_organization_id uuid,
    p_from_account_id uuid,
    p_to_account_id uuid,
    p_amount numeric,
    p_remarks text DEFAULT '',
    p_transfer_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id uuid;
    v_voucher_no bigint;
    v_from_account mandi.accounts%ROWTYPE;
    v_to_account mandi.accounts%ROWTYPE;
BEGIN
    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Source and destination accounts must be different';
    END IF;

    IF coalesce(p_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be greater than zero';
    END IF;

    SELECT *
    INTO v_from_account
    FROM mandi.accounts
    WHERE id = p_from_account_id
      AND organization_id = p_organization_id;

    SELECT *
    INTO v_to_account
    FROM mandi.accounts
    WHERE id = p_to_account_id
      AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer account not found';
    END IF;

    IF coalesce(v_from_account.account_sub_type, '') NOT IN ('cash', 'bank')
       OR coalesce(v_to_account.account_sub_type, '') NOT IN ('cash', 'bank') THEN
        RAISE EXCEPTION 'Transfers are allowed only between cash and bank accounts';
    END IF;

    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id
      AND type = 'journal';

    INSERT INTO mandi.vouchers (
        organization_id,
        date,
        type,
        voucher_no,
        narration,
        amount,
        payment_mode,
        bank_account_id
    ) VALUES (
        p_organization_id,
        p_transfer_date::date,
        'journal',
        v_voucher_no,
        coalesce(nullif(p_remarks, ''), 'Cash/Bank Transfer'),
        p_amount,
        'transfer',
        p_to_account_id
    )
    RETURNING id INTO v_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date,
        description, transaction_type, reference_no
    ) VALUES (
        p_organization_id, v_voucher_id, p_from_account_id, 0, p_amount, p_transfer_date::date,
        coalesce(nullif(p_remarks, ''), 'Cash/Bank Transfer'), 'transfer', v_voucher_no::text
    );

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date,
        description, transaction_type, reference_no
    ) VALUES (
        p_organization_id, v_voucher_id, p_to_account_id, p_amount, 0, p_transfer_date::date,
        coalesce(nullif(p_remarks, ''), 'Cash/Bank Transfer'), 'transfer', v_voucher_no::text
    );

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_no', v_voucher_no
    );
END;
$function$;

DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, uuid, date, uuid, text, date, boolean, numeric);

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
    p_amount_received numeric DEFAULT NULL::numeric,
    p_bank_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id uuid;
    v_receipt_voucher_id uuid;
    v_bill_no bigint;
    v_contact_bill_no bigint;
    v_item jsonb;
    v_account_id uuid;
    v_total_payable numeric;
    v_existing_sale_id uuid;
    v_payment_status text;
    v_receipt_amount numeric;
    v_receipt_voucher_amount numeric;
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
                'contact_bill_no', (SELECT contact_bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
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
        WHEN lower(coalesce(p_payment_mode, '')) = 'partial' AND coalesce(p_amount_received, 0) > 0 THEN 'partial'
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
        v_payment_status, now(), p_idempotency_key, p_due_date,
        p_cheque_no, p_cheque_date, p_cheque_status
    ) RETURNING id, contact_bill_no INTO v_sale_id, v_contact_bill_no;

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

    IF v_payment_status = 'paid' THEN
        v_receipt_amount := v_total_payable;
    ELSIF v_payment_status = 'partial' AND coalesce(p_amount_received, 0) > 0 THEN
        v_receipt_amount := p_amount_received;
    ELSE
        v_receipt_amount := 0;
    END IF;

    v_receipt_voucher_amount := CASE
        WHEN lower(coalesce(p_payment_mode, '')) = 'cheque' THEN GREATEST(coalesce(nullif(p_amount_received, 0), v_total_payable), 0)
        ELSE v_receipt_amount
    END;

    IF v_receipt_voucher_amount > 0 THEN
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

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount,
            cheque_no, cheque_date, is_cleared, cheque_status, invoice_id,
            party_id, payment_mode, bank_account_id, bank_name
        ) VALUES (
            p_organization_id, p_sale_date, 'receipt', v_bill_no,
            'Sale Payment #' || coalesce(v_contact_bill_no, v_bill_no),
            v_receipt_voucher_amount,
            p_cheque_no, p_cheque_date, p_cheque_status,
            CASE WHEN lower(coalesce(p_payment_mode, '')) = 'cheque' THEN CASE WHEN p_cheque_status THEN 'Cleared' ELSE 'Pending' END ELSE NULL END,
            v_sale_id,
            p_buyer_id,
            p_payment_mode,
            p_bank_account_id,
            p_bank_name
        ) RETURNING id INTO v_receipt_voucher_id;

        IF lower(coalesce(p_payment_mode, '')) <> 'cheque' OR p_cheque_status THEN
            IF v_account_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_receipt_amount, p_sale_date,
                    'Sale Payment #' || coalesce(v_contact_bill_no, v_bill_no), 'sale_payment', v_sale_id,
                    coalesce(v_contact_bill_no, v_bill_no)::text
                );

                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date,
                    description, transaction_type, reference_id, reference_no
                ) VALUES (
                    p_organization_id, v_receipt_voucher_id, v_account_id, v_receipt_amount, 0, p_sale_date,
                    'Sale Payment #' || coalesce(v_contact_bill_no, v_bill_no), 'sale_payment', v_sale_id,
                    coalesce(v_contact_bill_no, v_bill_no)::text
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no
    );
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.manage_sales_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_sales_acct_id uuid;
    v_ar_acct_id uuid;
    v_amount numeric;
    v_org_id uuid;
    v_reference_no text;
BEGIN
    v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    v_reference_no := coalesce(COALESCE(NEW.contact_bill_no, OLD.contact_bill_no), COALESCE(NEW.bill_no, OLD.bill_no))::text;

    SELECT id
    INTO v_sales_acct_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
      AND name NOT ILIKE '%Commission%'
    ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
    LIMIT 1;

    SELECT id
    INTO v_ar_acct_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%' OR name ILIKE '%Debtors%')
    ORDER BY (name = 'Buyers Receivable') DESC, name
    LIMIT 1;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM mandi.ledger_entries
        WHERE reference_id = OLD.id
          AND transaction_type = 'sale';

        RETURN OLD;
    END IF;

    v_amount := GREATEST(COALESCE(NEW.total_amount_inc_tax, 0), COALESCE(NEW.total_amount, 0));

    IF TG_OP = 'INSERT' THEN
        IF v_ar_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = NEW.id
                 AND transaction_type = 'sale'
                 AND debit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                NEW.organization_id,
                NEW.buyer_id,
                v_ar_acct_id,
                NEW.id,
                v_reference_no,
                'sale',
                'Invoice #' || v_reference_no,
                NEW.sale_date,
                v_amount,
                0
            );
        END IF;

        IF v_sales_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = NEW.id
                 AND transaction_type = 'sale'
                 AND credit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                NEW.organization_id,
                NULL,
                v_sales_acct_id,
                NEW.id,
                v_reference_no,
                'sale',
                'Sales Revenue - Inv #' || v_reference_no,
                NEW.sale_date,
                0,
                v_amount
            );
        END IF;

        RETURN NEW;
    END IF;

    UPDATE mandi.ledger_entries
    SET organization_id = NEW.organization_id,
        contact_id = NEW.buyer_id,
        account_id = v_ar_acct_id,
        reference_no = v_reference_no,
        description = 'Invoice #' || v_reference_no,
        entry_date = NEW.sale_date,
        debit = v_amount,
        credit = 0
    WHERE reference_id = NEW.id
      AND transaction_type = 'sale'
      AND debit > 0;

    IF NOT FOUND
       AND v_ar_acct_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mandi.ledger_entries
           WHERE reference_id = NEW.id
             AND transaction_type = 'sale'
             AND debit > 0
       ) THEN
        INSERT INTO mandi.ledger_entries (
            organization_id,
            contact_id,
            account_id,
            reference_id,
            reference_no,
            transaction_type,
            description,
            entry_date,
            debit,
            credit
        ) VALUES (
            NEW.organization_id,
            NEW.buyer_id,
            v_ar_acct_id,
            NEW.id,
            v_reference_no,
            'sale',
            'Invoice #' || v_reference_no,
            NEW.sale_date,
            v_amount,
            0
        );
    END IF;

    UPDATE mandi.ledger_entries
    SET organization_id = NEW.organization_id,
        contact_id = NULL,
        account_id = v_sales_acct_id,
        reference_no = v_reference_no,
        description = 'Sales Revenue - Inv #' || v_reference_no,
        entry_date = NEW.sale_date,
        debit = 0,
        credit = v_amount
    WHERE reference_id = NEW.id
      AND transaction_type = 'sale'
      AND credit > 0;

    IF NOT FOUND
       AND v_sales_acct_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mandi.ledger_entries
           WHERE reference_id = NEW.id
             AND transaction_type = 'sale'
             AND credit > 0
       ) THEN
        INSERT INTO mandi.ledger_entries (
            organization_id,
            contact_id,
            account_id,
            reference_id,
            reference_no,
            transaction_type,
            description,
            entry_date,
            debit,
            credit
        ) VALUES (
            NEW.organization_id,
            NULL,
            v_sales_acct_id,
            NEW.id,
            v_reference_no,
            'sale',
            'Sales Revenue - Inv #' || v_reference_no,
            NEW.sale_date,
            0,
            v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;
