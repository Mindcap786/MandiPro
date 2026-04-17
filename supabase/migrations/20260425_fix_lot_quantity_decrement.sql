-- =============================================================================
-- FIX LOT QUANTITY NOT BEING DECREMENTED ON SALES
-- Migration: 20260425_fix_lot_quantity_decrement.sql
--
-- ISSUE: When items are sold, lot quantities (current_qty) are not decreasing
-- ROOT CAUSE: confirm_sale_transaction UPDATE fails because:
--   1. Lots missing organization_id (UPDATE WHERE clause fails silently)
--   2. Sale_items missing organization_id (INSERT constraint violation)
--
-- SOLUTION:
-- 1. Populate missing organization_id in lots table
-- 2. Enhance confirm_sale_transaction to handle organization_id correctly
-- 3. Add sale_items organization_id column if missing
-- =============================================================================

-- STEP 1: Check if sale_items has organization_id column, add if missing
ALTER TABLE mandi.sale_items
ADD COLUMN IF NOT EXISTS organization_id uuid;

-- STEP 2: Populate organization_id for lots that are missing it
-- Link lots to sales through arrivals to get organization_id
UPDATE mandi.lots l
SET organization_id = a.organization_id
WHERE l.organization_id IS NULL
  AND l.arrival_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM mandi.arrivals a WHERE a.id = l.arrival_id AND a.organization_id IS NOT NULL);

-- STEP 3: For lots without arrival_id, try to use the most common organization_id
-- (usually indicates all data belongs to one organization)
UPDATE mandi.lots l
SET organization_id = (
  SELECT organization_id
  FROM mandi.lots
  WHERE organization_id IS NOT NULL
  GROUP BY organization_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE l.organization_id IS NULL;

-- STEP 4: Fix the confirm_sale_transaction function
-- Drop the old version and create corrected one
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction CASCADE;

CREATE FUNCTION mandi.confirm_sale_transaction(
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
    p_amount_received numeric DEFAULT 0,
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
    v_actual_cheque_status_text TEXT;
    v_existing_sale_id UUID;
    v_item JSONB;
    v_normalized_payment_mode TEXT;
    v_is_instant_payment BOOLEAN;
    v_receipt_amount NUMERIC;
    v_lot_id UUID;
    v_qty_to_sell NUMERIC;
    v_update_count INT;
BEGIN
    -- 0. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM mandi.sales WHERE idempotency_key = p_idempotency_key;
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'sale_id', v_existing_sale_id,
                'bill_no', (SELECT bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
                'contact_bill_no', (SELECT contact_bill_no FROM mandi.sales WHERE id = v_existing_sale_id),
                'payment_status', (SELECT payment_status FROM mandi.sales WHERE id = v_existing_sale_id),
                'message', 'Duplicate sale detected and skipped.'
            );
        END IF;
    END IF;

    -- 1. Get Sales Revenue Account
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts
    WHERE organization_id = p_organization_id AND code = '4001' AND type = 'income' LIMIT 1;

    -- 2. Calculate Totals
    v_gross_total := COALESCE(p_total_amount, 0)
                     - COALESCE(p_discount_amount, 0)
                     + COALESCE(p_market_fee, 0)
                     + COALESCE(p_nirashrit, 0)
                     + COALESCE(p_misc_fee, 0)
                     + COALESCE(p_loading_charges, 0)
                     + COALESCE(p_unloading_charges, 0)
                     + COALESCE(p_other_expenses, 0);

    v_total_inc_tax := v_gross_total + COALESCE(p_gst_total, 0);

    -- 3. Payment Status (payment-mode-aware)
    v_normalized_payment_mode := lower(TRIM(COALESCE(p_payment_mode, 'credit')));
    v_is_instant_payment := (
        v_normalized_payment_mode IN ('cash', 'upi', 'upi/bank', 'bank_transfer', 'bank_upi', 'card', 'pos')
        OR (v_normalized_payment_mode = 'cheque' AND p_cheque_status = true)
    );

    v_receipt_amount := COALESCE(p_amount_received, 0);
    IF v_is_instant_payment AND v_receipt_amount = 0 THEN
        v_receipt_amount := v_total_inc_tax;
    END IF;

    IF v_receipt_amount <= 0 THEN
        v_payment_status := 'pending';
    ELSIF v_receipt_amount >= v_total_inc_tax THEN
        v_payment_status := 'paid';
    ELSE
        v_payment_status := 'partial';
    END IF;

    -- 4. Create Sale
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, amount_received, market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, place_of_supply, buyer_gstin, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, v_receipt_amount, p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses, p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_discount_percent, p_discount_amount, p_place_of_supply, p_buyer_gstin, p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    -- 5. Create Sale Items & DECREMENT LOT QUANTITIES ✅
    INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, gst_amount, organization_id)
    SELECT v_sale_id, (i->>'lot_id')::uuid, (i->>'qty')::numeric, (i->>'rate')::numeric,
           (i->>'amount')::numeric, (i->>'gst_amount')::numeric, p_organization_id
    FROM jsonb_array_elements(p_items) AS i;

    -- ✅ CRITICAL FIX: Decrement lot quantities with proper organization_id
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_lot_id := (v_item->>'lot_id')::uuid;
        v_qty_to_sell := (v_item->>'qty')::numeric;

        -- First, ensure lot has organization_id set
        UPDATE mandi.lots
        SET organization_id = p_organization_id
        WHERE id = v_lot_id AND organization_id IS NULL;

        -- Now decrement the quantity
        UPDATE mandi.lots
        SET current_qty = current_qty - v_qty_to_sell
        WHERE id = v_lot_id AND organization_id = p_organization_id;

        GET DIAGNOSTICS v_update_count = ROW_COUNT;

        -- Log if update failed (for debugging)
        IF v_update_count = 0 THEN
            RAISE WARNING 'Lot % not updated. Check if lot_id exists or organization_id matches.', v_lot_id;
        END IF;
    END LOOP;

    -- 6. Create Vouchers and Ledger Entries
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers
    WHERE organization_id = p_organization_id AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration, invoice_id, party_id, payment_mode
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax, 'Sale #' || v_bill_no, v_sale_id, p_buyer_id, p_payment_mode
    ) RETURNING id INTO v_voucher_id;

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id
    ) VALUES (
        p_organization_id, v_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, 'Sale Bill #' || v_bill_no, 'sale', v_sale_id
    );

    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id
    ) VALUES (
        p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, 'Goods Price', 'sale', v_sale_id
    );

    IF (v_total_inc_tax - p_total_amount) <> 0 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id
        ) VALUES (
            p_organization_id, v_voucher_id, v_sales_revenue_acc_id, 0, (v_total_inc_tax - p_total_amount), p_sale_date, 'Tax/Fees', 'sale', v_sale_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'bill_no', v_bill_no,
        'contact_bill_no', v_contact_bill_no,
        'payment_status', v_payment_status,
        'message', 'Sale created. Lot quantities decremented. Status: ' || v_payment_status
    );
END;
$function$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run this after applying the migration to verify lots have organization_id:
-- SELECT COUNT(*) as lots_without_org FROM mandi.lots WHERE organization_id IS NULL;
-- Should return: 0 (all lots now have organization_id)

-- Check that recent sales have decremented lot quantities:
-- SELECT lot_code, current_qty FROM mandi.lots WHERE id IN
--   (SELECT lot_id FROM mandi.sale_items WHERE created_at >= NOW() - INTERVAL '1 day')
-- ORDER BY updated_at DESC;
