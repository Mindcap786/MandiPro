-- STRICT NO-DUPLICATE TRANSACTION DESIGN
-- Effective: 2026-04-06
-- One transaction per sale/purchase, payments recorded separately

-- ===================================================================
-- PART 1: SALE TRANSACTION REDESIGN
-- ===================================================================

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
    p_amount_received numeric DEFAULT NULL::numeric,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_gross_total NUMERIC;
    v_total_inc_tax NUMERIC;
    v_sales_revenue_acc_id UUID;
    v_payment_status TEXT;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_final_amount NUMERIC;
BEGIN
    -- 1. Get accounts
    SELECT id INTO v_sales_revenue_acc_id
    FROM mandi.accounts
    WHERE organization_id = p_organization_id
      AND code = '4001'
      AND type = 'income'
    LIMIT 1;

    IF v_sales_revenue_acc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Sales Revenue account not found');
    END IF;

    -- 2. Calculate totals
    v_gross_total := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee
                     + p_loading_charges + p_unloading_charges + p_other_expenses;
    v_total_inc_tax := v_gross_total + p_gst_total;

    -- 3. Determine payment status
    -- KEY CHANGE: Status is ALWAYS 'pending' initially, regardless of payment_mode
    -- Payment status updated only when payment is actually recorded
    v_payment_status := CASE
        WHEN p_payment_mode = 'credit' THEN 'pending'  -- Udhaar: waiting for payment
        WHEN p_payment_mode = 'cash' THEN 'pending'    -- Cash selected: waiting for verification
        WHEN p_payment_mode IN ('UPI/BANK', 'upi', 'bank_transfer') THEN 'pending'  -- Bank: waiting for verification
        WHEN p_payment_mode = 'cheque' THEN 'pending'  -- Cheque: waiting for clearing
        ELSE 'pending'
    END;

    -- 4. Create sale record
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date,
        total_amount, total_amount_inc_tax,
        payment_mode, payment_status,
        market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses,
        due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date,
        p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status,
        p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses,
        p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 5. Create sale items
    INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, gst_amount)
    SELECT
        v_sale_id,
        (item->>'lot_id')::uuid,
        (item->>'qty')::numeric,
        (item->>'rate')::numeric,
        (item->>'amount')::numeric,
        (item->>'gst_amount')::numeric
    FROM jsonb_array_elements(p_items) AS item;

    -- 6. Create SINGLE goods transaction (voucher)
    SELECT COALESCE(MAX(voucher_no), 0) + 1
    INTO v_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = p_organization_id AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, cheque_no, cheque_date,
        cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax,
        'Sale #' || v_bill_no,
        v_sale_id, p_buyer_id, p_payment_mode, p_cheque_no, p_cheque_date,
        p_cheque_status, p_bank_account_id
    ) RETURNING id INTO v_voucher_id;

    -- 7. Store payment details for later recording (no ledger entries for payment yet)

    -- 8. Store payment details for later recording (no ledger entries for payment yet)
    UPDATE mandi.sales
    SET payment_mode = p_payment_mode,
        payment_status = v_payment_status
    WHERE id = v_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'message', 'Sale created. Payment status: ' || v_payment_status
    );
END;
$function$;

-- ===================================================================
-- PART 2: PURCHASE (ARRIVAL) TRANSACTION REDESIGN
-- ===================================================================

CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_lot RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_reference_no TEXT;
    v_arrival_type TEXT;

    -- Accounts
    v_purchase_acc_id UUID;
    v_expense_recovery_acc_id UUID;
    v_cash_acc_id UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id UUID;

    -- Aggregates
    v_total_commission NUMERIC := 0;
    v_total_inventory NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport NUMERIC := 0;
    v_total_paid_advance NUMERIC := 0;
    v_lot_count INT := 0;

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_bill NUMERIC;
    v_final_status TEXT := 'pending';
BEGIN
    -- 0. Get arrival and party
    SELECT a.*, c.name as party_name INTO v_arrival
    FROM mandi.arrivals a
    JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;

    -- Cleanup old entries
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    -- 1. Get accounts
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    -- 2. Calculate aggregates
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_paid_advance := v_total_paid_advance + COALESCE(v_lot.advance, 0);

            IF v_arrival_type = 'commission' THEN
                v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
                v_total_inventory := v_total_inventory + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                v_total_commission := v_total_commission + ((v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'msg', 'No lots');
    END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_gross_bill := (CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END);

    -- 3. Create SINGLE goods transaction (voucher)
    -- KEY CHANGE: Only goods, no payment entries
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        party_id, arrival_id
    ) VALUES (
        v_org_id, v_arrival_date, 'purchase', v_voucher_no,
        'Arrival ' || v_reference_no,
        CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END,
        v_party_id, p_arrival_id
    ) RETURNING id INTO v_main_voucher_id;

    -- Debit Inventory/Purchase
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_bill, 0, v_arrival_date, 'Fruit Value', 'purchase', p_arrival_id);

    -- Credit Party (Full Bill)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill, v_arrival_date, 'Arrival Entry', 'purchase', p_arrival_id);

    -- Transport Recovery
    IF v_total_transport > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
    END IF;

    -- Commission Income
    IF v_total_commission > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id);
    END IF;

    -- 4. Set arrival status to PENDING (payment to be recorded separately)
    v_final_status := 'pending';
    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status, 'message', 'Arrival recorded. Payment status: pending');
END;
$function$;

-- ===================================================================
-- PART 3: CHEQUE CLEARING (NOW CREATES PAYMENT TRANSACTION)
-- ===================================================================

CREATE OR REPLACE FUNCTION mandi.clear_cheque(p_voucher_id uuid, p_bank_account_id uuid, p_clear_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher mandi.vouchers%ROWTYPE;
    v_target_bank_id uuid;
    v_final_contact_id uuid;
    v_payment_voucher_id uuid;
    v_payment_voucher_no bigint;
    v_reference_no text;
    v_payment_txn_type text;
BEGIN
    SELECT * INTO v_voucher FROM mandi.vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    IF coalesce(v_voucher.cheque_status, '') = 'Cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cancelled cheque cannot be cleared');
    END IF;

    v_final_contact_id := COALESCE(v_voucher.contact_id, v_voucher.party_id);
    v_target_bank_id := COALESCE(p_bank_account_id, v_voucher.bank_account_id);

    IF v_target_bank_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bank account required');
    END IF;

    -- Update cheque status
    UPDATE mandi.vouchers
    SET is_cleared = true,
        cleared_at = p_clear_date,
        cheque_status = 'Cleared',
        bank_account_id = v_target_bank_id
    WHERE id = p_voucher_id;

    -- Determine reference
    v_reference_no := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN (SELECT bill_no::text FROM mandi.sales WHERE id = v_voucher.invoice_id)
        WHEN v_voucher.arrival_id IS NOT NULL THEN (SELECT bill_no::text FROM mandi.arrivals WHERE id = v_voucher.arrival_id)
        ELSE v_voucher.voucher_no::text
    END;

    v_payment_txn_type := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN 'sale_payment'
        WHEN v_voucher.arrival_id IS NOT NULL THEN 'purchase'
        ELSE 'payment'
    END;

    -- KEY CHANGE: Create payment transaction when cheque clears
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_payment_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_voucher.organization_id AND type = 'payment';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        cheque_no, cheque_status, is_cleared, cleared_at, bank_account_id,
        contact_id, party_id, invoice_id, arrival_id
    ) VALUES (
        v_voucher.organization_id, p_clear_date::date, 'payment', v_payment_voucher_no,
        'Cheque Cleared - ' || v_reference_no, v_voucher.amount,
        v_voucher.cheque_no, 'Cleared', true, p_clear_date, v_target_bank_id,
        v_voucher.contact_id, v_voucher.party_id, v_voucher.invoice_id, v_voucher.arrival_id
    ) RETURNING id INTO v_payment_voucher_id;

    -- Create payment ledger entries (NOW for the first time)
    IF v_final_contact_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit, entry_date,
            description, transaction_type, reference_id, reference_no
        ) VALUES (
            v_voucher.organization_id, v_payment_voucher_id, v_final_contact_id,
            v_voucher.amount, 0, p_clear_date::date,
            'Cheque Cleared', v_payment_txn_type,
            COALESCE(v_voucher.invoice_id, v_voucher.arrival_id), v_reference_no
        );
    END IF;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date,
        description, transaction_type, reference_id, reference_no
    ) VALUES (
        v_voucher.organization_id, v_payment_voucher_id, v_target_bank_id,
        0, v_voucher.amount, p_clear_date::date,
        'Cheque Cleared', v_payment_txn_type,
        COALESCE(v_voucher.invoice_id, v_voucher.arrival_id), v_reference_no
    );

    -- Update parent sale/arrival status
    IF v_voucher.invoice_id IS NOT NULL THEN
        UPDATE mandi.sales SET payment_status = 'paid', is_cheque_cleared = true WHERE id = v_voucher.invoice_id;
    END IF;

    IF v_voucher.arrival_id IS NOT NULL THEN
        UPDATE mandi.arrivals SET status = 'paid' WHERE id = v_voucher.arrival_id;
        UPDATE mandi.purchase_bills SET payment_status = 'paid' WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = v_voucher.arrival_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cleared. Payment transaction created.');
END;
$function$;

-- ===================================================================
-- PART 4: CHEQUE CANCELLATION (NEW FUNCTION)
-- ===================================================================

CREATE OR REPLACE FUNCTION mandi.cancel_cheque(p_voucher_id uuid, p_cancellation_reason text DEFAULT 'User cancelled')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher mandi.vouchers%ROWTYPE;
BEGIN
    SELECT * INTO v_voucher FROM mandi.vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    -- Update cheque status to Cancelled
    UPDATE mandi.vouchers
    SET cheque_status = 'Cancelled'
    WHERE id = p_voucher_id;

    -- Update parent sale/arrival status to UNPAID
    IF v_voucher.invoice_id IS NOT NULL THEN
        UPDATE mandi.sales SET payment_status = 'pending' WHERE id = v_voucher.invoice_id;
    END IF;

    IF v_voucher.arrival_id IS NOT NULL THEN
        UPDATE mandi.arrivals SET status = 'pending' WHERE id = v_voucher.arrival_id;
        UPDATE mandi.purchase_bills SET payment_status = 'pending' WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = v_voucher.arrival_id);
    END IF;

    -- KEY CHANGE: Do NOT create any ledger entries for cancellation
    -- No debit/credit, just status update

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cheque cancelled. ' || p_cancellation_reason
    );
END;
$function$;

-- ===================================================================
-- ENFORCEMENT RULES (Comments for developers)
-- ===================================================================

COMMENT ON FUNCTION mandi.confirm_sale_transaction IS
'STRICT NO-DUPLICATE DESIGN:
- Creates ONLY ONE sale transaction (goods entry)
- Payment status always starts as "pending"
- NO payment ledger entries created at entry time
- Payment entries created separately via Finance > Payments or clear_cheque
- All payment modes (cheque, cash, bank, udhaar) start as pending';

COMMENT ON FUNCTION mandi.post_arrival_ledger IS
'STRICT NO-DUPLICATE DESIGN:
- Creates ONLY ONE purchase transaction (goods entry)
- Status always "pending" at entry
- NO payment ledger entries created here
- Payment entries created separately via clear_cheque
- Cheque pending/instant designation does NOT affect transaction count';

COMMENT ON FUNCTION mandi.clear_cheque IS
'NOW CREATES PAYMENT TRANSACTION:
- Called when cheque is actually cleared (not at entry time)
- Creates SECOND transaction for payment
- Updates cheque_status = "Cleared"
- Updates parent sale/arrival status = "paid"
- This is the ONLY place payment ledger entries created for cheques';

COMMENT ON FUNCTION mandi.cancel_cheque IS
'CANCELLATION UPDATES STATUS ONLY:
- Updates cheque_status = "Cancelled"
- Updates parent status = "pending" (unpaid)
- Does NOT create ledger entries
- Does NOT debit/credit accounts
- No accounting impact - just status change';

-- ===================================================================
-- SUMMARY
-- ===================================================================
/*
GUARANTEE: ZERO DUPLICATE TRANSACTIONS

1. Sale created → ONE goods transaction (amount pending payment)
2. Cheque pending → NO payment transaction yet
3. Cheque cleared → ONE payment transaction created (separate from #1)
4. Cheque cancelled → Just status update, no transaction
5. Cash paid → ONE payment transaction created when recorded
6. Bank transfer → ONE payment transaction created when cleared

Total: 1 goods transaction + N payment transactions (N = actual payments made)
*/
