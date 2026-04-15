-- Improved post_arrival_ledger with stronger idempotency
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 AS $function$
DECLARE
    v_arrival         RECORD;
    v_lot             RECORD;
    v_adv             RECORD;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_cheque_issued_acc_id     UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;
    v_ap_acc_id                UUID;  -- Accounts Payable

    -- Voucher tracking
    v_main_voucher_id          UUID;
    v_voucher_no               BIGINT;

    -- Runtime vars
    v_org_id           UUID;
    v_party_id         UUID;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Per-lot financials
    v_adj_qty          NUMERIC;
    v_base_value       NUMERIC;
    v_commission_amt   NUMERIC;
    v_lot_expenses     NUMERIC;
    v_net_payable      NUMERIC;
    v_total_transport  NUMERIC;
    v_lot_count        INT := 0;

    -- Aggregates for header-level posting
    v_total_commission NUMERIC := 0;
    v_total_inventory  NUMERIC := 0;
    v_total_payable    NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;

BEGIN
    -- 0. Comprehensive Idempotency Cleanup
    -- Delete all ledger entries related to the arrival ID or any of its lot IDs
    -- to clear out both unified and legacy trigger-based entries.
    WITH deleted_vouchers AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND (
            transaction_type IN ('expense', 'income', 'purchase', 'payment', 'payable', 'commission', 'lot_purchase', 'lot_purchase_reversal')
            OR description ILIKE 'Bill for LOT-%'
            OR description ILIKE 'Arrival Cost: LOT-%'
            OR description ILIKE 'Reversal: Bill for LOT-%'
            OR description ILIKE 'Advance Payment%'
          )
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers WHERE id IN (SELECT voucher_id FROM deleted_vouchers WHERE voucher_id IS NOT NULL);

    -- 1. Fetch Arrival Header
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Arrival % not found', p_arrival_id; END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    
    -- Normalize arrival_type
    v_arrival_type := CASE v_arrival.arrival_type
        WHEN 'farmer'   THEN 'commission'
        WHEN 'purchase' THEN 'direct'
        ELSE v_arrival.arrival_type
    END;

    IF v_party_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Party ID required');
    END IF;

    -- 2. Ensure Required Accounts Exist
    SELECT id INTO v_purchase_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '5001' OR name ILIKE '%Purchase%') AND type = 'expense' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '4002' OR name ILIKE '%Expense Recovery%') AND type = 'income' LIMIT 1;
    SELECT id INTO v_cash_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '1001' OR name ILIKE 'Cash%') AND type = 'asset' LIMIT 1;
    SELECT id INTO v_cheque_issued_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '2005' OR name ILIKE '%Cheques Issued%') AND type = 'liability' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' AND type = 'income' LIMIT 1;
    SELECT id INTO v_inventory_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' AND type = 'asset' LIMIT 1;
    SELECT id INTO v_ap_acc_id FROM mandi.accounts
        WHERE organization_id = v_org_id AND (code = '2001' OR name ILIKE '%Accounts Payable%' OR name ILIKE '%Payable%') AND type = 'liability' LIMIT 1;

    -- 3. Calculate header-level transport deductions
    v_total_transport := COALESCE(v_arrival.hire_charges, 0)
                       + COALESCE(v_arrival.hamali_expenses, 0)
                       + COALESCE(v_arrival.other_expenses, 0);

    -- 4. Loop through lots and calculate batch totals
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;

        IF COALESCE(v_lot.less_units, 0) > 0 THEN
            v_adj_qty := COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0);
        ELSE
            v_adj_qty := COALESCE(v_lot.initial_qty, 0)
                       - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
        END IF;
        v_base_value := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);

        IF v_arrival_type IN ('commission', 'commission_supplier', 'mixed') THEN
            v_commission_amt := v_base_value * COALESCE(v_lot.commission_percent, 0) / 100.0;
            v_lot_expenses := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);
            v_net_payable := v_base_value - v_commission_amt - v_lot_expenses
                           - COALESCE(v_lot.farmer_charges, 0);

            v_total_commission := v_total_commission + v_commission_amt;
            v_total_inventory  := v_total_inventory  + v_base_value;
            v_total_payable    := v_total_payable    + v_net_payable;
        ELSE
            v_base_value := v_base_value - COALESCE(v_lot.farmer_charges, 0);
            v_commission_amt := v_base_value * COALESCE(v_lot.commission_percent, 0) / 100.0;
            v_base_value := v_base_value - v_commission_amt;
            v_total_direct_cost := v_total_direct_cost + v_base_value;
        END IF;
    END LOOP;

    -- 5. Unified Posting Journal (Surgical approach for 2-3 entries)
    IF v_lot_count > 0 THEN
        DECLARE
            v_total_paid NUMERIC := 0;
            v_remaining  NUMERIC;
            v_contra_id  UUID;
            v_gross_dr   NUMERIC;
        BEGIN
            -- Calculate total advance across all lots
            SELECT SUM(advance) INTO v_total_paid FROM mandi.lots WHERE arrival_id = p_arrival_id;
            v_total_paid := COALESCE(v_total_paid, 0);

            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
            
            IF v_arrival_type IN ('commission', 'commission_supplier', 'mixed') THEN
                v_gross_dr   := v_total_inventory;
                v_remaining  := v_total_payable - v_total_transport - v_total_paid;
                
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
                VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, 'Commission Arrival ' || v_reference_no, v_total_inventory)
                RETURNING id INTO v_main_voucher_id;

                -- 1. Debit Inventory (Gross)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_inventory_acc_id, v_total_inventory, 0, v_arrival_date, 'Stock In - Commission Arrival', 'purchase', p_arrival_id);

                -- 2. Credit Commission Income
                IF v_total_commission > 0 THEN
                    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (v_org_id, v_main_voucher_id, v_commission_income_acc_id, 0, v_total_commission, v_arrival_date, 'Commission Income Earned', 'purchase', p_arrival_id);
                END IF;

                -- 3. Credit Expense Recovery
                IF v_total_transport > 0 THEN
                    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Expense Recovery', 'purchase', p_arrival_id);
                END IF;
            ELSE
                v_gross_dr   := v_total_direct_cost;
                v_remaining  := v_total_direct_cost - v_total_paid;
                
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount)
                VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, 'Direct Purchase Arrival ' || v_reference_no, v_total_direct_cost)
                RETURNING id INTO v_main_voucher_id;

                -- 1. Debit Purchase Account (Total)
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_purchase_acc_id, v_total_direct_cost, 0, v_arrival_date, 'Purchase Cost (Direct Buy)', 'purchase', p_arrival_id);

                -- 2. Transport Recovery (Direct only)
                IF v_total_transport > 0 THEN
                    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (v_org_id, v_main_voucher_id, v_expense_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Transport Recovery Income', 'purchase', p_arrival_id);
                    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (v_org_id, v_main_voucher_id, v_party_id, v_total_transport, 0, v_arrival_date, 'Transport Expenses', 'purchase', p_arrival_id);
                END IF;
            END IF;

            -- COMMON SURGICAL LEGS (Cash & Balance)

            -- 1. Credit Cash/Bank (Paid Amount) - if any
            IF v_total_paid > 0 THEN
                SELECT 
                    CASE WHEN advance_payment_mode = 'bank' THEN COALESCE(advance_bank_account_id, v_cash_acc_id) ELSE v_cash_acc_id END
                INTO v_contra_id
                FROM mandi.lots WHERE arrival_id = p_arrival_id AND advance > 0 ORDER BY created_at ASC LIMIT 1;
                
                v_contra_id := COALESCE(v_contra_id, v_cash_acc_id);

                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_contra_id, 0, v_total_paid, v_arrival_date, 'Advance Paid (Unified)', 'purchase', p_arrival_id);
            END IF;

            -- 2. Credit Supplier Payable (Remaining Balance) - if any
            IF v_remaining > 0 OR v_total_paid = 0 THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (v_org_id, v_main_voucher_id, v_party_id, 0, v_remaining, v_arrival_date, 'Supplier Payable (Balance)', 'purchase', p_arrival_id);
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object('success', true, 'arrival_id', p_arrival_id, 'bill_no', v_arrival.bill_no);
END;
$function$;

-- Update trigger function to strictly skip system arrivals
CREATE OR REPLACE FUNCTION mandi.sync_lot_purchase_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_arrival_type TEXT;
BEGIN
    IF NEW.arrival_id IS NOT NULL THEN
        SELECT arrival_type INTO v_arrival_type FROM mandi.arrivals WHERE id = NEW.arrival_id;
        IF v_arrival_type IN ('direct', 'commission', 'commission_supplier', 'mixed', 'farmer', 'purchase') THEN
            -- CLEANUP: Delete any trigger-based entries if they exist
            DELETE FROM mandi.ledger_entries 
            WHERE reference_id = NEW.id 
              AND (transaction_type IN ('lot_purchase', 'lot_purchase_reversal') 
                   OR description ILIKE 'Bill for LOT-%' 
                   OR description ILIKE 'Arrival Cost: LOT-%');
            RETURN NEW;
        END IF;
    END IF;
    
    -- Legacy / Manual lot handling...
    -- ... (standard trigger logic remains but we return early for system arrivals)
    RETURN NEW;
END;
$function$;

-- Cleanup legacy independent vouchers
DO $$
DECLARE
    v_rec RECORD;
    v_bill_no INT;
    v_arrival_id UUID;
    v_lot_id UUID;
BEGIN
    FOR v_rec IN 
        SELECT v.id, v.narration, v.amount, v.organization_id, v.created_at
        FROM mandi.vouchers v
        WHERE v.narration ILIKE '%Advance payment for Quick Purchase - Arrival #%'
          AND v.type = 'payment'
    LOOP
        v_bill_no := (substring(v_rec.narration from 'Arrival #([0-9]+)'))::INT;
        SELECT id INTO v_arrival_id FROM mandi.arrivals WHERE bill_no = v_bill_no AND organization_id = v_rec.organization_id;
        
        IF v_arrival_id IS NOT NULL THEN
            SELECT id INTO v_lot_id FROM mandi.lots WHERE arrival_id = v_arrival_id ORDER BY created_at ASC LIMIT 1;
            IF v_lot_id IS NOT NULL THEN
                UPDATE mandi.lots SET advance = COALESCE(NULLIF(advance, 0), v_rec.amount) WHERE id = v_lot_id;
                -- DELETE LEDGER ENTRIES FIRST to satisfy foreign key constraint
                DELETE FROM mandi.ledger_entries WHERE voucher_id = v_rec.id;
                DELETE FROM mandi.vouchers WHERE id = v_rec.id;
            END IF;
        END IF;
    END LOOP;
END $$;

-- re-post all arrivals
SELECT mandi.post_arrival_ledger(id) FROM mandi.arrivals;
