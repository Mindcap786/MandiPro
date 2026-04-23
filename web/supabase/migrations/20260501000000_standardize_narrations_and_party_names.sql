-- ============================================================================
-- MANDI LEDGER NARRATION & PARTY NAME STANDARDIZATION (v6.0)
-- 
-- Goal: Ensure party names (Buyer/Farmer) are correctly associated with all
--       ledger legs and standardize narrations to avoid discrepancies.
-- ============================================================================

BEGIN;

-- 1. Hardened Sales Posting Engine (Ensures Receipt Narrations match Bill No)
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

    -- Calculate received amount from existing vouchers
    SELECT COALESCE(SUM(amount), 0) INTO v_received 
    FROM mandi.vouchers 
    WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt');

    IF v_received = 0 THEN
        v_received := COALESCE(v_sale.amount_received, 0);
    END IF;

    IF v_received = 0 AND v_payment_mode IN ('cash', 'upi', 'bank', 'upi/bank', 'upi_bank') THEN
        v_received := v_total_inc_tax;
    END IF;

    -- 2. Resolve Accounts
    v_rev_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'sales', '%Sales Revenue%', '4001');
    v_ar_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'receivable', '%Receivable%', '1200');

    -- 3. Clean ONLY the Sale/Invoice part (Idempotency)
    -- We keep the vouchers but will update them if they exist to maintain correct narrations
    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id;
    
    v_summary_narration := 'Sale Bill #' || v_sale.bill_no || ' | Items Sold';

    -- Check for existing Sale Voucher
    SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type = 'sale' LIMIT 1;
    
    IF v_voucher_id IS NULL THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
        FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
        
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode) 
        VALUES (v_sale.organization_id, v_sale.sale_date, 'sale', v_voucher_no, v_summary_narration, v_total_inc_tax, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode) 
        RETURNING id INTO v_voucher_id;
    ELSE
        UPDATE mandi.vouchers SET 
            narration = v_summary_narration,
            amount = v_total_inc_tax,
            party_id = v_sale.buyer_id,
            payment_mode = v_sale.payment_mode
        WHERE id = v_voucher_id;
    END IF;
    
    -- 5. Post Ledger (DR Buyer / CR Revenue)
    -- BOTH legs should have contact_id if it's a sale, so reporting shows the party name
    IF v_total_inc_tax > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_sale.organization_id, v_voucher_id, v_sale.buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);
        
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_sale.organization_id, v_voucher_id, v_sale.buyer_id, v_rev_acc_id, 0, v_total_inc_tax, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);
    END IF;

    -- 6. Ensure Receipt exists and matches Bill No
    IF v_received > 0 THEN
        IF v_payment_mode = 'cash' THEN 
            v_liquid_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'cash', '%Cash%', '1001');
        ELSE 
            v_liquid_acc_id := COALESCE(v_sale.bank_account_id, mandi.resolve_account_robust(v_sale.organization_id, 'bank', '%Bank%', '1002'));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            -- Check for existing receipt voucher to update narration
            SELECT id INTO v_voucher_id FROM mandi.vouchers 
            WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt') 
            LIMIT 1;

            IF v_voucher_id IS NULL THEN
                SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
                FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
                
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode, bank_account_id) 
                VALUES (v_sale.organization_id, v_sale.sale_date, 'receipt', v_voucher_no, 'Receipt against Bill #' || v_sale.bill_no, v_received, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode, v_liquid_acc_id)
                RETURNING id INTO v_voucher_id;
            ELSE
                UPDATE mandi.vouchers SET 
                    narration = 'Receipt against Bill #' || v_sale.bill_no,
                    amount = v_received,
                    party_id = v_sale.buyer_id,
                    bank_account_id = v_liquid_acc_id
                WHERE id = v_voucher_id;
            END IF;
            
            -- Add Receipt legs to ledger if they were missing (usually handled by triggers but we can be explicit here)
            -- Actually, sync_voucher_to_ledger handles the receipt legs. 
            -- But we must ensure it uses the correct narration.
            PERFORM mandi.sync_voucher_to_ledger(v_voucher_id);
        END IF;
    END IF;

    -- 7. Update Sales Header Status
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

-- 2. Update post_arrival_ledger to ensure party names on all legs
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

    -- 2. Resolve Accounts
    v_purchase_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'cost_of_goods', '%Purchase%', '5001');
    v_ap_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'payable', '%Payable%', '2100');
    v_comm_income_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'commission', '%Commission%', '4003');
    v_recovery_acc_id := mandi.resolve_account_robust(v_arrival.organization_id, 'fees', '%Recovery%', '4002');

    -- 3. Calculate Totals
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
    
    -- Check for existing voucher
    SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE arrival_id = p_arrival_id OR reference_id = p_arrival_id LIMIT 1;

    v_summary_narration := 'Arrival #' || v_arrival.bill_no;
    IF v_arrival.vehicle_number IS NOT NULL THEN v_summary_narration := v_summary_narration || ' | Veh: ' || v_arrival.vehicle_number; END IF;

    IF v_voucher_id IS NULL THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no 
        FROM mandi.vouchers WHERE organization_id = v_arrival.organization_id;
        
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, arrival_id, reference_id) 
        VALUES (v_arrival.organization_id, v_arrival.arrival_date, 'purchase', v_voucher_no, v_summary_narration, v_gross_purchase, v_arrival.party_id, p_arrival_id, p_arrival_id) 
        RETURNING id INTO v_voucher_id;
    ELSE
        UPDATE mandi.vouchers SET 
            narration = v_summary_narration,
            amount = v_gross_purchase,
            party_id = v_arrival.party_id
        WHERE id = v_voucher_id;
    END IF;

    -- 6. Post Ledger
    -- DR Purchase/Inventory (Include contact_id for reporting)
    IF v_gross_purchase > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_purchase_acc_id, v_gross_purchase, 0, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    END IF;
    
    -- CR Farmer (Payable)
    IF v_net_payable > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_ap_acc_id, 0, v_net_payable, v_arrival.arrival_date, v_summary_narration, 'purchase', p_arrival_id);
    END IF;
    
    -- CR Commission Income
    IF v_total_comm > 0.01 AND v_comm_income_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_comm_income_acc_id, 0, v_total_comm, v_arrival.arrival_date, 'Commission Income #' || v_arrival.bill_no, 'purchase', p_arrival_id);
    END IF;

    -- CR Recoveries
    IF (v_gross_purchase - v_net_payable - v_total_comm) > 0.01 AND v_recovery_acc_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_arrival.organization_id, v_voucher_id, v_arrival.party_id, v_recovery_acc_id, 0, (v_gross_purchase - v_net_payable - v_total_comm), v_arrival.arrival_date, 'Charges Recovery #' || v_arrival.bill_no, 'purchase', p_arrival_id);
    END IF;

    UPDATE mandi.arrivals SET status = 'completed' WHERE id = p_arrival_id;

    RETURN jsonb_build_object('success', true, 'net_payable', v_net_payable);
END;
$$;

-- 3. Fix sync_voucher_to_ledger to ensure party names are preserved on receipt/payment legs
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_party_acc_id UUID;
    v_flow TEXT;
    v_narration TEXT;
BEGIN
    -- Only sync receipt/payment/expense/transfer (Sale and Purchase have their own posting engines)
    IF NEW.type NOT IN ('receipt', 'payment', 'expense', 'transfer', 'sale_payment', 'cash_receipt', 'cash_payment') THEN
        RETURN NEW;
    END IF;

    -- Delete old legs for this voucher
    DELETE FROM mandi.ledger_entries WHERE voucher_id = NEW.id;

    -- Determine accounts
    IF NEW.amount > 0.01 THEN
        IF NEW.type IN ('receipt', 'sale_payment', 'cash_receipt') THEN
            v_liquid_acc_id := COALESCE(NEW.bank_account_id, mandi.resolve_account_robust(NEW.organization_id, 'cash', '%Cash%', '1001'));
            v_party_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'receivable', '%Receivable%', '1200');
            v_narration := COALESCE(NEW.narration, 'Receipt Received');
            
            -- DR Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_liquid_acc_id, NEW.amount, 0, NEW.date, v_narration, NEW.type);
            
            -- CR Party
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_party_acc_id, 0, NEW.amount, NEW.date, v_narration, NEW.type);

        ELSIF NEW.type IN ('payment', 'cash_payment') THEN
            v_liquid_acc_id := COALESCE(NEW.bank_account_id, mandi.resolve_account_robust(NEW.organization_id, 'cash', '%Cash%', '1001'));
            v_party_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'payable', '%Payable%', '2100');
            v_narration := COALESCE(NEW.narration, 'Payment Made');
            
            -- DR Party
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_party_acc_id, NEW.amount, 0, NEW.date, v_narration, NEW.type);
            
            -- CR Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_liquid_acc_id, 0, NEW.amount, NEW.date, v_narration, NEW.type);
        
        ELSIF NEW.type = 'expense' THEN
            v_liquid_acc_id := COALESCE(NEW.bank_account_id, mandi.resolve_account_robust(NEW.organization_id, 'cash', '%Cash%', '1001'));
            v_party_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'fees', '%Expense%', '5002'); -- Fallback to generic expense
            v_narration := COALESCE(NEW.narration, 'Expense Recorded');
            
            -- DR Expense
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_party_acc_id, NEW.amount, 0, NEW.date, v_narration, NEW.type);
            
            -- CR Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type)
            VALUES (NEW.organization_id, NEW.id, NEW.party_id, v_liquid_acc_id, 0, NEW.amount, NEW.date, v_narration, NEW.type);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Emergency Reposting to Fix Existing Discrepancies
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Repost all sales from today to align narrations and party names
    FOR r IN SELECT id FROM mandi.sales WHERE created_at::date = CURRENT_DATE LOOP
        PERFORM mandi.post_sale_ledger(r.id);
    END LOOP;
    
    -- Repost all arrivals from today
    FOR r IN SELECT id FROM mandi.arrivals WHERE created_at::date = CURRENT_DATE LOOP
        PERFORM mandi.post_arrival_ledger(r.id);
    END LOOP;
END $$;

COMMIT;
