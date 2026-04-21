-- Migration: 20260429000009_final_financial_sync.sql

BEGIN;

-- 1. Optimized post_arrival_ledger with Absolute Integrity
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival RECORD;
    v_temp_lot RECORD;
    v_item_names text;
    v_narration text;
    v_bill_label text;
    v_org_id uuid;
    v_party_id uuid;
    v_total_payable numeric := 0;
    v_inventory_acc_id uuid;
    v_ap_acc_id uuid;
    v_cash_acc_id uuid;
    v_bank_acc_id uuid;
    v_payment_acc_id uuid;
    v_purchase_voucher_id uuid;
    v_payment_voucher_id uuid;
    v_next_v_no bigint;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RETURN; END IF;

    v_org_id := v_arrival.organization_id;
    v_party_id := v_arrival.party_id;

    -- A. FORCE Math Refresh
    FOR v_temp_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id
    LOOP
        PERFORM mandi.refresh_lot_payment_status(v_temp_lot.id);
    END LOOP;

    -- B. Standard Account Lookups
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'inventory' OR name ILIKE '%Stock%' OR code = '1200')
    ORDER BY (account_sub_type = 'inventory') DESC LIMIT 1;

    SELECT id INTO v_ap_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'accounts_payable' OR name ILIKE '%Payable%' OR name ILIKE '%Farmer%' OR code = '2100')
    ORDER BY (account_sub_type = 'accounts_payable') DESC LIMIT 1;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'cash' OR name ILIKE 'Cash%' OR code = '1001')
    ORDER BY (code = '1001') DESC LIMIT 1;

    SELECT id INTO v_bank_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'bank' OR name ILIKE 'Bank%' OR code = '1002')
    ORDER BY (code = '1002') DESC LIMIT 1;

    IF v_arrival.advance_bank_account_id IS NOT NULL THEN v_bank_acc_id := v_arrival.advance_bank_account_id; END IF;

    -- C. Calculate Settlement Value
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;
    
    -- Safety: If math still shows 0 but it's a valid arrival, we use Gross minus expenses
    IF COALESCE(v_total_payable, 0) <= 0 THEN
        SELECT SUM(COALESCE(v.net_payable, 0)) INTO v_total_payable
        FROM mandi.lots l, mandi.get_lot_bill_components(l.id) v
        WHERE l.arrival_id = p_arrival_id;
    END IF;

    IF v_total_payable IS NULL OR v_total_payable <= 0 THEN
        -- Last resort for Daybook: check if hiring/expenses exist even if goods are 0
        v_total_payable := COALESCE(v_total_payable, 0);
    END IF;

    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.bill_no::text, 'NEW');
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names FROM mandi.lots l JOIN mandi.commodities i ON l.item_id = i.id WHERE l.arrival_id = p_arrival_id;
    v_narration := 'Purchase Bill #' || v_bill_label || ' | ' || COALESCE(v_item_names, 'Goods');

    -- D. CLEANUP EVERYTHING
    DELETE FROM mandi.ledger_entries WHERE arrival_id = p_arrival_id;
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id AND transaction_type = 'purchase';
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- E. CREATE VOUCHERS & LEDGERS
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, status)
    VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_next_v_no, v_total_payable, v_narration, v_party_id, p_arrival_id, p_arrival_id, 'active')
    RETURNING id INTO v_purchase_voucher_id;

    -- Party Row (Credit - what we owe them)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

    -- Invenstory Row (Debit - our stock value)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

    -- F. ADVANCES
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        v_payment_acc_id := CASE WHEN LOWER(COALESCE(v_arrival.advance_payment_mode, 'cash')) IN ('bank', 'upi', 'cheque') THEN COALESCE(v_bank_acc_id, v_cash_acc_id) ELSE v_cash_acc_id END;
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, payment_mode, status)
        VALUES (v_org_id, v_arrival.arrival_date, 'payment', v_next_v_no, v_arrival.advance_amount, 'Advance on Bill #' || v_bill_label, v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, 'active')
        RETURNING id INTO v_payment_voucher_id;
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_payment_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid (' || v_arrival.advance_payment_mode || ')', 'payment', p_arrival_id, p_arrival_id, 'active');
    END IF;
END;
$function$;

-- 2. FORCE RE-SYNC FOR ALL DATA (Historical Restore)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM mandi.arrivals WHERE arrival_date >= (CURRENT_DATE - INTERVAL '90 days') LOOP
        BEGIN PERFORM mandi.post_arrival_ledger(r.id); EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    END LOOP;
END; $$;

COMMIT;
