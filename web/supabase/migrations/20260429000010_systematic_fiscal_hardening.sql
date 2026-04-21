-- Migration: 20260429000010_systematic_fiscal_hardening.sql

BEGIN;

-- 1. Schema Hardening: Ensure all future records are visible by default
ALTER TABLE mandi.ledger_entries ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE mandi.vouchers ALTER COLUMN status SET DEFAULT 'active';

-- 2. Systematic Engine Upgrade: post_arrival_ledger
-- Removed all safety 'returns' that were causing records to be missed
-- Added strict account enforcement
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

    -- A. SYSTEMATIC RE-CALCULATION (No more stale values)
    FOR v_temp_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id
    LOOP
        PERFORM mandi.refresh_lot_payment_status(v_temp_lot.id);
    END LOOP;

    -- B. HARDENED ACCOUNT LOOKUPS (Throws error if missing)
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'inventory' OR name ILIKE '%Stock%' OR code = '1200')
    ORDER BY (account_sub_type = 'inventory') DESC LIMIT 1;

    SELECT id INTO v_ap_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'accounts_payable' OR name ILIKE '%Payable%' OR name ILIKE '%Farmer%' OR code = '2100')
    ORDER BY (account_sub_type = 'accounts_payable') DESC LIMIT 1;

    IF v_inventory_acc_id IS NULL OR v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'System Error: Critical accounts (Stock or Payable) missing for Org %. Please check Account Settings.', v_org_id;
    END IF;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'cash' OR name ILIKE 'Cash%' OR code = '1001')
    ORDER BY (code = '1001') DESC LIMIT 1;

    SELECT id INTO v_bank_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'bank' OR name ILIKE 'Bank%' OR code = '1002')
    ORDER BY (code = '1002') DESC LIMIT 1;

    -- C. GATHER TOTALS (Total Udhaar or Cash)
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;
    v_total_payable := COALESCE(v_total_payable, 0);

    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.bill_no::text, 'NEW');
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names FROM mandi.lots l JOIN mandi.commodities i ON l.item_id = i.id WHERE l.arrival_id = p_arrival_id;
    v_narration := 'Purchase Bill #' || v_bill_label || ' | ' || COALESCE(v_item_names, 'Goods');

    -- D. CLEANUP PREVIOUS ATTEMPTS
    DELETE FROM mandi.ledger_entries WHERE arrival_id = p_arrival_id;
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- E. SYSTEMATIC VOUCHER & LEDGER CREATION
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, status)
    VALUES (v_org_id, v_arrival.arrival_date, 'purchase', v_next_v_no, v_total_payable, v_narration, v_party_id, p_arrival_id, p_arrival_id, 'active')
    RETURNING id INTO v_purchase_voucher_id;

    -- Debit (Stock Value)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

    -- Credit (Party Liability)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
    VALUES (v_org_id, v_purchase_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id, 'active');

    -- F. SYSTEMATIC HANDLING OF ADVANCES
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        v_payment_acc_id := CASE WHEN LOWER(COALESCE(v_arrival.advance_payment_mode, 'cash')) IN ('bank', 'upi', 'cheque') THEN COALESCE(v_bank_acc_id, v_cash_acc_id) ELSE v_cash_acc_id END;
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';
        
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, payment_mode, status)
        VALUES (v_org_id, v_arrival.arrival_date, 'payment', v_next_v_no, v_arrival.advance_amount, 'Advance on Bill #' || v_bill_label, v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, 'active')
        RETURNING id INTO v_payment_voucher_id;

        -- Party Debit
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, entry_date, debit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid on Bill #' || v_bill_label, 'payment', p_arrival_id, p_arrival_id, 'active');

        -- Asset Credit (Cash/Bank)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, entry_date, credit, description, transaction_type, arrival_id, reference_id, status)
        VALUES (v_org_id, v_payment_voucher_id, v_payment_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 'Advance Paid on Bill #' || v_bill_label, 'payment', p_arrival_id, p_arrival_id, 'active');
    END IF;
END;
$function$;

COMMIT;
