-- ============================================================
-- UNIFY SALE VOUCHER LOGIC
-- Migration: 20260421120000_unify_sale_voucher.sql
-- Goal: Put the instant receipt ledger entries DIRECTLY inside the 
-- main 'sale' voucher, ensuring perfectly atomic Day Book grouping
-- without relying on complex cross-voucher ID matching.
-- ============================================================

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
AS $$
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
BEGIN
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' AND type = 'income' LIMIT 1;
    IF v_sales_revenue_acc_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Sales Revenue account not found'); END IF;

    v_gross_total := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses;
    v_total_inc_tax := v_gross_total + p_gst_total;
    v_payment_status := 'pending';

    v_actual_cheque_status_text := CASE 
        WHEN p_payment_mode = 'cheque' AND p_cheque_status = true THEN 'Cleared'
        WHEN p_payment_mode = 'cheque' THEN 'Pending'
        ELSE NULL 
    END;

    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses, due_date,
        cheque_no, cheque_date, bank_name, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses, p_due_date,
        p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total, p_idempotency_key
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount, gst_amount)
    SELECT v_sale_id, (item->>'lot_id')::uuid, (item->>'qty')::numeric, (item->>'rate')::numeric, (item->>'amount')::numeric, (item->>'gst_amount')::numeric FROM jsonb_array_elements(p_items) AS item;

    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration,
        invoice_id, party_id, payment_mode, cheque_no, cheque_date,
        cheque_status, bank_account_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', v_voucher_no, v_total_inc_tax,
        'Sale #' || v_bill_no, v_sale_id, p_buyer_id, p_payment_mode, p_cheque_no, p_cheque_date,
        v_actual_cheque_status_text, p_bank_account_id
    ) RETURNING id INTO v_voucher_id;

    -- Note: The triggers on sale_items might already be creating the core Sale Ledger Entries (Dr Buyer, Cr Sales) via log_sale_item_ledger_tx.
    -- Wait, does it? Let me ensure Instant Payments are logged on the SAME voucher ID: v_voucher_id!
    
    IF p_payment_mode IN ('cash', 'upi', 'UPI/BANK', 'bank_transfer') OR (p_payment_mode = 'cheque' AND p_cheque_status = true) THEN
        v_payment_status := 'paid';
        
        DECLARE
            v_cash_bank_acc_id UUID;
        BEGIN
            IF p_payment_mode = 'cash' THEN
                SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
            ELSE
                v_cash_bank_acc_id := p_bank_account_id;
            END IF;

            IF v_cash_bank_acc_id IS NULL THEN
                SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
            END IF;

            IF v_cash_bank_acc_id IS NOT NULL THEN
                -- Credit Buyer (Decrease Receivables)
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id
                ) VALUES (
                    p_organization_id, v_voucher_id, p_buyer_id, 0, v_total_inc_tax, p_sale_date,
                    'Instant Payment Received', 'receipt', v_bill_no::text, v_sale_id
                );

                -- Debit Bank/Cash (Asset decrease -> WAIT, ASSET INCREASE is DEBIT!)
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_no, reference_id
                ) VALUES (
                    p_organization_id, v_voucher_id, v_cash_bank_acc_id, v_total_inc_tax, 0, p_sale_date,
                    'Payment Deposit', 'receipt', v_bill_no::text, v_sale_id
                );
            END IF;
        END;
    END IF;

    UPDATE mandi.sales SET payment_status = v_payment_status, is_cheque_cleared = CASE WHEN p_payment_mode = 'cheque' THEN p_cheque_status ELSE false END WHERE id = v_sale_id;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status);
END;
$$;
