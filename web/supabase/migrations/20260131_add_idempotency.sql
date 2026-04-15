-- Migration: Add Idempotency to Sales
-- Date: 2026-01-31
-- Author: Antigravity

-- 1. Add Idempotency Column to Sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- 2. Update the Transaction Function to support Idempotency
CREATE OR REPLACE FUNCTION confirm_sale_transaction(
    p_organization_id UUID,
    p_buyer_id UUID,
    p_sale_date DATE,
    p_payment_mode TEXT,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_market_fee NUMERIC DEFAULT 0,
    p_nirashrit NUMERIC DEFAULT 0,
    p_idempotency_key UUID DEFAULT NULL -- NEW PARAMETER
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_voucher_id UUID;
    v_bill_no BIGINT;
    v_item JSONB;
    v_sales_account_id UUID;
    v_total_payable NUMERIC;
    v_existing_sale_id UUID;
BEGIN
    -- 0. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_sale_id FROM sales WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_sale_id IS NOT NULL THEN
            -- Already processed! Return success with existing ID to verify sync.
            -- This is critical for Offline Sync Logic to receive a "Success" and stop retrying.
            RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale_id, 'bill_no', (SELECT bill_no FROM sales WHERE id = v_existing_sale_id), 'message', 'Duplicate skipped');
        END IF;
    END IF;

    -- Standard Validation
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'No items in sale';
    END IF;

    -- 1. Get Next Bill No (Simple Max + 1 strategy)
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no
    FROM sales 
    WHERE organization_id = p_organization_id;

    -- 2. Insert Sale Record
    INSERT INTO sales (
        organization_id,
        buyer_id,
        sale_date,
        payment_mode,
        total_amount,
        bill_no,
        market_fee,
        nirashrit,
        payment_status,
        created_at,
        idempotency_key -- Store the key
    ) VALUES (
        p_organization_id,
        p_buyer_id,
        p_sale_date,
        p_payment_mode,
        p_total_amount,
        v_bill_no,
        p_market_fee,
        p_nirashrit,
        CASE WHEN p_payment_mode = 'cash' THEN 'paid' ELSE 'pending' END,
        NOW(),
        p_idempotency_key
    ) RETURNING id INTO v_sale_id;

    -- 3. Process Items (Stock Deduction)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- Insert Sale Item
        INSERT INTO sale_items (
            organization_id, -- Linked to Org
            sale_id,
            lot_id,
            qty,
            rate,
            amount,
            unit
        ) VALUES (
            p_organization_id,
            v_sale_id,
            (v_item->>'lot_id')::UUID,
            (v_item->>'qty')::NUMERIC,
            (v_item->>'rate')::NUMERIC,
            (v_item->>'amount')::NUMERIC,
            v_item->>'unit'
        );

        -- ACID Stock Deduction
        UPDATE lots
        SET current_qty = current_qty - (v_item->>'qty')::NUMERIC
        WHERE id = (v_item->>'lot_id')::UUID;
        
        -- Check for negative stock
        IF EXISTS (SELECT 1 FROM lots WHERE id = (v_item->>'lot_id')::UUID AND current_qty < 0) THEN
            RAISE EXCEPTION 'Insufficient stock for Lot ID %', (v_item->>'lot_id');
        END IF;
    END LOOP;

    -- 4. Financial Ledger Posting
    v_total_payable := p_total_amount + p_market_fee + p_nirashrit;

    -- Create Voucher
    INSERT INTO vouchers (
        organization_id, date, type, voucher_no, narration
    ) VALUES (
        p_organization_id, p_sale_date, 'sales', v_bill_no, 'Sale Invoice #' || v_bill_no
    ) RETURNING id INTO v_voucher_id;

    -- Entry 1: Debit Buyer (AR)
    INSERT INTO ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit
    ) VALUES (
        p_organization_id, v_voucher_id, p_buyer_id, v_total_payable, 0
    );

    -- Entry 2: Credit Sales (Revenue)
    -- Try to find 'Sales' account
    SELECT id INTO v_sales_account_id FROM accounts WHERE organization_id = p_organization_id AND name = 'Sales' LIMIT 1;
    
    IF v_sales_account_id IS NOT NULL THEN
        INSERT INTO ledger_entries (
            organization_id, voucher_id, account_id, debit, credit
        ) VALUES (
            p_organization_id, v_voucher_id, v_sales_account_id, 0, p_total_amount
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$ LANGUAGE plpgsql;
