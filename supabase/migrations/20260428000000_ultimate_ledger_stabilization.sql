-- ============================================================================
-- ULTIMATE LEDGER STABILIZATION & LOGISTICAL RESTORATION
-- Migration: 20260428000000_ultimate_ledger_stabilization.sql
-- ============================================================================

-- [1] DEFERRABLE VOUCHER BALANCE CHECK
DROP TRIGGER IF EXISTS enforce_voucher_balance ON mandi.ledger_entries;

CREATE OR REPLACE FUNCTION mandi.check_voucher_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC;
    v_voucher RECORD;
BEGIN
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_balance FROM mandi.ledger_entries WHERE voucher_id = NEW.voucher_id;

    IF ABS(v_balance) > 0.01 THEN
        SELECT * INTO v_voucher FROM mandi.vouchers WHERE id = NEW.voucher_id;
        IF v_voucher.type != 'opening_balance' THEN
            RAISE EXCEPTION
                'Voucher [%] (%) is not balanced. Imbalance: %.',
                v_voucher.voucher_no, v_voucher.type, v_balance;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER enforce_voucher_balance
    AFTER INSERT OR UPDATE ON mandi.ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION mandi.check_voucher_balance();

-- [2] ROBUST ACCOUNT RESOLUTION HELPER
CREATE OR REPLACE FUNCTION mandi.resolve_account_robust(
    p_org_id UUID,
    p_sub_type TEXT,
    p_name_pattern TEXT,
    p_default_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_acc_id UUID;
BEGIN
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND account_sub_type = p_sub_type LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND name ILIKE p_name_pattern ORDER BY code LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND code = p_default_code LIMIT 1;
    RETURN v_acc_id;
END;
$$;

-- [3] STABILIZED post_sale_ledger(uuid)
CREATE OR REPLACE FUNCTION mandi.post_sale_ledger(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale RECORD;
    v_org_id UUID;
    v_buyer_id UUID;
    v_sale_date DATE;
    v_bill_no BIGINT;
    v_total_bill NUMERIC := 0;
    v_amount_received NUMERIC := 0;
    v_rev_acc_id UUID;
    v_ar_acc_id UUID;
    v_liquid_acc_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_products JSONB := '[]'::jsonb;
    v_rich_narration TEXT;
    v_item_summary TEXT;
    v_total_qty NUMERIC := 0;
    v_unit TEXT;
    v_final_status TEXT;
BEGIN
    SELECT s.*, c.name as buyer_name, 
           (s.total_amount + COALESCE(s.gst_total,0) + COALESCE(s.market_fee,0) + COALESCE(s.nirashrit,0) + 
            COALESCE(s.misc_fee,0) + COALESCE(s.loading_charges,0) + COALESCE(s.unloading_charges,0) + 
            COALESCE(s.other_expenses,0) - COALESCE(s.discount_amount,0)) as total_calc
    FROM mandi.sales s 
    LEFT JOIN mandi.contacts c ON s.buyer_id = c.id 
    WHERE s.id = p_sale_id INTO v_sale;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sale not found'); END IF;
    
    v_org_id := v_sale.organization_id;
    v_buyer_id := v_sale.buyer_id;
    v_sale_date := v_sale.sale_date;
    v_bill_no := v_sale.bill_no;
    v_total_bill := v_sale.total_calc;
    v_amount_received := COALESCE(v_sale.amount_received, 0);

    v_rev_acc_id := mandi.resolve_account_robust(v_org_id, 'sales', '%Sales Revenue%', '4001');
    v_ar_acc_id := mandi.resolve_account_robust(v_org_id, 'receivable', '%Receivable%', '1200');

    SELECT 
        jsonb_agg(jsonb_build_object(
            'name', COALESCE(comm.name, 'Item'), 
            'lot_no', l.lot_code, 
            'qty', si.qty, 
            'unit', COALESCE(si.unit, 'Kg'), 
            'rate', COALESCE(si.rate, 0), 
            'amount', si.amount
        )), 
        SUM(si.qty), 
        MAX(si.unit)
    INTO v_products, v_total_qty, v_unit 
    FROM mandi.sale_items si 
    LEFT JOIN mandi.lots l ON si.lot_id = l.id 
    LEFT JOIN mandi.commodities comm ON COALESCE(si.item_id, l.item_id) = comm.id 
    WHERE si.sale_id = p_sale_id;
    
    IF jsonb_array_length(v_products) = 1 THEN 
        v_item_summary := (v_products->0->>'name') || ' [Lot: ' || (v_products->0->>'lot_no') || ']: ' || (v_products->0->>'qty') || (v_products->0->>'unit') || ' @ ₹' || (v_products->0->>'rate');
    ELSE 
        v_item_summary := jsonb_array_length(v_products) || ' Items'; 
    END IF;
    
    v_rich_narration := 'Sale Bill #' || v_bill_no || ' (' || v_item_summary || ')';
    IF v_sale.vehicle_number IS NOT NULL THEN v_rich_narration := v_rich_narration || ' | Vehicle: ' || v_sale.vehicle_number; END IF;

    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type IN ('sale', 'sale_payment', 'receipt');
    DELETE FROM mandi.vouchers WHERE reference_id = p_sale_id AND type IN ('sale', 'receipt');
    
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, contact_id, invoice_id, reference_id) 
    VALUES (v_org_id, v_sale_date, 'sale', v_voucher_no, v_rich_narration, v_total_bill, v_buyer_id, v_buyer_id, p_sale_id, p_sale_id) RETURNING id INTO v_voucher_id;
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products) 
    VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, v_total_bill, 0, v_sale_date, v_rich_narration, v_rich_narration, 'sale', p_sale_id, v_products);
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id) 
    VALUES (v_org_id, v_voucher_id, v_rev_acc_id, 0, v_total_bill, v_sale_date, v_rich_narration, v_rich_narration, 'sale', p_sale_id);
    
    IF v_amount_received > 0 THEN
        IF LOWER(v_sale.payment_mode) = 'cash' THEN v_liquid_acc_id := mandi.resolve_account_robust(v_org_id, 'cash', '%Cash%', '1001');
        ELSE v_liquid_acc_id := COALESCE(v_sale.bank_account_id, mandi.resolve_account_robust(v_org_id, 'bank', '%Bank%', '1002')); END IF;
        
        IF v_liquid_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'receipt';
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, contact_id, invoice_id, reference_id, payment_mode, bank_account_id) 
            VALUES (v_org_id, v_sale_date, 'receipt', v_voucher_no, 'Receipt for Bill #' || v_bill_no, v_amount_received, v_buyer_id, v_buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode, v_liquid_acc_id);
        END IF;
    END IF;
    
    v_final_status := mandi.classify_bill_status(v_total_bill, v_amount_received);
    UPDATE mandi.sales SET payment_status = v_final_status, balance_due = (v_total_bill - v_amount_received), paid_amount = v_amount_received WHERE id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'status', v_final_status, 'total', v_total_bill, 'received', v_amount_received);
END;
$$;

-- [4] STABILIZED post_arrival_ledger(uuid)
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arrival RECORD;
    v_org_id UUID;
    v_party_id UUID;
    v_arrival_date DATE;
    v_reference_no TEXT;
    v_arrival_type TEXT;
    v_purchase_acc_id UUID;
    v_ap_acc_id UUID;
    v_liquid_acc_id UUID;
    v_inventory_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_recovery_acc_id UUID;
    v_gross_purchase_val NUMERIC := 0;
    v_total_transport NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_net_payable_to_party NUMERIC := 0;
    v_total_advance NUMERIC := 0;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_products JSONB := '[]'::jsonb;
    v_rich_narration TEXT;
    v_item_summary TEXT;
    v_total_qty NUMERIC := 0;
    v_unit TEXT;
    v_final_status TEXT;
BEGIN
    SELECT a.*, c.name as party_name FROM mandi.arrivals a LEFT JOIN mandi.contacts c ON a.party_id = c.id WHERE a.id = p_arrival_id INTO v_arrival;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); END IF;
    v_org_id := v_arrival.organization_id; v_party_id := v_arrival.party_id; v_arrival_date := v_arrival.arrival_date; v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no); v_arrival_type := COALESCE(v_arrival.arrival_type, 'commission');
    v_purchase_acc_id := mandi.resolve_account_robust(v_org_id, 'cost_of_goods', '%Purchase%', '5001'); v_ap_acc_id := mandi.resolve_account_robust(v_org_id, 'payable', '%Payable%', '2100'); v_inventory_acc_id := mandi.resolve_account_robust(v_org_id, 'inventory', '%Inventory%', '1210'); v_comm_income_acc_id := mandi.resolve_account_robust(v_org_id, 'commission', '%Commission Income%', '4100'); v_recovery_acc_id := mandi.resolve_account_robust(v_org_id, 'fees', '%Recovery%', '4300');
    SELECT jsonb_agg(jsonb_build_object('name', COALESCE(comm.name, 'Item'), 'lot_no', l.lot_code, 'qty', l.initial_qty, 'unit', COALESCE(l.unit, 'Kg'), 'rate', COALESCE(l.supplier_rate, 0), 'amount', (l.initial_qty * COALESCE(l.supplier_rate, 0)))), SUM(l.initial_qty * COALESCE(l.supplier_rate, 0)), SUM(l.initial_qty), MAX(l.unit), SUM(COALESCE(l.advance, 0)) INTO v_products, v_gross_purchase_val, v_total_qty, v_unit, v_total_advance FROM mandi.lots l LEFT JOIN mandi.commodities comm ON l.item_id = comm.id WHERE l.arrival_id = p_arrival_id;
    v_gross_purchase_val := COALESCE(v_gross_purchase_val, 0); v_total_qty := COALESCE(v_total_qty, 0); v_total_advance := COALESCE(v_total_advance, 0);
    v_total_transport := COALESCE(v_arrival.hire_charges,0) + COALESCE(v_arrival.hamali_expenses,0) + COALESCE(v_arrival.other_expenses,0);
    SELECT SUM(l.initial_qty * COALESCE(l.supplier_rate, 0) * (COALESCE(l.commission_percent, 0) / 100.0)) INTO v_total_comm FROM mandi.lots l WHERE l.arrival_id = p_arrival_id;
    v_total_comm := COALESCE(v_total_comm, 0); v_net_payable_to_party := v_gross_purchase_val - v_total_comm - v_total_transport;
    IF jsonb_array_length(v_products) = 1 THEN v_item_summary := (v_products->0->>'name') || ' [Lot: ' || (v_products->0->>'lot_no') || ']: ' || (v_products->0->>'qty') || (v_products->0->>'unit') || ' @ ₹' || (v_products->0->>'rate');
    ELSE v_item_summary := jsonb_array_length(v_products) || ' Items'; END IF;
    v_rich_narration := 'Arrival ' || v_reference_no || ' (' || v_item_summary || ')';

    DELETE FROM mandi.ledger_entries WHERE (reference_id = p_arrival_id OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id)) AND transaction_type IN ('purchase', 'purchase_payment', 'arrival', 'arrival_advance', 'payment');
    DELETE FROM mandi.vouchers WHERE reference_id = p_arrival_id AND type IN ('purchase', 'arrival', 'payment');
    
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, contact_id, arrival_id, reference_id) 
    VALUES (v_org_id, v_arrival_date, 'purchase', v_voucher_no, v_rich_narration, v_gross_purchase_val, v_party_id, v_party_id, p_arrival_id, p_arrival_id) RETURNING id INTO v_voucher_id;
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products) 
    VALUES (v_org_id, v_voucher_id, CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END, v_gross_purchase_val, 0, v_arrival_date, v_rich_narration, v_rich_narration, 'purchase', p_arrival_id, v_products);
    IF v_party_id IS NOT NULL THEN INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products) 
        VALUES (v_org_id, v_voucher_id, v_party_id, v_ap_acc_id, 0, v_net_payable_to_party, v_arrival_date, v_rich_narration, v_rich_narration, 'purchase', p_arrival_id, v_products); END IF;
    IF v_total_comm > 0 THEN INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id) 
        VALUES (v_org_id, v_voucher_id, v_comm_income_acc_id, 0, v_total_comm, v_arrival_date, 'Commission Income from ' || v_reference_no, v_rich_narration, 'purchase', p_arrival_id); END IF;
    IF v_total_transport > 0 THEN INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id) 
        VALUES (v_org_id, v_voucher_id, v_recovery_acc_id, 0, v_total_transport, v_arrival_date, 'Expense Recovery from ' || v_reference_no, v_rich_narration, 'purchase', p_arrival_id); END IF;
    
    DECLARE v_lot RECORD; v_lot_advance NUMERIC; v_advance_acc_id UUID; v_advance_mode TEXT; BEGIN FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id AND COALESCE(advance, 0) > 0 LOOP
            v_lot_advance := COALESCE(v_lot.advance, 0); v_advance_mode := LOWER(TRIM(COALESCE(v_lot.advance_payment_mode, 'cash')));
            IF v_lot.advance_bank_account_id IS NOT NULL THEN v_advance_acc_id := v_lot.advance_bank_account_id;
            ELSIF v_advance_mode IN ('bank','upi','upi/bank','neft','rtgs','imps') THEN v_advance_acc_id := mandi.resolve_account_robust(v_org_id, 'bank', '%Bank%', '1002');
            ELSE v_advance_acc_id := mandi.resolve_account_robust(v_org_id, 'cash', '%Cash%', '1001'); END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, NULL, v_party_id, v_ap_acc_id, v_lot_advance, 0, v_arrival_date, 'Advance Paid – Arrival '||v_reference_no, 'purchase_payment', p_arrival_id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (v_org_id, NULL, v_advance_acc_id, 0, v_lot_advance, v_arrival_date, 'Advance to '||COALESCE(v_arrival.party_name,'Supplier')||' – Arrival '||v_reference_no, 'purchase_payment', p_arrival_id); END LOOP; END;
    
    v_final_status := mandi.classify_bill_status(v_net_payable_to_party, v_total_advance);
    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.lots SET payment_status = v_final_status, paid_amount = v_total_advance WHERE arrival_id = p_arrival_id;
    RETURN jsonb_build_object('success', true, 'status', v_final_status, 'net_payable', v_net_payable_to_party, 'advance', v_total_advance);
END;
$$;
