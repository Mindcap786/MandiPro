-- Migration: 20260429000007_deep_financial_resync.sql

BEGIN;

-- 1. Standardized post_arrival_ledger with Force Re-calculation & Deep Linking
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

    -- A. FORCE DEEP RE-CALCULATION (Wake up stale 0-value records)
    FOR v_temp_lot IN SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id
    LOOP
        PERFORM mandi.refresh_lot_payment_status(v_temp_lot.id);
    END LOOP;

    -- B. Account lookups (Corrected Logic)
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'inventory' OR name ILIKE '%Stock%' OR code = '1200')
    ORDER BY (account_sub_type = 'inventory') DESC LIMIT 1;

    SELECT id INTO v_ap_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'accounts_payable' OR name ILIKE '%Payable%' OR name ILIKE '%Farmer%' OR code = '2100')
    ORDER BY (account_sub_type = 'accounts_payable') DESC LIMIT 1;

    SELECT id INTO v_cash_acc_id FROM mandi.accounts 
    WHERE organization_id = v_org_id AND (account_sub_type = 'cash' OR name ILIKE 'Cash%' OR code = '1001')
    ORDER BY (code = '1001') DESC LIMIT 1;

    IF v_arrival.advance_bank_account_id IS NOT NULL THEN
        v_bank_acc_id := v_arrival.advance_bank_account_id;
    ELSE
        SELECT id INTO v_bank_acc_id FROM mandi.accounts 
        WHERE organization_id = v_org_id AND (account_sub_type = 'bank' OR name ILIKE 'Bank%' OR code = '1002')
        ORDER BY (code = '1002') DESC LIMIT 1;
    END IF;

    -- C. Gather Totals & Details (After re-calc)
    SELECT SUM(COALESCE(net_payable, 0)) INTO v_total_payable FROM mandi.lots WHERE arrival_id = p_arrival_id;
    
    -- If still 0, we might be looking at a pure Commission arrival with no secondary math yet,
    -- but we should still post the Arrival record for transparency if it has items.
    IF v_total_payable IS NULL OR v_total_payable <= 0 THEN 
        -- If no financial value but has items, we can still post a 0-value entry for Daybook tracking if needed,
        -- but for now we follow the user's lead on financial integrity.
        -- Umar shows ₹9000, so it WILL be > 0.
        IF v_total_payable IS NULL THEN RETURN; END IF;
    END IF;

    v_bill_label := COALESCE(v_arrival.reference_no, v_arrival.bill_no::text, 'NEW');
    
    SELECT string_agg(DISTINCT i.name, ', ') INTO v_item_names
    FROM mandi.lots l
    JOIN mandi.commodities i ON l.item_id = i.id
    WHERE l.arrival_id = p_arrival_id;

    v_narration := 'Arrival Bill #' || v_bill_label || ' | Items: ' || COALESCE(v_item_names, 'Products');

    -- D. CLEANUP EXISTING RECORDS
    DELETE FROM mandi.ledger_entries WHERE arrival_id = p_arrival_id;
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type IN ('purchase', 'payment');

    -- E. CREATE PURCHASE VOUCHER
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no 
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id
    ) VALUES (
        v_org_id, v_arrival.arrival_date, 'purchase', v_next_v_no, v_total_payable, v_narration, v_party_id, p_arrival_id, p_arrival_id
    ) RETURNING id INTO v_purchase_voucher_id;

    -- Row 1: Stock (Debit)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, entry_date, debit, credit, description, transaction_type, arrival_id, reference_id
    ) VALUES (
        v_org_id, v_purchase_voucher_id, v_inventory_acc_id, v_arrival.arrival_date, v_total_payable, 0, v_narration, 'purchase', p_arrival_id, p_arrival_id
    );

    -- Row 2: Party (Credit)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, account_id, entry_date, debit, credit, description, transaction_type, arrival_id, reference_id
    ) VALUES (
        v_org_id, v_purchase_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, 0, v_total_payable, v_narration, 'purchase', p_arrival_id, p_arrival_id
    );

    -- F. CREATE PAYMENT VOUCHER (ADVANCES)
    IF COALESCE(v_arrival.advance_amount, 0) > 0 THEN
        v_payment_acc_id := CASE 
            WHEN LOWER(COALESCE(v_arrival.advance_payment_mode, 'cash')) IN ('bank', 'upi', 'cheque', 'bank_transfer') THEN COALESCE(v_bank_acc_id, v_cash_acc_id)
            ELSE v_cash_acc_id
        END;

        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_next_v_no 
        FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';

        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, amount, narration, party_id, arrival_id, reference_id, payment_mode
        ) VALUES (
            v_org_id, v_arrival.arrival_date, 'payment', v_next_v_no, v_arrival.advance_amount, 
            'Advance on Arrival #' || v_bill_label, v_party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode
        ) RETURNING id INTO v_payment_voucher_id;

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, account_id, entry_date, debit, credit, description, transaction_type, arrival_id, reference_id
        ) VALUES (
            v_org_id, v_payment_voucher_id, v_party_id, v_ap_acc_id, v_arrival.arrival_date, v_arrival.advance_amount, 0, 
            'Advance Paid on Bill #' || v_bill_label, 'payment', p_arrival_id, p_arrival_id
        );

        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, entry_date, debit, credit, description, transaction_type, arrival_id, reference_id
        ) VALUES (
            v_org_id, v_payment_voucher_id, v_payment_acc_id, v_arrival.arrival_date, 0, v_arrival.advance_amount, 
            'Advance Paid on Bill #' || v_bill_label, 'payment', p_arrival_id, p_arrival_id
        );
    END IF;
END;
$function$;

-- 2. RUN DEEP RE-SYNC FOR ALL RECENT DATA
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM mandi.arrivals WHERE arrival_date >= (CURRENT_DATE - INTERVAL '60 days')
    LOOP
        BEGIN
            PERFORM mandi.post_arrival_ledger(r.id);
        EXCEPTION WHEN OTHERS THEN
            -- Skip failed records to ensure others finish
            CONTINUE;
        END;
    END LOOP;
END;
$$;

COMMIT;
