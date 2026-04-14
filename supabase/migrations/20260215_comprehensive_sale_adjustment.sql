-- Migration: Comprehensive Sale Adjustment Logic
-- Date: 2026-02-15
-- Description: Implements robust sale adjustment handling with descriptive narrations and auto-status updates.

-- 1. Ensure sale_adjustments table exists for auditing
CREATE TABLE IF NOT EXISTS public.sale_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    sale_item_id UUID NOT NULL,
    old_qty NUMERIC,
    new_qty NUMERIC,
    old_rate NUMERIC,
    new_rate NUMERIC,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add is_adjusted flag to sales if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales' AND COLUMN_NAME = 'is_adjusted') THEN
        ALTER TABLE sales ADD COLUMN is_adjusted BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. The Comprehensive Adjustment Function
CREATE OR REPLACE FUNCTION public.create_comprehensive_sale_adjustment(
    p_organization_id UUID,
    p_sale_item_id UUID,
    p_new_qty NUMERIC,
    p_new_rate NUMERIC,
    p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    v_sale_id UUID;
    v_buyer_id UUID;
    v_old_qty NUMERIC;
    v_old_rate NUMERIC;
    v_old_item_amount NUMERIC;
    v_new_item_amount NUMERIC;
    v_diff_amount NUMERIC;
    v_bill_no BIGINT;
    v_old_sale_total NUMERIC;
    v_new_sale_total NUMERIC;
    v_voucher_id UUID;
    v_sales_account_id UUID;
    v_adjustment_narration TEXT;
    v_current_total_paid NUMERIC;
BEGIN
    -- 1. Fetch current item and sale details
    SELECT 
        si.sale_id, si.qty, si.rate, si.amount, 
        s.buyer_id, s.bill_no, s.total_amount 
    INTO 
        v_sale_id, v_old_qty, v_old_rate, v_old_item_amount,
        v_buyer_id, v_bill_no, v_old_sale_total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE si.id = p_sale_item_id AND si.organization_id = p_organization_id;

    IF v_sale_id IS NULL THEN
        RAISE EXCEPTION 'Sale Item not found or access denied';
    END IF;

    -- 2. Calculate totals
    v_new_item_amount := p_new_qty * p_new_rate;
    v_diff_amount := v_new_item_amount - v_old_item_amount;
    v_new_sale_total := v_old_sale_total + v_diff_amount;

    -- 3. Update Domain Records
    INSERT INTO sale_adjustments (
        organization_id, sale_id, sale_item_id, old_qty, new_qty, old_rate, new_rate, reason
    ) VALUES (
        p_organization_id, v_sale_id, p_sale_item_id, v_old_qty, p_new_qty, v_old_rate, p_new_rate, p_reason
    );

    UPDATE sale_items
    SET qty = p_new_qty, rate = p_new_rate, amount = v_new_item_amount
    WHERE id = p_sale_item_id;

    UPDATE sales
    SET total_amount = v_new_sale_total,
        is_adjusted = TRUE
    WHERE id = v_sale_id;

    -- 4. Ledger Posting with High-Aesthetic Narrations
    -- Business Requirement: "show like it was 2000 before and adjusted to 1900"
    v_adjustment_narration := 'Inv Adj: was ' || v_old_sale_total || ' before and adjusted to ' || v_new_sale_total || ' (Bill #' || v_bill_no || ')';

    -- Create Adjustment Voucher
    INSERT INTO vouchers (
        organization_id, date, type, voucher_no, narration
    ) VALUES (
        p_organization_id, CURRENT_DATE, 'adjustment', v_bill_no, v_adjustment_narration
    ) RETURNING id INTO v_voucher_id;

    -- Map Sales Account
    SELECT id INTO v_sales_account_id FROM accounts WHERE organization_id = p_organization_id AND name = 'Sales' LIMIT 1;

    IF v_diff_amount < 0 THEN
        -- Revenue Decrease (Credit Buyer, Debit Sales)
        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit, description)
        VALUES (p_organization_id, v_voucher_id, v_buyer_id, 0, ABS(v_diff_amount), v_adjustment_narration);

        IF v_sales_account_id IS NOT NULL THEN
            INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, description)
            VALUES (p_organization_id, v_voucher_id, v_sales_account_id, ABS(v_diff_amount), 0, 'Inv Adj (Revenue Decrease) - ' || v_bill_no);
        END IF;
    ELSIF v_diff_amount > 0 THEN
        -- Revenue Increase (Debit Buyer, Credit Sales)
        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit, description)
        VALUES (p_organization_id, v_voucher_id, v_buyer_id, v_diff_amount, 0, v_adjustment_narration);

        IF v_sales_account_id IS NOT NULL THEN
            INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, description)
            VALUES (p_organization_id, v_voucher_id, v_sales_account_id, 0, v_diff_amount, 'Inv Adj (Revenue Increase) - ' || v_bill_no);
        END IF;
    END IF;

    -- 5. Intelligent Status Re-calculation
    -- Fetch all receipts linked to this invoice number
    SELECT COALESCE(SUM(credit), 0) INTO v_current_total_paid
    FROM ledger_entries le
    JOIN vouchers v ON le.voucher_id = v.id
    WHERE v.organization_id = p_organization_id
    AND v.voucher_no = v_bill_no
    AND v.type = 'receipt'
    AND le.contact_id = v_buyer_id;

    -- If total paid >= adjusted total, mark as paid
    IF v_current_total_paid >= v_new_sale_total THEN
        UPDATE sales SET payment_status = 'paid' WHERE id = v_sale_id;
    ELSE
        UPDATE sales SET payment_status = 'pending' WHERE id = v_sale_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'old_total', v_old_sale_total,
        'new_total', v_new_sale_total,
        'difference', v_diff_amount,
        'status', CASE WHEN v_current_total_paid >= v_new_sale_total THEN 'paid' ELSE 'pending' END
    );
END;
$$ LANGUAGE plpgsql;

-- 4. Helper for Frontend to get accurate balance
CREATE OR REPLACE FUNCTION public.get_invoice_balance(p_invoice_id UUID)
RETURNS TABLE (
    total_amount NUMERIC,
    amount_paid NUMERIC,
    balance_due NUMERIC
) AS $$
DECLARE
    v_total NUMERIC;
    v_paid NUMERIC;
    v_bill_no BIGINT;
    v_org_id UUID;
    v_buyer_id UUID;
BEGIN
    SELECT s.total_amount, s.bill_no, s.organization_id, s.buyer_id 
    INTO v_total, v_bill_no, v_org_id, v_buyer_id
    FROM sales s WHERE s.id = p_invoice_id;
    
    -- Calculate total paid via vouchers linked to this bill_no
    SELECT COALESCE(SUM(credit), 0) INTO v_paid
    FROM ledger_entries le
    JOIN vouchers v ON le.voucher_id = v.id
    WHERE v.organization_id = v_org_id
    AND v.voucher_no = v_bill_no
    AND v.type = 'receipt'
    AND le.contact_id = v_buyer_id;
    
    RETURN QUERY SELECT v_total, v_paid, (v_total - v_paid);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_comprehensive_sale_adjustment(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_comprehensive_sale_adjustment(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_balance(UUID) TO service_role;
