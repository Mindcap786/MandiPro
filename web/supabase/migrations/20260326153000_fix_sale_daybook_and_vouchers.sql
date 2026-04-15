-- Canonical finance posting fixes for Day Book
-- 1. Prevent duplicate sale ledger entries by letting the mandi.sales trigger own the sale posting.
-- 2. Post buyer receipts tied to sales as explicit `sale_payment` rows.
-- 3. Align create_voucher() with the parameters used by the web UI.
-- 4. Add the missing post_sale_purchase_cost() RPC used after selling commission lots.

DROP FUNCTION IF EXISTS mandi.create_voucher(uuid, date, text, uuid, uuid, numeric, text, text, date, text, uuid);
DROP FUNCTION IF EXISTS mandi.create_voucher(uuid, text, timestamp with time zone, numeric, text, uuid, text, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.create_voucher(uuid, text, timestamp with time zone, numeric, text, uuid, text, numeric, uuid, uuid, uuid);

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
    p_bank_account_id uuid DEFAULT NULL
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
        is_cleared
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
        v_is_cleared
    )
    RETURNING id INTO v_voucher_id;

    IF p_voucher_type = 'receipt' THEN
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, 'receipt', v_voucher_id, v_voucher_no::text,
                v_contra_account_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), p_amount, 0, v_voucher_id
            );
        END IF;

        IF p_discount > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, 'receipt', v_voucher_id, v_voucher_no::text,
                v_discount_allowed_acc_id, 'Discount Allowed', p_discount, 0, v_voucher_id
            );
        END IF;

        IF p_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, 'receipt', v_voucher_id, v_voucher_no::text,
                p_party_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSIF p_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, 'receipt', v_voucher_id, v_voucher_no::text,
                p_account_id, coalesce(nullif(p_remarks, ''), 'Receipt Received'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSE
            RAISE EXCEPTION 'Receipt voucher requires either party_id or account_id';
        END IF;

    ELSIF p_voucher_type = 'payment' THEN
        v_effective_txn_type := CASE
            WHEN p_account_id IS NOT NULL AND p_party_id IS NULL THEN 'expense'
            ELSE 'payment'
        END;

        IF p_party_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, v_voucher_id, v_voucher_no::text,
                p_party_id, p_employee_id, coalesce(nullif(p_remarks, ''), 'Receipt Paid'), (p_amount + p_discount), 0, v_voucher_id
            );
        ELSIF p_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, v_voucher_id, v_voucher_no::text,
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
                p_organization_id, p_date::date, 'payment', v_voucher_id, v_voucher_no::text,
                v_discount_received_acc_id, 'Discount Received', p_discount, 0, v_voucher_id
            );
        END IF;

        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date::date, v_effective_txn_type, v_voucher_id, v_voucher_no::text,
                v_contra_account_id, 'Payment Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported voucher type %', p_voucher_type;
    END IF;

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;

DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, date, uuid, text, date, boolean);
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, text);
DROP FUNCTION IF EXISTS public.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, text, date, uuid, text, date, boolean);
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, text);

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
    v_sale_id uuid;
    v_receipt_voucher_id uuid;
    v_bill_no bigint;
    v_item jsonb;
    v_account_id uuid;
    v_total_payable numeric;
    v_existing_sale_id uuid;
    v_payment_status text;
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

    -- The mandi.sales trigger now owns the sale ledger posting.
    -- We only create a separate receipt voucher when the sale is settled immediately.
    IF v_payment_status = 'paid' THEN
        IF p_bank_account_id IS NOT NULL THEN
            v_account_id := p_bank_account_id;
        ELSIF p_payment_mode = 'cash' THEN
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
                cheque_no, cheque_date, is_cleared
            ) VALUES (
                p_organization_id, p_sale_date, 'receipt', v_bill_no, 'Sale Payment #' || v_bill_no, v_total_payable,
                p_cheque_no, p_cheque_date, p_cheque_status
            ) RETURNING id INTO v_receipt_voucher_id;

            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit, entry_date,
                description, transaction_type, reference_no
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_total_payable, p_sale_date,
                'Sale Payment #' || v_bill_no, 'sale_payment', v_bill_no::text
            );

            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit, entry_date,
                description, transaction_type, reference_no
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, v_account_id, v_total_payable, 0, p_sale_date,
                'Sale Payment #' || v_bill_no, 'sale_payment', v_bill_no::text
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.post_sale_purchase_cost(
    p_arrival_id uuid,
    p_sale_date date,
    p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival record;
    v_lot record;
    v_adv record;
    v_purchase_acc_id uuid;
    v_expense_recovery_acc_id uuid;
    v_cash_acc_id uuid;
    v_cheque_issued_acc_id uuid;
    v_commission_income_acc_id uuid;
    v_main_voucher_id uuid;
    v_voucher_no bigint;
    v_org_id uuid;
    v_total_gross numeric := 0;
    v_total_commission numeric := 0;
    v_total_recoveries numeric := 0;
    v_net_payable numeric := 0;
    v_sales_sum numeric := 0;
BEGIN
    SELECT *
    INTO v_arrival
    FROM mandi.arrivals
    WHERE id = p_arrival_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Arrival % not found', p_arrival_id;
    END IF;

    v_org_id := COALESCE(v_arrival.organization_id, p_organization_id);

    IF v_arrival.arrival_type NOT IN ('commission', 'commission_supplier') THEN
        RETURN jsonb_build_object(
            'success', true,
            'arrival_id', p_arrival_id,
            'skipped', true,
            'reason', 'not_commission_arrival'
        );
    END IF;

    WITH deleted AS (
        DELETE FROM mandi.ledger_entries
        WHERE reference_id = p_arrival_id
          AND transaction_type IN ('purchase', 'payment', 'payable', 'income', 'expense', 'commission')
          AND entry_date::date = p_sale_date
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (
        SELECT DISTINCT voucher_id
        FROM deleted
        WHERE voucher_id IS NOT NULL
    );

    SELECT id
    INTO v_purchase_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND type = 'expense'
      AND (code = '5001' OR name ILIKE '%Purchase%')
    ORDER BY (code = '5001') DESC, created_at
    LIMIT 1;

    SELECT id
    INTO v_expense_recovery_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND type = 'income'
      AND (code = '4002' OR name ILIKE '%Expense Recovery%')
    ORDER BY (code = '4002') DESC, created_at
    LIMIT 1;

    SELECT id
    INTO v_cash_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND type = 'asset'
      AND (code = '1001' OR account_sub_type = 'cash' OR name ILIKE 'Cash%')
    ORDER BY (code = '1001') DESC, created_at
    LIMIT 1;

    SELECT id
    INTO v_cheque_issued_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND type = 'liability'
      AND (code = '2005' OR name ILIKE '%Cheques Issued%')
    ORDER BY (code = '2005') DESC, created_at
    LIMIT 1;

    SELECT id
    INTO v_commission_income_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND type = 'income'
      AND (code = '4001' OR name ILIKE '%Commission Income%')
    ORDER BY (code = '4001') DESC, created_at
    LIMIT 1;

    IF v_purchase_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
        VALUES (v_org_id, 'Purchase Account', 'expense', '5001', true)
        RETURNING id INTO v_purchase_acc_id;
    END IF;

    IF v_expense_recovery_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
        VALUES (v_org_id, 'Expense Recovery', 'income', '4002', true)
        RETURNING id INTO v_expense_recovery_acc_id;
    END IF;

    IF v_cash_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
        VALUES (v_org_id, 'Cash Account', 'asset', '1001', true)
        RETURNING id INTO v_cash_acc_id;
    END IF;

    IF v_cheque_issued_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
        VALUES (v_org_id, 'Cheques Issued', 'liability', '2005', true)
        RETURNING id INTO v_cheque_issued_acc_id;
    END IF;

    IF v_commission_income_acc_id IS NULL THEN
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
        VALUES (v_org_id, 'Commission Income', 'income', '4001', true)
        RETURNING id INTO v_commission_income_acc_id;
    END IF;

    FOR v_lot IN
        SELECT *
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id
    LOOP
        SELECT COALESCE(SUM(si.amount), 0)
        INTO v_sales_sum
        FROM mandi.sale_items si
        JOIN mandi.sales s ON s.id = si.sale_id
        WHERE si.lot_id = v_lot.id
          AND s.organization_id = v_org_id
          AND s.sale_date = p_sale_date;

        IF v_sales_sum <= 0 THEN
            CONTINUE;
        END IF;

        v_total_gross := v_total_gross + v_sales_sum;
        v_total_commission := v_total_commission + (v_sales_sum * COALESCE(v_lot.commission_percent, 0) / 100.0);
        v_total_recoveries := v_total_recoveries
            + COALESCE(v_lot.farmer_charges, 0)
            + COALESCE(v_lot.packing_cost, 0)
            + COALESCE(v_lot.loading_cost, 0);
    END LOOP;

    IF v_total_gross <= 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'arrival_id', p_arrival_id,
            'skipped', true,
            'reason', 'no_sales_for_date'
        );
    END IF;

    v_total_recoveries := v_total_recoveries
        + COALESCE(v_arrival.hire_charges, 0)
        + COALESCE(v_arrival.hamali_expenses, 0)
        + COALESCE(v_arrival.other_expenses, 0);

    v_net_payable := GREATEST(v_total_gross - v_total_commission - v_total_recoveries, 0);

    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = v_org_id
      AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount
    ) VALUES (
        v_org_id, p_sale_date, 'purchase', v_voucher_no,
        'Purchase Bill - Sale Settlement - ' || COALESCE(v_arrival.reference_no, 'Arrival'),
        v_total_gross
    ) RETURNING id INTO v_main_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date,
        description, transaction_type, reference_id
    ) VALUES (
        v_org_id, v_main_voucher_id, v_purchase_acc_id, v_total_gross, 0, p_sale_date,
        'Purchase Cost (Commission Settlement)', 'purchase', p_arrival_id
    );

    IF v_net_payable > 0 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit, entry_date,
            description, transaction_type, reference_id
        ) VALUES (
            v_org_id, v_main_voucher_id, v_arrival.party_id, 0, v_net_payable, p_sale_date,
            'Supplier Payable (Net Settlement)', 'purchase', p_arrival_id
        );
    END IF;

    IF v_total_commission > 0 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date,
            description, transaction_type, reference_id
        ) VALUES (
            v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, p_sale_date,
            'Commission Deducted on Purchase Bill', 'purchase', p_arrival_id
        );
    END IF;

    IF v_total_recoveries > 0 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date,
            description, transaction_type, reference_id
        ) VALUES (
            v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_recoveries, p_sale_date,
            'Charges Deducted on Purchase Bill', 'purchase', p_arrival_id
        );
    END IF;

    IF p_sale_date = v_arrival.arrival_date THEN
        FOR v_adv IN
            SELECT
                COALESCE(advance_payment_mode, 'cash') AS mode,
                SUM(advance) AS total_adv
            FROM mandi.lots
            WHERE arrival_id = p_arrival_id
              AND advance > 0
            GROUP BY 1
        LOOP
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit, entry_date,
                description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_arrival.party_id, v_adv.total_adv, 0, p_sale_date,
                'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id
            );

            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit, entry_date,
                description, transaction_type, reference_id
            ) VALUES (
                v_org_id,
                v_main_voucher_id,
                CASE WHEN lower(v_adv.mode) = 'cheque' THEN v_cheque_issued_acc_id ELSE v_cash_acc_id END,
                0,
                v_adv.total_adv,
                p_sale_date,
                'Advance Contra (' || v_adv.mode || ')',
                'purchase',
                p_arrival_id
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'arrival_id', p_arrival_id,
        'sale_date', p_sale_date,
        'gross_amount', v_total_gross,
        'commission_amount', v_total_commission,
        'recovery_amount', v_total_recoveries,
        'net_payable', v_net_payable
    );
END;
$function$;
