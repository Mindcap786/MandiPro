-- Hardened Financial Standardization
-- Date: 2026-04-22
-- Author: MandiPro ERP Architect

-- 1. Hardened Sale Ledger Function
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_org_id UUID;
    v_buyer_id UUID;
    v_sale_date DATE;
    v_bill_no BIGINT;
    v_voucher_id UUID;
    v_total_inc_tax NUMERIC;
    v_amount_received NUMERIC;
    v_ar_acc_id UUID;
    v_sales_revenue_acc_id UUID;
    v_liquid_acc_id UUID;
    v_narration TEXT;
    v_item_summary TEXT;
    v_payment_mode TEXT;
    v_bank_acc_id_header UUID;
BEGIN
    -- 1. Fetch Header Info
    SELECT 
        organization_id, buyer_id, sale_date, bill_no, payment_mode, 
        amount_received, bank_account_id,
        (total_amount + gst_total + market_fee + nirashrit + misc_fee + loading_charges + unloading_charges + other_expenses - discount_amount)
    INTO v_org_id, v_buyer_id, v_sale_date, v_bill_no, v_payment_mode, 
         v_amount_received, v_bank_acc_id_header, v_total_inc_tax
    FROM mandi.sales WHERE id = p_sale_id;

    -- 2. [IDEMPOTENCY] Wipe existing entries
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type IN ('sale', 'sale_payment');
    DELETE FROM mandi.vouchers WHERE reference_id = p_sale_id AND type = 'sale';

    -- 3. Guard
    IF COALESCE(v_total_inc_tax,0) = 0 AND COALESCE(v_amount_received,0) = 0 THEN
        RETURN;
    END IF;

    -- 4. Resolve Accounts
    SELECT id INTO v_ar_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Receivable%' OR code = '1200') LIMIT 1;
    SELECT id INTO v_sales_revenue_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Sales Revenue%' OR code = '4001') LIMIT 1;
    
    -- 5. Prepare Narration
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary
    FROM mandi.sale_items si JOIN mandi.commodities c ON c.id = si.item_id WHERE si.sale_id = p_sale_id;

    v_narration := 'Sale Bill #' || v_bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Sold');

    -- 6. Create Voucher
    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id, invoice_id)
    VALUES (v_org_id, v_sale_date, 'sale', v_total_inc_tax, v_narration, p_sale_id, p_sale_id)
    RETURNING id INTO v_voucher_id;

    -- 7. [LEDGER] Sale Leg (Debit Buyer, Credit Revenue)
    IF v_total_inc_tax > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale_date, v_narration, v_narration, 'sale', p_sale_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_sales_revenue_acc_id, 0, v_total_inc_tax, v_sale_date, v_narration, v_narration, 'sale', p_sale_id);
    END IF;

    -- 8. [PAYMENT] Handle Immediate Payment
    IF v_amount_received > 0 THEN
        IF v_payment_mode = 'cash' THEN
            SELECT id INTO v_liquid_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;
        ELSE
            v_liquid_acc_id := COALESCE(v_bank_acc_id_header, (SELECT id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Bank%' OR account_sub_type = 'bank') LIMIT 1));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_liquid_acc_id, v_amount_received, 0, v_sale_date, 'Payment Received', v_narration, 'sale_payment', p_sale_id);

            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
            VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, 0, v_amount_received, v_sale_date, 'Payment Received', v_narration, 'sale_payment', p_sale_id);
        END IF;
    END IF;

END;
$function$;

-- 2. Hardened Arrival Ledger Function
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_bill_no BIGINT;
    v_voucher_id UUID;
    v_total_payable NUMERIC := 0;
    v_total_advance NUMERIC := 0;
    v_ap_acc_id UUID;
    v_purchase_acc_id UUID;
    v_cash_acc_id UUID;
    v_narration TEXT;
    v_item_summary TEXT;
    v_header_expenses NUMERIC := 0;
BEGIN
    -- 1. Fetch Header Info
    SELECT 
        organization_id, party_id, arrival_date, bill_no, advance_amount,
        COALESCE(transport_amount,0) + COALESCE(loading_amount,0) + COALESCE(packing_amount,0) + COALESCE(hamali_expenses,0) + COALESCE(other_expenses,0)
    INTO v_org_id, v_party_id, v_arrival_date, v_bill_no, v_total_advance, v_header_expenses
    FROM mandi.arrivals WHERE id = p_arrival_id;

    -- 2. Calculate Total Payable from Lots
    SELECT SUM(
        (initial_qty * supplier_rate) 
        - (initial_qty * supplier_rate * (COALESCE(commission_percent, 0) / 100.0)) 
        - COALESCE(farmer_charges, 0)
        - COALESCE(loading_cost, 0)
        - COALESCE(packing_cost, 0)
    ) INTO v_total_payable
    FROM mandi.lots WHERE arrival_id = p_arrival_id;

    v_total_payable := COALESCE(v_total_payable, 0) - v_header_expenses;

    -- 3. [IDEMPOTENCY] Wipe existing entries
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type IN ('arrival', 'arrival_advance');
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type = 'arrival';

    -- 4. Guard
    IF COALESCE(v_total_payable,0) = 0 AND COALESCE(v_total_advance,0) = 0 THEN
        RETURN;
    END IF;

    -- 5. Resolve Accounts
    SELECT id INTO v_ap_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Payable%' OR code = '2100') LIMIT 1;
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Purchase%' OR code = '5001') LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (name ILIKE '%Cash%' OR account_sub_type = 'cash') LIMIT 1;

    -- 6. Prepare Narration
    SELECT string_agg(COALESCE(c.name, 'Item') || ' (' || initial_qty || ' ' || COALESCE(unit, '') || ')', ', ')
    INTO v_item_summary
    FROM mandi.lots l JOIN mandi.commodities c ON c.id = l.item_id WHERE l.arrival_id = p_arrival_id;

    v_narration := 'Arrival Bill #' || v_bill_no || ' | ' || COALESCE(v_item_summary, 'Goods Received');

    -- 7. Create Voucher
    INSERT INTO mandi.vouchers (organization_id, date, type, amount, narration, reference_id)
    VALUES (v_org_id, v_arrival_date, 'arrival', v_total_payable, v_narration, p_arrival_id)
    RETURNING id INTO v_voucher_id;

    -- 8. [LEDGER] Purchase Leg
    IF v_total_payable > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_purchase_acc_id, v_total_payable, 0, v_arrival_date, v_narration, v_narration, 'arrival', p_arrival_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_party_id, v_ap_acc_id, 0, v_total_payable, v_arrival_date, v_narration, v_narration, 'arrival', p_arrival_id);
    END IF;

    -- 9. [ADVANCE PAYMENT]
    IF v_total_advance > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_party_id, v_ap_acc_id, v_total_advance, 0, v_arrival_date, 'Advance Payment (At Gate)', v_narration, 'arrival_advance', p_arrival_id);

        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id)
        VALUES (v_org_id, v_voucher_id, v_cash_acc_id, 0, v_total_advance, v_arrival_date, 'Advance Payment (At Gate)', v_narration, 'arrival_advance', p_arrival_id);
    END IF;

END;
$function$;

-- 3. Automatic Status Synchronization Triggers
CREATE OR REPLACE FUNCTION mandi.update_sale_payment_status_from_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
    v_new_status TEXT;
    v_ref_id UUID;
BEGIN
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    IF NOT EXISTS (SELECT 1 FROM mandi.sales WHERE id = v_ref_id) THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(credit), 0) INTO v_total_paid FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type IN ('sale_payment', 'receipt', 'payment');
    SELECT COALESCE(SUM(debit), 0) INTO v_total_bill FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type = 'sale';

    IF v_total_bill = 0 THEN v_new_status := 'pending';
    ELSIF v_total_paid >= (v_total_bill - 0.1) THEN v_status := 'paid';
    ELSIF v_total_paid > 0.1 THEN v_status := 'partial';
    ELSE v_status := 'pending';
    END IF;

    UPDATE mandi.sales SET payment_status = v_new_status, amount_received = v_total_paid, paid_amount = v_total_paid, balance_due = (v_total_bill - v_total_paid) WHERE id = v_ref_id;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION mandi.auto_update_arrival_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total_paid NUMERIC;
    v_total_bill NUMERIC;
    v_new_status TEXT;
    v_ref_id UUID;
BEGIN
    v_ref_id := COALESCE(NEW.reference_id, OLD.reference_id);
    IF NOT EXISTS (SELECT 1 FROM mandi.arrivals WHERE id = v_ref_id) THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(debit), 0) INTO v_total_paid FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type IN ('arrival_advance', 'payment');
    SELECT COALESCE(SUM(credit), 0) INTO v_total_bill FROM mandi.ledger_entries WHERE reference_id = v_ref_id AND transaction_type = 'arrival';

    IF v_total_bill = 0 THEN v_new_status := 'pending';
    ELSIF v_total_paid >= (v_total_bill - 0.1) THEN v_status := 'paid';
    ELSIF v_total_paid > 0.1 THEN v_status := 'partial';
    ELSE v_status := 'pending';
    END IF;

    UPDATE mandi.arrivals SET payment_status = v_new_status, advance_amount = v_total_paid WHERE id = v_ref_id;
    RETURN NULL;
END;
$function$;

-- Attach Triggers
DROP TRIGGER IF EXISTS sale_payment_status_auto_update ON mandi.ledger_entries;
CREATE TRIGGER sale_payment_status_auto_update AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries FOR EACH ROW EXECUTE FUNCTION mandi.update_sale_payment_status_from_ledger();

DROP TRIGGER IF EXISTS trg_arrival_payment_status ON mandi.ledger_entries;
CREATE TRIGGER trg_arrival_payment_status AFTER INSERT OR UPDATE OR DELETE ON mandi.ledger_entries FOR EACH ROW EXECUTE FUNCTION mandi.auto_update_arrival_payment_status();
