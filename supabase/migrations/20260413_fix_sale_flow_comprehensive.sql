-- ============================================================
-- COMPREHENSIVE SALES FLOW FIX
-- Migration: 20260413_fix_sale_flow_comprehensive.sql
-- ============================================================

-- 1. DATA REPAIR: Ensure organization_id is populated in mandi.lots
-- Some legacy lots might have NULL organization_id, which breaks inventory updates.
UPDATE mandi.lots l
SET organization_id = a.organization_id
FROM mandi.arrivals a
WHERE l.arrival_id = a.id
  AND l.organization_id IS NULL;

-- 2. Ensure Required Accounts Exist for Ledger Posting
DO $$
DECLARE
    r_org RECORD;
BEGIN
    FOR r_org IN SELECT id FROM core.organizations LOOP
        -- 1001: Cash in Hand (Asset)
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '1001') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (r_org.id, 'Cash in Hand', 'asset', '1001', true);
        END IF;

        -- 4001: Sales Revenue (Income)
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '4001') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (r_org.id, 'Sales Revenue', 'income', '4001', true);
        END IF;

        -- 4501: Discount Allowed (Expense)
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '4501') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (r_org.id, 'Discount Allowed', 'expense', '4501', true);
        END IF;

        -- 4003: Market Fee (Income)
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '4003') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (r_org.id, 'Market Fee Income', 'income', '4003', true);
        END IF;

        -- 4004: Nirashrit Fee (Income)
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '4004') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active)
            VALUES (r_org.id, 'Nirashrit Fee Income', 'income', '4004', true);
        END IF;

        -- GST Accounts
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '2101') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (r_org.id, 'CGST Payable', 'liability', '2101', true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '2102') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (r_org.id, 'SGST Payable', 'liability', '2102', true);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM mandi.accounts WHERE organization_id = r_org.id AND code = '2103') THEN
            INSERT INTO mandi.accounts (organization_id, name, type, code, is_active) VALUES (r_org.id, 'IGST Payable', 'liability', '2103', true);
        END IF;
    END LOOP;
END $$;

-- 3. REBUILD GLOBAL sales_view (No changes needed)

-- 4. CONSOLIDATED MASTER RPC: mandi.confirm_sale_transaction
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction CASCADE;

CREATE OR REPLACE FUNCTION mandi.confirm_sale_transaction(
    p_organization_id   uuid,
    p_buyer_id          uuid,
    p_sale_date         date,
    p_payment_mode      text,
    p_total_amount      numeric,
    p_items             jsonb,
    p_market_fee        numeric  DEFAULT 0,
    p_nirashrit         numeric  DEFAULT 0,
    p_misc_fee          numeric  DEFAULT 0,
    p_loading_charges   numeric  DEFAULT 0,
    p_unloading_charges numeric  DEFAULT 0,
    p_other_expenses    numeric  DEFAULT 0,
    p_amount_received   numeric  DEFAULT 0,
    p_idempotency_key   uuid     DEFAULT NULL,
    p_due_date          date     DEFAULT NULL,
    p_bank_account_id   uuid     DEFAULT NULL,
    p_cheque_no         text     DEFAULT NULL,
    p_cheque_date       date     DEFAULT NULL,
    p_cheque_status     boolean  DEFAULT false,
    p_bank_name         text     DEFAULT NULL,
    p_cgst_amount       numeric  DEFAULT 0,
    p_sgst_amount       numeric  DEFAULT 0,
    p_igst_amount       numeric  DEFAULT 0,
    p_gst_total         numeric  DEFAULT 0,
    p_discount_percent  numeric  DEFAULT 0,
    p_discount_amount   numeric  DEFAULT 0,
    p_place_of_supply   text     DEFAULT NULL,
    p_buyer_gstin       text     DEFAULT NULL,
    p_is_igst           boolean  DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_sale_id           UUID;
    v_bill_no           BIGINT;
    v_contact_bill_no   BIGINT;
    v_total_inc_tax     NUMERIC;
    v_payment_status    TEXT;
    
    -- Account IDs
    v_sales_revenue_acc_id  UUID;
    v_discount_acc_id       UUID;
    v_market_fee_acc_id     UUID;
    v_nirashrit_acc_id      UUID;
    v_cgst_acc_id           UUID;
    v_sgst_acc_id           UUID;
    v_igst_acc_id           UUID;
    v_cash_bank_acc_id      UUID;
    
    -- Voucher tracking
    v_sale_voucher_id   UUID;
    v_rcpt_voucher_id   UUID;
    
    v_item              JSONB;
    v_actual_amount_rec NUMERIC := COALESCE(p_amount_received, 0);
    v_description       TEXT;
BEGIN
    -- ─── 0. Idempotency Check ───────────────
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, bill_no, contact_bill_no, payment_status
        INTO v_sale_id, v_bill_no, v_contact_bill_no, v_payment_status
        FROM mandi.sales
        WHERE idempotency_key = p_idempotency_key
          AND organization_id = p_organization_id
        LIMIT 1;
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'sale_id', v_sale_id,
                'bill_no', v_bill_no,
                'contact_bill_no', v_contact_bill_no,
                'payment_status', v_payment_status,
                'message', 'Duplicate sale skipped'
            );
        END IF;
    END IF;

    -- ─── 1. Resolve Account IDs ───────────────
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    SELECT id INTO v_discount_acc_id      FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4501' LIMIT 1;
    SELECT id INTO v_market_fee_acc_id     FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4003' LIMIT 1;
    SELECT id INTO v_nirashrit_acc_id      FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4004' LIMIT 1;
    SELECT id INTO v_cgst_acc_id           FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '2101' LIMIT 1;
    SELECT id INTO v_sgst_acc_id           FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '2102' LIMIT 1;
    SELECT id INTO v_igst_acc_id           FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '2103' LIMIT 1;

    -- ─── 2. Calculate Totals and Status ───────────────
    v_total_inc_tax := ROUND(
                       COALESCE(p_total_amount, 0)
                     + COALESCE(p_market_fee, 0)
                     + COALESCE(p_nirashrit, 0)
                     + COALESCE(p_misc_fee, 0)
                     + COALESCE(p_loading_charges, 0)
                     + COALESCE(p_unloading_charges, 0)
                     + COALESCE(p_other_expenses, 0)
                     + COALESCE(p_gst_total, 0)
                     - COALESCE(p_discount_amount, 0), 2);

    IF v_actual_amount_rec <= 0 THEN
        v_payment_status := 'pending';
    ELSIF v_actual_amount_rec >= v_total_inc_tax THEN
        v_payment_status := 'paid';
    ELSE
        v_payment_status := 'partial';
    END IF;

    -- ─── 3. Insert Sale Record ───────────────
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, total_amount, total_amount_inc_tax,
        payment_mode, payment_status, amount_received, market_fee, nirashrit, misc_fee,
        loading_charges, unloading_charges, other_expenses,
        discount_percent, discount_amount,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        due_date, cheque_no, cheque_date, bank_name, bank_account_id,
        idempotency_key, place_of_supply, buyer_gstin, is_igst
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_total_amount, v_total_inc_tax,
        p_payment_mode, v_payment_status, v_actual_amount_rec, p_market_fee, p_nirashrit, p_misc_fee,
        p_loading_charges, p_unloading_charges, p_other_expenses,
        p_discount_percent, p_discount_amount,
        p_cgst_amount, p_sgst_amount, p_igst_amount, p_gst_total,
        p_due_date, p_cheque_no, p_cheque_date, p_bank_name, p_bank_account_id,
        p_idempotency_key, p_place_of_supply, p_buyer_gstin, p_is_igst
    ) RETURNING id, bill_no, contact_bill_no INTO v_sale_id, v_bill_no, v_contact_bill_no;

    v_description := 'Sale Invoice #' || COALESCE(v_contact_bill_no, v_bill_no)::text;

    -- ─── 4. Sale Items and Stock Deduction ───────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (
            organization_id, sale_id, lot_id, item_id, qty, rate, amount, unit, 
            tax_amount, gst_rate, hsn_code
        ) VALUES (
            p_organization_id, v_sale_id, (v_item->>'lot_id')::uuid, (v_item->>'item_id')::uuid,
            (v_item->>'qty')::numeric, (v_item->>'rate')::numeric, (v_item->>'amount')::numeric,
            COALESCE(v_item->>'unit', 'Unit'), 
            ROUND(COALESCE((v_item->>'gst_amount')::numeric, 0), 2),
            COALESCE((v_item->>'gst_rate')::numeric, 0),
            v_item->>'hsn_code'
        );

        UPDATE mandi.lots SET current_qty = current_qty - (v_item->>'qty')::numeric
        WHERE id = (v_item->>'lot_id')::uuid AND organization_id = p_organization_id;
        
        IF NOT FOUND THEN RAISE EXCEPTION 'Lot % not found', (v_item->>'lot_id'); END IF;
        IF EXISTS (SELECT 1 FROM mandi.lots WHERE id = (v_item->>'lot_id')::uuid AND current_qty < 0) THEN
             RAISE EXCEPTION 'Insufficient stock in lot %', (v_item->>'lot_id');
        END IF;
    END LOOP;

    -- ─── 5. Ledger Posting: SALE ───────────────
    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration, invoice_id, contact_id, party_id
    ) VALUES (
        p_organization_id, p_sale_date, 'sale', 
        (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'sale'),
        v_total_inc_tax, v_description, v_sale_id, p_buyer_id, p_buyer_id
    ) RETURNING id INTO v_sale_voucher_id;

    -- DEBIT: Buyer (Full amount including tax and fees, but after discount)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, p_buyer_id, v_total_inc_tax, 0, p_sale_date, v_description, 'sale', v_sale_id);

    -- DEBIT: Discount Allowed (If any) to balance the voucher
    IF COALESCE(p_discount_amount, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, COALESCE(v_discount_acc_id, v_sales_revenue_acc_id), p_discount_amount, 0, p_sale_date, 'Discount Allowed - ' || v_description, 'sale', v_sale_id);
    END IF;

    -- CREDIT: Sales Revenue
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_organization_id, v_sale_voucher_id, v_sales_revenue_acc_id, 0, p_total_amount, p_sale_date, 'Items Revenue - ' || v_description, 'sale', v_sale_id);

    -- CREDIT: Market Fee & Nirashrit & Misc
    IF COALESCE(p_market_fee, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, COALESCE(v_market_fee_acc_id, v_sales_revenue_acc_id), 0, p_market_fee, p_sale_date, 'Market Fee - ' || v_description, 'sale', v_sale_id);
    END IF;
    IF COALESCE(p_nirashrit, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, COALESCE(v_nirashrit_acc_id, v_sales_revenue_acc_id), 0, p_nirashrit, p_sale_date, 'Nirashrit Fee - ' || v_description, 'sale', v_sale_id);
    END IF;
    
    DECLARE v_other NUMERIC := COALESCE(p_misc_fee, 0) + COALESCE(p_loading_charges, 0) + COALESCE(p_unloading_charges, 0) + COALESCE(p_other_expenses, 0);
    BEGIN
        IF v_other > 0 THEN
             INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
             VALUES (p_organization_id, v_sale_voucher_id, v_sales_revenue_acc_id, 0, v_other, p_sale_date, 'Fees & charges - ' || v_description, 'sale', v_sale_id);
        END IF;
    END;

    -- CREDIT: GST Legs
    IF COALESCE(p_cgst_amount, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, v_cgst_acc_id, 0, p_cgst_amount, p_sale_date, 'CGST', 'sale', v_sale_id);
    END IF;
    IF COALESCE(p_sgst_amount, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, v_sgst_acc_id, 0, p_sgst_amount, p_sale_date, 'SGST', 'sale', v_sale_id);
    END IF;
    IF COALESCE(p_igst_amount, 0) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_sale_voucher_id, v_igst_acc_id, 0, p_igst_amount, p_sale_date, 'IGST', 'sale', v_sale_id);
    END IF;

    -- ─── 6. Ledger Posting: RECEIPT
    IF v_actual_amount_rec > 0 THEN
        IF LOWER(p_payment_mode) = 'cash' THEN
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '1001' LIMIT 1;
        ELSE
            v_cash_bank_acc_id := p_bank_account_id;
            IF v_cash_bank_acc_id IS NULL THEN
                 SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1002' OR name ILIKE '%Bank%') LIMIT 1;
            END IF;
        END IF;

        IF v_cash_bank_acc_id IS NULL THEN
            -- Robust fallback to ensure we don't crash
            SELECT id INTO v_cash_bank_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND (code = '1001' OR name ILIKE '%Cash%') LIMIT 1;
        END IF;

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration, invoice_id, contact_id, party_id, bank_account_id
        ) VALUES (
            p_organization_id, p_sale_date, 'receipt',
            (SELECT COALESCE(MAX(voucher_no), 0) + 1 FROM mandi.vouchers WHERE organization_id = p_organization_id AND type = 'receipt'),
            v_actual_amount_rec, 'Payment Received for ' || v_description, v_sale_id, p_buyer_id, p_buyer_id, v_cash_bank_acc_id
        ) RETURNING id INTO v_rcpt_voucher_id;

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_rcpt_voucher_id, v_cash_bank_acc_id, v_actual_amount_rec, 0, p_sale_date, 'Collection', 'receipt', v_sale_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (p_organization_id, v_rcpt_voucher_id, p_buyer_id, 0, v_actual_amount_rec, p_sale_date, 'Payment Received', 'receipt', v_sale_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no, 'contact_bill_no', v_contact_bill_no, 'payment_status', v_payment_status);
END;
$function$;
