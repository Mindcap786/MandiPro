DROP FUNCTION IF EXISTS mandi.clear_cheque(p_voucher_id uuid, p_bank_account_id uuid, p_clear_date timestamp with time zone);
DROP FUNCTION IF EXISTS mandi.clear_cheque(p_voucher_id uuid, p_clear_date date, p_bank_account_id uuid);
DROP FUNCTION IF EXISTS mandi.clear_cheque(p_voucher_id uuid, p_clear_date timestamp with time zone, p_bank_account_id uuid);

CREATE OR REPLACE FUNCTION mandi.clear_cheque(p_voucher_id uuid, p_bank_account_id uuid, p_clear_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher mandi.vouchers%ROWTYPE;
    v_ledger_count integer := 0;
    v_discount_allowed_acc_id uuid;
    v_discount_received_acc_id uuid;
    v_reference_no text;
    v_balance record;
    v_receipt_txn_type text;
    v_payment_txn_type text;
    v_target_bank_id uuid;
    v_final_contact_id uuid;
BEGIN
    SELECT *
    INTO v_voucher
    FROM mandi.vouchers
    WHERE id = p_voucher_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    IF coalesce(v_voucher.cheque_status, '') = 'Cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cancelled cheque cannot be cleared');
    END IF;

    v_final_contact_id := COALESCE(v_voucher.contact_id, v_voucher.party_id);
    v_target_bank_id := COALESCE(p_bank_account_id, v_voucher.bank_account_id);

    IF v_target_bank_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bank account is required to clear cheque');
    END IF;

    SELECT COUNT(*)
    INTO v_ledger_count
    FROM mandi.ledger_entries
    WHERE voucher_id = p_voucher_id;

    SELECT id
    INTO v_discount_allowed_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_voucher.organization_id
      AND code = '4006'
    LIMIT 1;

    SELECT id
    INTO v_discount_received_acc_id
    FROM mandi.accounts
    WHERE organization_id = v_voucher.organization_id
      AND code = '3003'
    LIMIT 1;

    v_reference_no := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN (
            SELECT coalesce(contact_bill_no, bill_no)::text
            FROM mandi.sales
            WHERE id = v_voucher.invoice_id
        )
        WHEN v_voucher.reference_id IS NOT NULL THEN (
            SELECT coalesce(contact_bill_no, bill_no)::text
            FROM mandi.arrivals
            WHERE id = v_voucher.reference_id
        )
        ELSE v_voucher.voucher_no::text
    END;

    v_receipt_txn_type := CASE
        WHEN v_voucher.invoice_id IS NOT NULL THEN 'sale_payment'
        ELSE 'receipt'
    END;

    v_payment_txn_type := CASE
        WHEN v_voucher.reference_id IS NOT NULL THEN 'purchase'
        WHEN v_voucher.account_id IS NOT NULL AND v_voucher.party_id IS NULL THEN 'expense'
        ELSE 'payment'
    END;

    -- Update Voucher Status first before proceeding with derivations
    UPDATE mandi.vouchers
    SET is_cleared = true,
        cleared_at = p_clear_date,
        cheque_status = 'Cleared',
        bank_account_id = v_target_bank_id
    WHERE id = p_voucher_id;

    -- ONLY process ledger entries manually IF this is NOT an arrival-linked voucher.
    -- (If arrival_id IS NOT NULL, post_arrival_ledger will natively generate the accounting entries!)
    IF v_voucher.arrival_id IS NULL THEN
        -- Only insert ledger entries if they don't exist yet
        IF v_ledger_count = 0 THEN
            IF v_voucher.type = 'receipt' THEN
                -- Leg 1: Debit Bank
                IF v_voucher.amount > 0 THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_target_bank_id, v_voucher.amount,
                        0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                        v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                    );
                END IF;

                -- Discount Allowed (if any)
                IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_discount_allowed_acc_id, v_voucher.discount_amount,
                        0, p_clear_date::date, 'Discount Allowed', v_receipt_txn_type,
                        coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                    );
                END IF;

                -- Leg 2: Credit Party
                IF v_final_contact_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, contact_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_final_contact_id, 0,
                        coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                        p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                        v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                    );
                ELSIF v_voucher.account_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_voucher.account_id, 0,
                        coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                        p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Receipt Cleared'),
                        v_receipt_txn_type, coalesce(v_voucher.reference_id, v_voucher.invoice_id), v_reference_no
                    );
                END IF;

            ELSIF v_voucher.type = 'payment' THEN
                -- Leg 1: Debit Party
                IF v_final_contact_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, contact_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_final_contact_id,
                        coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                        0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                        v_payment_txn_type, v_voucher.reference_id, v_reference_no
                    );
                ELSIF v_voucher.account_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_voucher.account_id,
                        coalesce(v_voucher.amount, 0) + coalesce(v_voucher.discount_amount, 0),
                        0, p_clear_date::date, coalesce(v_voucher.narration, 'Cheque Payment Cleared'),
                        v_payment_txn_type, v_voucher.reference_id, v_reference_no
                    );
                END IF;

                -- Discount Received (if any)
                IF coalesce(v_voucher.discount_amount, 0) > 0 AND v_final_contact_id IS NOT NULL AND v_discount_received_acc_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_discount_received_acc_id, 0,
                        v_voucher.discount_amount, p_clear_date::date, 'Discount Received',
                        v_payment_txn_type, v_voucher.reference_id, v_reference_no
                    );
                END IF;

                -- Leg 2: Credit Bank
                IF v_voucher.amount > 0 THEN
                    INSERT INTO mandi.ledger_entries (
                        organization_id, voucher_id, account_id, debit, credit, entry_date,
                        description, transaction_type, reference_id, reference_no
                    ) VALUES (
                        v_voucher.organization_id, v_voucher.id, v_target_bank_id, 0,
                        v_voucher.amount, p_clear_date::date, 'Cheque Payment Cleared',
                        v_payment_txn_type, v_voucher.reference_id, v_reference_no
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- RE-TRIGGER STATUS UPDATES
    IF v_voucher.invoice_id IS NOT NULL THEN
        SELECT *
        FROM mandi.get_invoice_balance(v_voucher.invoice_id)
        INTO v_balance;

        UPDATE mandi.sales
        SET is_cheque_cleared = true,
            payment_status = CASE
                WHEN coalesce(v_balance.balance_due, 0) <= 0.01 THEN 'paid'
                WHEN coalesce(v_balance.amount_paid, 0) > 0 THEN 'partial'
                ELSE payment_status
            END
        WHERE id = v_voucher.invoice_id;
    END IF;

    -- 2. For Arrivals (Purchases)
    IF v_voucher.arrival_id IS NOT NULL THEN
        UPDATE mandi.lots SET advance_cheque_status = true, advance_bank_account_id = v_target_bank_id WHERE arrival_id = v_voucher.arrival_id AND advance > 0;
        PERFORM mandi.post_arrival_ledger(v_voucher.arrival_id);
    ELSIF v_voucher.reference_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM mandi.arrivals WHERE id = v_voucher.reference_id) THEN
            UPDATE mandi.lots SET advance_cheque_status = true, advance_bank_account_id = v_target_bank_id WHERE arrival_id = v_voucher.reference_id AND advance > 0;
            PERFORM mandi.post_arrival_ledger(v_voucher.reference_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cheque cleared successfully');
END;
$function$;


CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival         RECORD;
    v_lot             RECORD;
    v_org_id           UUID;
    v_party_id         UUID;
    v_party_name       TEXT;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;

    -- Financial aggregates
    v_total_commission NUMERIC := 0;
    v_total_inventory  NUMERIC := 0;
    v_total_payable    NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport  NUMERIC := 0;
    v_total_paid_advance NUMERIC := 0;
    v_lot_count        INT := 0;
    
    -- Cheque and Payment Tracking
    v_main_voucher_id  UUID;
    v_payment_voucher_id UUID;
    v_main_voucher_no  BIGINT;
    v_pay_voucher_no   BIGINT;
    v_contra_acc_id    UUID;
    v_check_no         TEXT;
    v_check_date       DATE;
    v_is_cleared       BOOLEAN := false;
    v_cheque_status    TEXT;
    v_bank_name        TEXT;
    v_payment_mode     TEXT;

    -- Status Tracking
    v_gross_bill       NUMERIC := 0;
    v_paid_cleared     NUMERIC := 0;
    v_pending_cheques_count INT := 0;
    v_final_status     TEXT := 'pending';

BEGIN
    -- 0. Header & Cleanup
    SELECT a.*, c.name as party_name INTO v_arrival 
    FROM mandi.arrivals a 
    JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival or Party not found'); END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;
    v_party_name   := v_arrival.party_name;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type WHEN 'farmer' THEN 'commission' WHEN 'purchase' THEN 'direct' ELSE v_arrival.arrival_type END;

    -- Locate existing advance payment voucher to avoid duplication
    SELECT id INTO v_payment_voucher_id
    FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id
      AND type IN ('payment', 'cheque')
      AND narration LIKE 'Payment for Arrival %'
    ORDER BY created_at ASC
    LIMIT 1;

    -- Cleanup current Arrival ledger entries and linked vouchers
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers 
    WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL)
      AND id != COALESCE(v_payment_voucher_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- ALSO cleanup any ledger entries attached to the advance payment voucher
    -- (this cleans up 'payment' type ledger entries generated by clear_cheque)
    IF v_payment_voucher_id IS NOT NULL THEN
        DELETE FROM mandi.ledger_entries WHERE voucher_id = v_payment_voucher_id;
    END IF;

    -- 2. Accounts
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '5001' OR name ILIKE '%Purchase%') LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '4002' OR name ILIKE '%Expense Recovery%') LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE 'Cash%') LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    -- 3. Aggregates
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE WHEN COALESCE(v_lot.less_units, 0) > 0 THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0) ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0) END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            v_total_paid_advance := v_total_paid_advance + COALESCE(v_lot.advance, 0);
            
            -- Capture advance payment details
            IF v_lot.advance > 0 AND v_contra_acc_id IS NULL THEN
                v_payment_mode := COALESCE(v_lot.advance_payment_mode, 'cash');
                v_contra_acc_id := CASE WHEN v_payment_mode IN ('bank', 'cheque', 'UPI/BANK', 'upi') THEN COALESCE(v_lot.advance_bank_account_id, v_cash_acc_id) ELSE v_cash_acc_id END;
                v_check_no := v_lot.advance_cheque_no;
                v_check_date := v_lot.advance_cheque_date;
                v_bank_name := v_lot.advance_bank_name;
                
                IF v_payment_mode IN ('cash', 'bank', 'UPI/BANK', 'upi') THEN
                    v_is_cleared := true;
                    v_cheque_status := 'Cleared';
                ELSIF v_payment_mode IN ('cheque') THEN
                    v_is_cleared := COALESCE(v_lot.advance_cheque_status, false);
                    v_cheque_status := CASE WHEN v_is_cleared THEN 'Cleared' ELSE 'Pending' END;
                END IF;
            END IF;

            IF v_arrival_type = 'commission' THEN
                DECLARE
                    v_comm NUMERIC := v_val * COALESCE(v_lot.commission_percent, 0) / 100.0;
                    v_exp  NUMERIC := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);
                BEGIN
                    v_total_commission := v_total_commission + v_comm;
                    v_total_inventory  := v_total_inventory  + v_val;
                    v_total_payable    := v_total_payable    + (v_val - v_comm - v_exp - COALESCE(v_lot.farmer_charges, 0));
                END;
            ELSE
                DECLARE
                    v_comm NUMERIC := (v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0;
                BEGIN
                    v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                    v_total_commission  := v_total_commission + v_comm;
                END;
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN RETURN jsonb_build_object('success', true, 'msg', 'No lots'); END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0) + COALESCE(v_arrival.hamali_expenses, 0) + COALESCE(v_arrival.other_expenses, 0);
    v_contra_acc_id := COALESCE(v_contra_acc_id, v_cash_acc_id);
    v_gross_bill := (CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END) - v_total_transport - v_total_commission;

    -- 4. Post Primary Arrival Voucher
    BEGIN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_main_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
        
        -- CREATE PURCHASE VOUCHER (Does not carry cheque state, only records the total bill)
        INSERT INTO mandi.vouchers (
            organization_id, date, type, voucher_no, narration, amount,
            party_id, arrival_id
        ) VALUES (
            v_org_id, v_arrival_date, 'purchase', v_main_voucher_no, 'Arrival ' || v_reference_no, CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END,
            v_party_id, p_arrival_id
        ) RETURNING id INTO v_main_voucher_id;

        -- Purchase/Inventory Leg
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END, 0, v_arrival_date, 'Fruit Value', 'purchase', p_arrival_id);
        
        -- Party Credit (Full Bill)
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
        VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, CASE WHEN v_arrival_type = 'commission' THEN v_total_inventory ELSE v_total_direct_cost END, v_arrival_date, 'Arrival Entry', 'purchase', p_arrival_id);

        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
            
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id);
        END IF;

        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id);
            
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id);
        END IF;

        -- CREATE INDEPENDENT PAYMENT VOUCHER FOR THE ADVANCE (UPSERT)
        IF v_total_paid_advance > 0 THEN
            IF v_payment_voucher_id IS NULL THEN
                -- Get highest payment/receipt/cheque voucher series to keep numbering clean
                SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_pay_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type IN ('payment', 'cheque');

                INSERT INTO mandi.vouchers (
                    organization_id, date, type, voucher_no, narration, amount,
                    cheque_no, cheque_date, bank_name, is_cleared, cheque_status,
                    party_id, arrival_id, payment_mode
                ) VALUES (
                    v_org_id, v_arrival_date, 'payment', v_pay_voucher_no, 'Payment for Arrival ' || v_reference_no, v_total_paid_advance,
                    v_check_no, v_check_date, v_bank_name, v_is_cleared, v_cheque_status, v_party_id, p_arrival_id, v_payment_mode
                ) RETURNING id INTO v_payment_voucher_id;
            ELSE
                -- Update the existing voucher instead of creating a new one
                UPDATE mandi.vouchers SET
                    date = v_arrival_date,
                    amount = v_total_paid_advance,
                    cheque_no = v_check_no,
                    cheque_date = v_check_date,
                    bank_name = v_bank_name,
                    is_cleared = v_is_cleared,
                    cheque_status = v_cheque_status,
                    party_id = v_party_id,
                    payment_mode = v_payment_mode
                WHERE id = v_payment_voucher_id;
            END IF;

            -- CRITICAL: Only log ledger entries if the cheque is CLEAR. Otherwise wait for clearing.
            IF COALESCE(v_is_cleared, false) = true THEN
                -- Offset Debits linked to payment voucher
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_payment_voucher_id, v_party_id, v_total_paid_advance, 0, v_arrival_date, 'Paid to Party', 'purchase', p_arrival_id);
                
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_payment_voucher_id, v_contra_acc_id, 0, v_total_paid_advance, v_arrival_date, 'Payment Recorded', 'purchase', p_arrival_id);
            END IF;
        END IF;

    END;

    -- 5. FINAL STATUS CALCULATION (ROBUST AS PER SALES MODULE)
    -- Sum all CLEARED payments linked to this arrival
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_cleared 
    FROM mandi.vouchers 
    WHERE (arrival_id = p_arrival_id OR reference_id = p_arrival_id)
      AND type IN ('payment', 'receipt', 'cheque')
      AND is_cleared = true;

    -- Check for ANY pending cheques
    SELECT COUNT(*) INTO v_pending_cheques_count
    FROM mandi.vouchers
    WHERE (arrival_id = p_arrival_id OR reference_id = p_arrival_id)
      AND type IN ('payment', 'receipt', 'cheque')
      AND COALESCE(is_cleared, false) = false
      AND (cheque_no IS NOT NULL OR cheque_date IS NOT NULL);

    -- Status Logic:
    IF v_pending_cheques_count > 0 THEN
        IF v_paid_cleared > 0 THEN
            v_final_status := 'partial';
        ELSE
            v_final_status := 'pending';
        END IF;
    ELSIF v_paid_cleared >= (v_gross_bill - 0.01) AND (v_gross_bill > 0 OR v_paid_cleared > 0) THEN
        v_final_status := 'paid';
    ELSIF v_paid_cleared > 0 THEN
        v_final_status := 'partial';
    ELSE
        v_final_status := 'pending';
    END IF;

    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills SET payment_status = v_final_status WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'status', v_final_status);
END;
$function$;
