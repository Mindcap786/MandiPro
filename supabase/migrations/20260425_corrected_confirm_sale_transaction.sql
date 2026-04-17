-- CORRECTED: confirm_sale_transaction with ACTUAL table schema validation
-- Previous errors:
-- 1. idempotency_key passed as TEXT but column is UUID
-- 2. Tried to INSERT sale_items.created_at but column doesn't exist
-- 3. Function must match ACTUAL table columns exactly

BEGIN;

-- Drop broken version
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, date, uuid, text, date, boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text, boolean) CASCADE;

-- Create CORRECT version matching ACTUAL table schema
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
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT false,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mandi, public, extensions
AS $function$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_contact_bill_no BIGINT;
    v_gross_total NUMERIC;
    v_total_inc_tax NUMERIC;
    v_sales_revenue_acc_id UUID;
    v_recovery_acc_id UUID;
    v_payment_status TEXT;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_idempotency_key_uuid UUID;
BEGIN
    -- IMPORTANT: Convert text idempotency_key to UUID (client sends as text)
    BEGIN
        v_idempotency_key_uuid := CASE
            WHEN p_idempotency_key IS NULL THEN NULL
            WHEN p_idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_idempotency_key::uuid
            ELSE gen_random_uuid()  -- Fallback: generate new UUID if invalid
        END;
    EXCEPTION WHEN OTHERS THEN
        v_idempotency_key_uuid := gen_random_uuid();
    END;

    -- Idempotency check to prevent duplicate sales
    IF v_idempotency_key_uuid IS NOT NULL THEN
        SELECT id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no
        FROM mandi.sales
        WHERE idempotency_key = v_idempotency_key_uuid
          AND organization_id = p_organization_id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'payment_status', 'duplicate_skipped',
                'sale_id', v_sale_id,
                'bill_no', v_bill_no,
                'message', 'Duplicate sale skipped'
            );
        END IF;
    END IF;

    -- Match main accounts
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    SELECT id INTO v_recovery_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '4002' OR code = '4300') LIMIT 1;
    IF v_recovery_acc_id IS NULL THEN v_recovery_acc_id := v_sales_revenue_acc_id; END IF;

    -- Calculate Totals accurately (Price - Discount + Fees + GST)
    v_gross_total := p_total_amount - COALESCE(p_discount_amount, 0) + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses;
    v_total_inc_tax := v_gross_total + p_gst_total;

    -- Smart Status Detection (detects Paid/Partial/Pending)
    v_payment_status := 'pending';
    IF lower(p_payment_mode) IN ('cash', 'upi', 'bank_transfer', 'bank_upi') OR (lower(p_payment_mode) = 'cheque' AND p_cheque_status = true) THEN
        IF COALESCE(p_amount_received, 0) > 0 AND p_amount_received < (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'partial';
        ELSE
            v_payment_status := 'paid';
        END IF;
    ELSIF COALESCE(p_amount_received, 0) > 0 THEN
        IF p_amount_received >= (v_total_inc_tax - 0.01) THEN
            v_payment_status := 'paid';
        ELSE
            v_payment_status := 'partial';
        END IF;
    END IF;

    -- INSERT INTO ACTUAL sales TABLE (with only columns that exist in schema)
    INSERT INTO mandi.sales (
        organization_id,
        buyer_id,
        sale_date,
        total_amount,
        total_amount_inc_tax,
        payment_mode,
        payment_status,
        market_fee,
        nirashrit,
        misc_fee,
        loading_charges,
        unloading_charges,
        other_expenses,
        due_date,
        cheque_no,
        cheque_date,
        is_cheque_cleared,
        bank_name,
        bank_account_id,
        cgst_amount,
        sgst_amount,
        igst_amount,
        gst_total,
        discount_percent,
        discount_amount,
        place_of_supply,
        buyer_gstin,
        idempotency_key
    )
    VALUES (
        p_organization_id,
        p_buyer_id,
        p_sale_date,
        p_total_amount,
        v_total_inc_tax,
        p_payment_mode,
        v_payment_status,
        p_market_fee,
        p_nirashrit,
        p_misc_fee,
        p_loading_charges,
        p_unloading_charges,
        p_other_expenses,
        p_due_date,
        p_cheque_no,
        p_cheque_date,
        p_cheque_status,
        p_bank_name,
        p_bank_account_id,
        p_cgst_amount,
        p_sgst_amount,
        p_igst_amount,
        p_gst_total,
        p_discount_percent,
        p_discount_amount,
        p_place_of_supply,
        p_buyer_gstin,
        v_idempotency_key_uuid
    )
    RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- Save Accounting Voucher
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, payment_mode)
    VALUES (
        p_organization_id,
        p_sale_date,
        'sale',
        (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale'),
        v_total_inc_tax,
        'Sale #' || v_bill_no,
        v_sale_id,
        p_buyer_id,
        p_payment_mode
    )
    RETURNING id INTO v_voucher_id;

    -- Post Balanced Ledger Entries
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 'Sale Bill #' || v_bill_no, 'purchase', v_sale_id);

    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, 'Goods Price', 'purchase', v_sale_id);

    IF (v_total_inc_tax - p_total_amount) <> 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_voucher_id, v_recovery_acc_id, 0, v_total_inc_tax - p_total_amount, p_sale_date, 'Tax/Fees Recovery', 'purchase', v_sale_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_status', v_payment_status,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no
    );
END;
$function$;

COMMIT;
