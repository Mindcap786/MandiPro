
-- [1] Stabilized post_arrival_ledger with proper metadata and payment vouchers
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival RECORD;
    v_purchase_acc_id UUID;
    v_ap_acc_id UUID;
    v_liquid_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_recovery_acc_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_gross_purchase NUMERIC := 0;
    v_net_payable NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_total_exp NUMERIC := 0;
    v_advance_paid NUMERIC := 0;
    v_summary_narration TEXT;
    v_payment_mode TEXT;
    v_is_cleared BOOLEAN;
BEGIN
    -- Fetch arrival details
    SELECT a.*, c.name as party_name FROM mandi.arrivals a 
    LEFT JOIN mandi.contacts c ON a.party_id = c.id 
    WHERE a.id = p_arrival_id INTO v_arrival;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;

    -- Resolve accounts
    v_purchase_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'cost_of_goods', '%Purchase%', '5001');
    v_ap_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'payable', '%Payable%', '2100');
    v_comm_income_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'commission', '%Commission%', '4003');
    v_recovery_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'fees', '%Recovery%', '4002');

    -- Sum up lot details
    SELECT 
        SUM(COALESCE(initial_qty * supplier_rate, 0)), 
        SUM(COALESCE(initial_qty * supplier_rate * (COALESCE(commission_percent, 0) / 100.0), 0)),
        SUM(COALESCE(advance, 0))
    INTO v_gross_purchase, v_total_comm, v_advance_paid
    FROM mandi.lots WHERE arrival_id = p_arrival_id;

    v_total_exp := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_net_payable := v_gross_purchase - v_total_comm - v_total_exp;
    v_payment_mode := LOWER(COALESCE(v_arrival.advance_payment_mode, 'credit'));
    v_is_cleared := COALESCE(v_arrival.advance_cheque_status, false);

    -- Clean old entries
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_arrival_id;
    
    v_summary_narration := 'Arrival Bill #' || COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text);
    IF v_arrival.vehicle_number IS NOT NULL THEN v_summary_narration := v_summary_narration || ' | Veh: ' || v_arrival.vehicle_number; END IF;

    -- --- VOUCHER 1: PURCHASE (Journal) ---
    SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type = 'purchase' LIMIT 1;
    IF v_voucher_id IS NULL THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id;
        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount, 
            party_id, arrival_id, reference_id, payment_mode
        ) 
        VALUES (
            v_arrival.organization_id, v_arrival.arrival_date, 'purchase', v_voucher_no, v_summary_narration, v_gross_purchase, 
            v_arrival.party_id, p_arrival_id, p_arrival_id, 'udhaar' -- Force udhaar to avoid duplication
        ) 
        RETURNING id INTO v_voucher_id;
    ELSE
        UPDATE mandi.vouchers SET narration = v_summary_narration, amount = v_gross_purchase, party_id = v_arrival.party_id, payment_mode = 'udhaar' WHERE id = v_voucher_id;
    END IF;

    -- Post Purchase Ledger (DR Purchase/Inventory, CR Payable)
    IF v_gross_purchase > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_purchase_acc_id, v_gross_purchase, 0, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    END IF;
    
    IF v_net_payable > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_ap_acc_id, 0, v_net_payable, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    END IF;

    -- --- VOUCHER 2: PAYMENT (The Advance) ---
    IF v_advance_paid > 0 THEN
        IF v_payment_mode = 'cash' THEN 
            v_liquid_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'cash', '%Cash%', '1001');
        ELSE 
            v_liquid_acc_id := COALESCE(v_arrival.advance_bank_account_id, mandi.resolve_account_robust(v_arrival.organization_id, 'bank', '%Bank%', '1002'));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type = 'payment' LIMIT 1;
            
            IF v_voucher_id IS NULL THEN
                SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id;
                INSERT INTO mandi.vouchers (
                    organization_id, date, type, voucher_no, narration, amount, 
                    party_id, arrival_id, reference_id, payment_mode, bank_account_id,
                    cheque_no, cheque_date, bank_name, cheque_status, is_cleared, cleared_at
                ) 
                VALUES (
                    v_arrival.organization_id, v_arrival.arrival_date, 'payment', v_voucher_no, 'Advance against Arrival #' || COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text), v_advance_paid, 
                    v_arrival.party_id, p_arrival_id, p_arrival_id, v_arrival.advance_payment_mode, v_liquid_acc_id,
                    v_arrival.advance_cheque_no, v_arrival.advance_cheque_date, v_arrival.advance_bank_name, 
                    CASE WHEN v_is_cleared THEN 'Cleared' ELSE 'Pending' END,
                    v_is_cleared,
                    CASE WHEN v_is_cleared THEN v_arrival.arrival_date ELSE NULL END
                )
                RETURNING id INTO v_voucher_id;
            ELSE
                UPDATE mandi.vouchers SET 
                    narration = 'Advance against Arrival #' || COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text), 
                    amount = v_advance_paid, 
                    party_id = v_arrival.party_id, 
                    bank_account_id = v_liquid_acc_id,
                    payment_mode = v_arrival.advance_payment_mode,
                    cheque_no = v_arrival.advance_cheque_no,
                    cheque_date = v_arrival.advance_cheque_date,
                    bank_name = v_arrival.advance_bank_name,
                    cheque_status = CASE WHEN v_is_cleared THEN 'Cleared' ELSE 'Pending' END,
                    is_cleared = v_is_cleared,
                    cleared_at = CASE WHEN v_is_cleared THEN v_arrival.arrival_date ELSE cleared_at END
                WHERE id = v_voucher_id;
            END IF;

            -- Post Payment Ledger IF CLEARED or CASH/UPI
            IF v_payment_mode IN ('cash', 'upi', 'bank', 'upi/bank') OR (v_payment_mode = 'cheque' AND v_is_cleared) THEN
                -- DR Payable Account (Liability decreases)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
                VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_ap_acc_id, v_advance_paid, 0, v_arrival.arrival_date, 'Advance payment for Arrival #' || COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text), 'payment', p_arrival_id);
                
                -- CR Liquid Account (Cash/Bank decreases)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
                VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_liquid_acc_id, 0, v_advance_paid, v_arrival.arrival_date, 'Advance payment for Arrival #' || COALESCE(v_arrival.contact_bill_no::text, v_arrival.bill_no::text), 'payment', p_arrival_id);
            END IF;
        END IF;
    END IF;

    UPDATE mandi.arrivals SET status = 'completed' WHERE id = p_arrival_id;
    RETURN jsonb_build_object('success', true, 'net_payable', v_net_payable, 'advance', v_advance_paid);
END;
$$;
