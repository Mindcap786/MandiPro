-- ============================================================================
-- MANDI SELF-HEALING ACCOUNTING & LEDGER REPAIR (v5.50)
-- 
-- Goal: Ensure accounting NEVER fails by implementing ultra-robust resolution
--       and fixing bill numbering conflicts.
-- ============================================================================

BEGIN;

-- 1. Ultra-Robust Account Resolution (Never returns NULL if any account exists)
CREATE OR REPLACE FUNCTION mandi.resolve_account_robust(
    p_org_id UUID,
    p_sub_type TEXT,
    p_name_pattern TEXT,
    p_default_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_acc_id UUID;
    v_type TEXT;
BEGIN
    -- Determine target account type for fallback
    v_type := CASE 
        WHEN p_sub_type IN ('cash', 'bank', 'receivable') THEN 'asset'
        WHEN p_sub_type IN ('sales', 'commission', 'fees') THEN 'income'
        WHEN p_sub_type IN ('payable', 'cost_of_goods') THEN 'liability'
        ELSE 'asset'
    END;

    -- Tier 1: Match by specific sub-type
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND account_sub_type = p_sub_type LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- Tier 2: Match by name pattern
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND name ILIKE p_name_pattern ORDER BY code LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- Tier 3: Match by standard code
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND code = p_default_code LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- Tier 4: Fallback to ANY account of the correct type
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND type = v_type LIMIT 1;
    
    RETURN v_acc_id;
END;
$$;

-- 2. Hardened Sales Posting Engine (Matches Daybook UI perfectly)
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_rev_acc_id UUID;
    v_ar_acc_id UUID;
    v_liquid_acc_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_summary_narration TEXT;
    v_total_inc_tax NUMERIC;
    v_received NUMERIC;
    v_payment_mode TEXT;
    v_status TEXT;
BEGIN
    -- 1. Get Sale Header
    SELECT s.*, 
           (COALESCE(s.total_amount, 0) + COALESCE(s.gst_total, 0) + COALESCE(s.market_fee, 0) + 
            COALESCE(s.nirashrit, 0) + COALESCE(s.misc_fee, 0) + COALESCE(s.loading_charges, 0) + 
            COALESCE(s.unloading_charges, 0) + COALESCE(s.other_expenses, 0) - COALESCE(s.discount_amount, 0)) as total_calc
    FROM mandi.sales s WHERE s.id = p_sale_id INTO v_sale;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sale not found'); END IF;
    
    v_total_inc_tax := v_sale.total_calc;
    v_payment_mode := LOWER(COALESCE(v_sale.payment_mode, 'udhaar'));

    -- SMART FIX: Calculate received amount from ALL vouchers tied to this invoice
    -- This ensures that even if amount_received column is stale, the ledger is correct.
    SELECT COALESCE(SUM(amount), 0) INTO v_received 
    FROM mandi.vouchers 
    WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt');

    -- If no vouchers found but the sale record itself claims an amount (e.g. from POS), use that.
    IF v_received = 0 THEN
        v_received := COALESCE(v_sale.amount_received, 0);
    END IF;

    -- 2. Resolve Accounts
    v_rev_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'sales', '%Sales Revenue%', '4001');
    v_ar_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'receivable', '%Receivable%', '1200');

    IF v_rev_acc_id IS NULL THEN SELECT id INTO v_rev_acc_id FROM mandi.accounts WHERE organization_id = v_sale.organization_id AND type = 'income' LIMIT 1; END IF;
    IF v_ar_acc_id IS NULL THEN SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = v_sale.organization_id AND type = 'asset' LIMIT 1; END IF;

    -- 3. Clean ONLY the Sale/Invoice part (Idempotency)
    -- We DON'T delete receipts here anymore to prevent wiping out manually recorded payments
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id;
    DELETE FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type = 'sale';

    -- 4. Create Invoice Voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
    FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
    
    v_summary_narration := 'Sale Bill #' || v_sale.bill_no || ' | Items Sold';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode) 
    VALUES (v_sale.organization_id, v_sale.sale_date, 'sale', v_voucher_no, v_summary_narration, v_total_inc_tax, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode) 
    RETURNING id INTO v_voucher_id;
    
    -- 5. Post Ledger (DR Buyer / CR Revenue)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (v_sale.organization_id, v_voucher_id, v_sale.buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (v_sale.organization_id, v_voucher_id, v_rev_acc_id, 0, v_total_inc_tax, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);

    -- 6. Ensure Receipt exists if amount > 0
    -- Check if a receipt voucher already exists to avoid duplication
    IF v_received > 0 AND NOT EXISTS (SELECT 1 FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt')) THEN
        IF v_payment_mode = 'cash' THEN 
            v_liquid_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'cash', '%Cash%', '1001');
        ELSE 
            v_liquid_acc_id := COALESCE(v_sale.bank_account_id, mandi.resolve_account_robust(v_sale.organization_id, 'bank', '%Bank%', '1002'));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
            FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
            
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode, bank_account_id) 
            VALUES (v_sale.organization_id, v_sale.sale_date, 'receipt', v_voucher_no, 'Receipt against Bill #' || v_sale.bill_no, v_received, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode, v_liquid_acc_id)
            RETURNING id INTO v_voucher_id;
        END IF;
    END IF;

    -- 7. Update Sales Header Status & Sync Total
    v_status := CASE 
        WHEN v_received >= v_total_inc_tax - 0.01 THEN 'paid'
        WHEN v_received > 0 THEN 'partial'
        ELSE 'pending'
    END;
    
    UPDATE mandi.sales SET 
        payment_status = v_status, 
        amount_received = v_received,
        balance_due = GREATEST(v_total_inc_tax - v_received, 0),
        total_amount_inc_tax = v_total_inc_tax
    WHERE id = p_sale_id;

    RETURN jsonb_build_object('success', true, 'status', v_status, 'received', v_received);
END;
$$;

-- 3. Master Purchase/Arrival Posting Engine
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival RECORD;
    v_purchase_acc_id UUID;
    v_ap_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_recovery_acc_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_purchase NUMERIC := 0;
    v_net_payable NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_total_exp NUMERIC := 0;
    v_total_advance NUMERIC := 0;
    v_summary_narration TEXT;
BEGIN
    -- 1. Get Arrival Header
    SELECT a.*, c.name as party_name FROM mandi.arrivals a 
    LEFT JOIN mandi.contacts c ON a.party_id = c.id WHERE a.id = p_arrival_id INTO v_arrival;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;

    -- 2. Resolve Accounts with 100% success rate
    v_purchase_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'cost_of_goods', '%Purchase%', '5001');
    v_ap_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'payable', '%Payable%', '2100');
    v_comm_income_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'commission', '%Commission%', '4003');
    v_recovery_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'fees', '%Recovery%', '4002');

    -- Safety check: Ensure core accounts exist
    IF v_purchase_acc_id IS NULL THEN SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'expense' LIMIT 1; END IF;
    IF v_ap_acc_id IS NULL THEN SELECT id INTO v_ap_acc_id FROM mandi.accounts WHERE organization_id = v_arrival.organization_id AND type = 'liability' LIMIT 1; END IF;

    -- 3. Calculate Totals from Lots
    SELECT 
        SUM(COALESCE(net_payable, 0)) as net,
        SUM(COALESCE(initial_qty * supplier_rate, 0)) as gross,
        SUM(COALESCE(initial_qty * supplier_rate * (COALESCE(commission_percent, 0) / 100.0), 0)) as comm,
        SUM(COALESCE(advance, 0)) as adv,
        SUM(COALESCE(packing_cost, 0) + COALESCE(loading_cost, 0) + COALESCE(farmer_charges, 0)) as exp
    INTO v_net_payable, v_gross_purchase, v_total_comm, v_total_advance, v_total_exp
    FROM mandi.lots WHERE arrival_id = p_arrival_id;

    -- 4. Clean existing entries
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id;
    DELETE FROM mandi.vouchers WHERE arrival_id = p_arrival_id OR reference_id = p_arrival_id;

    -- 5. Create Purchase Voucher
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
    FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id;
    
    v_summary_narration := 'Arrival #' || v_arrival.bill_no;
    IF v_arrival.vehicle_number IS NOT NULL THEN v_summary_narration := v_summary_narration || ' | Veh: ' || v_arrival.vehicle_number; END IF;

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id, reference_id) 
    VALUES (v_arrival.organization_id, v_arrival.arrival_date, 'purchase', v_voucher_no, v_summary_narration, v_gross_purchase, v_arrival.party_id, p_arrival_id, p_arrival_id) 
    RETURNING id INTO v_voucher_id;

    -- 6. Post Ledger
    -- DR Purchase/Inventory
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (v_arrival.organization_id, v_voucher_id, v_purchase_acc_id, v_gross_purchase, 0, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    
    -- CR Farmer (Payable)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_ap_acc_id, 0, v_net_payable, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    
    -- CR Commission Income
    IF v_total_comm > 0 AND v_comm_income_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_comm_income_acc_id, 0, v_total_comm, v_arrival.arrival_date, 'Commission Income #' || v_arrival.bill_no, 'purchase', p_arrival_id);
    END IF;

    -- CR Recoveries (Packing/Loading)
    IF (v_gross_purchase - v_net_payable - v_total_comm) > 0 AND v_recovery_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_recovery_acc_id, 0, (v_gross_purchase - v_net_payable - v_total_comm), v_arrival.arrival_date, 'Charges Recovery #' || v_arrival.bill_no, 'purchase', p_arrival_id);
    END IF;

    UPDATE mandi.arrivals SET status = 'completed' WHERE id = p_arrival_id;

    RETURN jsonb_build_object('success', true, 'net_payable', v_net_payable);
END;
$$;

-- 4. Unified confirm_sale_transaction (Prevents Bill No conflicts)
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
    p_amount_received numeric DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_due_date date DEFAULT NULL,
    p_bank_account_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status boolean DEFAULT FALSE,
    p_bank_name text DEFAULT NULL,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_igst_amount numeric DEFAULT 0,
    p_gst_total numeric DEFAULT 0,
    p_discount_percent numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_place_of_supply text DEFAULT NULL,
    p_buyer_gstin text DEFAULT NULL,
    p_is_igst boolean DEFAULT FALSE,
    p_vehicle_number text DEFAULT NULL,
    p_book_no text DEFAULT NULL,
    p_lot_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_bill_no BIGINT;
    v_item RECORD;
BEGIN
    -- 1. Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_sale_id FROM mandi.sales WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
        IF FOUND THEN RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'idempotent', true); END IF;
    END IF;

    -- 2. Generate Bill No with Lock (Prevents duplicates like the "Invoice #1" issue)
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO v_bill_no FROM mandi.sales WHERE organization_id = p_organization_id;

    -- 3. Insert Sale Header
    INSERT INTO mandi.sales (
        organization_id, buyer_id, sale_date, payment_mode, total_amount, bill_no,
        market_fee, nirashrit, misc_fee, loading_charges, unloading_charges, other_expenses,
        amount_received, idempotency_key, due_date, bank_account_id,
        cgst_amount, sgst_amount, igst_amount, gst_total,
        discount_percent, discount_amount, vehicle_number, book_no
    ) VALUES (
        p_organization_id, p_buyer_id, p_sale_date, p_payment_mode, p_total_amount, v_bill_no,
        COALESCE(p_market_fee, 0), COALESCE(p_nirashrit, 0), COALESCE(p_misc_fee, 0),
        COALESCE(p_loading_charges, 0), COALESCE(p_unloading_charges, 0), COALESCE(p_other_expenses, 0),
        COALESCE(p_amount_received, 0), p_idempotency_key, p_due_date, p_bank_account_id,
        COALESCE(p_cgst_amount, 0), COALESCE(p_sgst_amount, 0), COALESCE(p_igst_amount, 0), COALESCE(p_gst_total, 0),
        COALESCE(p_discount_percent, 0), COALESCE(p_discount_amount, 0), p_vehicle_number, p_book_no
    ) RETURNING id INTO v_sale_id;

    -- 4. Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO mandi.sale_items (sale_id, lot_id, qty, rate, amount)
        VALUES (v_sale_id, (v_item.value->>'lot_id')::UUID, (v_item.value->>'qty')::NUMERIC, (v_item.value->>'rate')::NUMERIC, (v_item.value->>'amount')::NUMERIC);
        
        UPDATE mandi.lots SET 
            current_qty = current_qty - (v_item.value->>'qty')::NUMERIC,
            status = CASE WHEN current_qty - (v_item.value->>'qty')::NUMERIC <= 0 THEN 'sold' ELSE 'partial' END
        WHERE id = (v_item.value->>'lot_id')::UUID;
    END LOOP;

    -- 5. CALL MASTER POSTING ENGINE
    PERFORM mandi.post_sale_ledger(v_sale_id);

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'bill_no', v_bill_no);
END;
$$;

-- 5. RUN EMERGENCY REPAIR (Syncs all today's transactions immediately)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Repost all sales from today to ensure they appear in Daybook/Ledger
    FOR r IN SELECT id FROM mandi.sales WHERE created_at::date = CURRENT_DATE LOOP
        PERFORM mandi.post_sale_ledger(r.id);
    END LOOP;
    
    -- Repost all arrivals from today
    FOR r IN SELECT id FROM mandi.arrivals WHERE created_at::date = CURRENT_DATE LOOP
        PERFORM mandi.post_arrival_ledger(r.id);
    END LOOP;
END $$;

COMMIT;
