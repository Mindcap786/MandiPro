-- ============================================================
-- HARDEN SALES ACCOUNTING & LEDGER LOGIC
-- Migration: 20260422140000_harden_sales_ledger.sql
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS mandi.post_sale_ledger(UUID);

CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public', 'extensions'
AS $$
DECLARE
    v_sale RECORD;
    v_org_id UUID;
    v_buyer_id UUID;
    v_sale_date DATE;
    v_bill_no BIGINT;
    v_voucher_id UUID;
    v_total_inc_tax NUMERIC := 0;
    v_amount_received NUMERIC := 0;
    
    -- Accounts
    v_ar_acc_id UUID;
    v_rev_acc_id UUID;
    v_liquid_acc_id UUID;
    
    v_narration TEXT;
    v_item_summary TEXT;
    v_payment_mode TEXT;
    v_bank_acc_id_header UUID;
BEGIN
    -- 1. Fetch Header Info with NULL PROTECTION (COALESCE)
    SELECT 
        organization_id, buyer_id, sale_date, bill_no, payment_mode, 
        COALESCE(amount_received, 0) as amount_received, bank_account_id,
        ROUND(
            COALESCE(total_amount, 0) + 
            COALESCE(gst_total, 0) + 
            COALESCE(market_fee, 0) + 
            COALESCE(nirashrit, 0) + 
            COALESCE(misc_fee, 0) + 
            COALESCE(loading_charges, 0) + 
            COALESCE(unloading_charges, 0) + 
            COALESCE(other_expenses, 0) - 
            COALESCE(discount_amount, 0), 
            2
        ) as total_calc
    INTO v_sale
    FROM mandi.sales WHERE id = p_sale_id;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sale not found'); END IF;
    
    v_org_id := v_sale.organization_id;
    v_total_inc_tax := v_sale.total_calc;
    v_amount_received := v_sale.amount_received;

    -- 2. Clean existing entries (Idempotency)
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type IN ('sale', 'sale_payment');
    DELETE FROM mandi.vouchers WHERE reference_id = p_sale_id AND type = 'sale';

    -- 3. Guard
    IF v_total_inc_tax = 0 AND v_amount_received = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Zero value sale, skipped ledger');
    END IF;

    -- 4. Resolve Accounts strictly
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1200' OR account_sub_type = 'receivable' OR name ILIKE '%Receivable%') LIMIT 1;
    SELECT id INTO v_rev_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '4001' OR account_sub_type = 'sales' OR name ILIKE '%Sales Revenue%') LIMIT 1;
    
    -- 5. Prepare Rich Narration
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary
    FROM mandi.sale_items si JOIN mandi.commodities c ON c.id = si.item_id WHERE si.sale_id = p_sale_id;

    v_narration := 'Sale Bill #' || v_sale.bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Sold');

    -- 6. Create Voucher
    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id, invoice_id, party_id)
    VALUES (v_org_id, v_sale.sale_date, 'sale', v_total_inc_tax, v_narration, p_sale_id, p_sale_id, v_sale.buyer_id)
    RETURNING id INTO v_voucher_id;

    -- 7. [LEDGER] Sale Leg (Debit Buyer Account, Credit Revenue Account)
    IF v_total_inc_tax > 0 THEN
        -- DEBIT Buyer
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_sale.buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale.sale_date, v_narration, v_narration, 'sale', p_sale_id);

        -- CREDIT Revenue
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_rev_acc_id, 0, v_total_inc_tax, v_sale.sale_date, v_narration, v_narration, 'sale', p_sale_id);
    END IF;

    -- 8. [PAYMENT] Handle Immediate Payment
    IF v_amount_received > 0 THEN
        IF v_sale.payment_mode = 'cash' THEN
            SELECT id INTO v_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1100' OR account_sub_type = 'cash' OR name ILIKE '%Cash%') LIMIT 1;
        ELSE
            v_liquid_acc_id := COALESCE(v_sale.bank_account_id, (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (account_sub_type = 'bank' OR name ILIKE '%Bank%') LIMIT 1));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            -- DEBIT Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_liquid_acc_id, v_amount_received, 0, v_sale.sale_date, 'Payment Received for Bill #' || v_sale.bill_no, v_narration, 'sale_payment', p_sale_id);

            -- CREDIT Buyer
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_sale.buyer_id, v_ar_acc_id, 0, v_amount_received, v_sale.sale_date, 'Payment Received for Bill #' || v_sale.bill_no, v_narration, 'sale_payment', p_sale_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'total_posted', v_total_inc_tax);
END;
$$;

COMMIT;
