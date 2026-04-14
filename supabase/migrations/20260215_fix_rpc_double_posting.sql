-- Fix Double Posting in Sale Transaction RPC
-- The 'confirm_sale_transaction' RPC was creating manual ledger entries for the sale,
-- duplicating the work already done by the 'trg_sync_sales_ledger' trigger on the sales table.
-- This update removes the redundant manual posting, relying solely on the trigger.

CREATE OR REPLACE FUNCTION public.confirm_sale_transaction(
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
    p_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id UUID;
    v_receipt_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_account_id UUID; -- Cash or Bank Account ID
    v_total_payable NUMERIC;
    v_existing_sale_id UUID;
    v_payment_status TEXT;
    v_sale_item_id UUID;
BEGIN
    -- 0. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM sales WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_sale_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM sales WHERE id = v_existing_sale_id), 'message', 'Duplicate skipped');
        END IF;
    END IF;

    -- Standard Validation
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    -- Determine Payment Status
    -- UPI, Bank Transfer, Cash, UPI/BANK -> PAID
    -- Credit -> PENDING
    v_payment_status := CASE 
        WHEN p_payment_mode IN ('cash', 'upi', 'bank_transfer', 'UPI/BANK', 'bank_upi') THEN 'paid' 
        ELSE 'pending' 
    END;

    -- 1. Get Next Bill No (Atomic)
    -- Locking to prevent race conditions on bill_no
    -- (Optional: advisory lock or rely on serial, but here using max+1 pattern)
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no
    FROM sales 
    WHERE organization_id = p_organization_id;

    -- 2. Insert Sale Record
    -- THIS PROCEEDS TO FIRE 'trg_sync_sales_ledger' WHICH CREATES THE ACCOUNTS RECEIVABLE LEDGER ENTRY
    INSERT INTO sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no, 
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        payment_status, created_at, idempotency_key
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no, 
        p_market_fee, p_nirashrit, p_misc_fee, p_loading_charges, p_unloading_charges, p_other_expenses,
        v_payment_status, NOW(), p_idempotency_key
    ) RETURNING id INTO v_sale_id;

    -- 3. Process Items (Stock Deduction)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- Insert Sale Item
        INSERT INTO sale_items (
            organization_id, sale_id, lot_id, qty, rate, amount, unit
        ) VALUES (
            p_organization_id, v_sale_id, (v_item->>'lot_id')::UUID, (v_item->>'qty')::NUMERIC, (v_item->>'rate')::NUMERIC, (v_item->>'amount')::NUMERIC, v_item->>'unit'
        ) RETURNING id INTO v_sale_item_id;

        -- ACID Stock Deduction
        UPDATE lots
        SET current_qty = current_qty - (v_item->>'qty')::NUMERIC
        WHERE id = (v_item->>'lot_id')::UUID;
        
        -- Check for negative stock
        IF EXISTS (SELECT 1 FROM lots WHERE id = (v_item->>'lot_id')::UUID AND current_qty < 0) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot ID %. Transaction Aborted.', (v_item->>'lot_id');
        END IF;
    END LOOP;

    -- 4. Financial Post-Processing
    -- Calculate Total Payable for Receipt
    v_total_payable := p_total_amount + p_market_fee + p_nirashrit + p_misc_fee + p_loading_charges + p_unloading_charges + p_other_expenses;

    -- [REMOVED] Manual Sales Voucher Creation & Ledger Posting
    -- Reason: The 'sales' table trigger already handles the Debit Buyer / Credit Sales entry.
    -- Creating it here again causes double counting.

    -- B. Handle Immediate Payments (Receipt)
    -- If paid immediately, we create a RECEIPT voucher to credit the buyer back.
    IF v_payment_status = 'paid' THEN
        -- Identify Receiving Account
        IF p_payment_mode = 'cash' THEN
            SELECT id INTO v_account_id FROM accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
        ELSE
            -- Matches 'upi', 'bank_transfer', 'UPI/BANK' -> Bank Code 1002
            SELECT id INTO v_account_id FROM accounts WHERE organization_id = p_organization_id AND code = '1002' LIMIT 1;
        END IF;

        -- Fallback
        IF v_account_id IS NULL THEN
             -- Try generic names if codes fail
             IF p_payment_mode = 'cash' THEN
                SELECT id INTO v_account_id FROM accounts WHERE organization_id = p_organization_id AND name ILIKE 'Cash%' LIMIT 1;
             ELSE
                SELECT id INTO v_account_id FROM accounts WHERE organization_id = p_organization_id AND (name ILIKE 'Bank%' OR name ILIKE 'HDFC%') LIMIT 1;
             END IF;
        END IF;

        IF v_account_id IS NOT NULL THEN
            -- Create Receipt Voucher
            INSERT INTO vouchers (
                organization_id, date, type, voucher_no, narration, amount
            ) VALUES (
                p_organization_id, p_sale_date, 'receipt', v_bill_no, 'Payment Received via ' || UPPER(p_payment_mode) || ' for Invoice #' || v_bill_no, v_total_payable
            ) RETURNING id INTO v_receipt_voucher_id;

            -- Entry 3: Credit Buyer (Payment reduces AR)
            INSERT INTO ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit, entry_date, description
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, p_buyer_id, 0, v_total_payable, p_sale_date, 'Payment Received - Inv #' || v_bill_no
            );

            -- Entry 4: Debit Asset (Cash/Bank increases)
            INSERT INTO ledger_entries (
                organization_id, voucher_id, account_id, debit, credit, entry_date, description
            ) VALUES (
                p_organization_id, v_receipt_voucher_id, v_account_id, v_total_payable, 0, p_sale_date, 'Payment Received - Inv #' || v_bill_no
            );
        END IF;

    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$function$;
