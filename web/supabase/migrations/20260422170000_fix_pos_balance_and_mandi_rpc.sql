-- 20260422170000_fix_pos_balance_and_mandi_rpc.sql

-- 1. Restore public.commit_mandi_session wrapper
CREATE OR REPLACE FUNCTION public.commit_mandi_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN mandi.commit_mandi_session(p_session_id);
END;
$$;

-- 2. Harden sync_voucher_to_ledger to handle anonymous sales (null party_id)
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_other_acc_id UUID;
    v_party_id UUID;
    v_v_type TEXT;
    v_narration TEXT;
    v_amount NUMERIC;
BEGIN
    v_v_type := LOWER(NEW.type);
    v_amount := COALESCE(NEW.amount, 0);
    v_narration := COALESCE(NEW.narration, 'Voucher #' || NEW.voucher_no);
    v_party_id := COALESCE(NEW.party_id, NEW.contact_id);
    v_other_acc_id := NEW.account_id;
    
    v_liquid_acc_id := NEW.bank_account_id;
    IF v_liquid_acc_id IS NULL THEN
        SELECT id INTO v_liquid_acc_id FROM mandi.accounts 
        WHERE organization_id = NEW.organization_id AND (code = '1100' OR account_sub_type = 'cash' OR name = 'Cash in Hand') LIMIT 1;
    END IF;

    DELETE FROM mandi.ledger_entries WHERE voucher_id = NEW.id;
    IF v_amount = 0 THEN RETURN NEW; END IF;

    CASE v_v_type
        WHEN 'payment' THEN
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, (SELECT id FROM mandi.accounts WHERE organization_id = NEW.organization_id AND (code = '2100' OR account_sub_type = 'payable') LIMIT 1), v_amount, 0, NEW.date, v_narration, 'payment', NEW.id);
            ELSIF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'payment', NEW.id);
            END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'payment', NEW.id);

        WHEN 'receipt' THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, v_amount, 0, NEW.date, v_narration, 'receipt', NEW.id);
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, (SELECT id FROM mandi.accounts WHERE organization_id = NEW.organization_id AND (code = '1200' OR account_sub_type = 'receivable') LIMIT 1), 0, v_amount, NEW.date, v_narration, 'receipt', NEW.id);
            ELSE
                IF v_other_acc_id IS NULL THEN
                     SELECT id INTO v_other_acc_id FROM mandi.accounts WHERE organization_id = NEW.organization_id AND (code = '1200' OR account_sub_type = 'receivable') LIMIT 1;
                END IF;
                IF v_other_acc_id IS NOT NULL THEN
                    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                    VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, v_amount, NEW.date, v_narration, 'receipt', NEW.id);
                END IF;
            END IF;

        WHEN 'expense', 'expenses' THEN
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'expense', NEW.id);
            END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'expense', NEW.id);

        WHEN 'deposit' THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, v_amount, 0, NEW.date, v_narration, 'deposit', NEW.id);
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, v_amount, NEW.date, v_narration, 'deposit', NEW.id);
            END IF;

        WHEN 'withdrawal' THEN
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'withdrawal', NEW.id);
            END IF;
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'withdrawal', NEW.id);
        ELSE
    END CASE;
    RETURN NEW;
END;
$$;

-- 3. Update post_sale_ledger to pass account_id to vouchers
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

    SELECT jsonb_agg(jsonb_build_object('name', COALESCE(comm.name, 'Item'), 'lot_no', l.lot_code, 'qty', si.qty, 'unit', COALESCE(si.unit, 'Kg'), 'rate', COALESCE(si.rate, 0), 'amount', si.amount)), SUM(si.qty), MAX(si.unit)
    INTO v_products, v_total_qty, v_unit 
    FROM mandi.sale_items si 
    LEFT JOIN mandi.lots l ON si.lot_id = l.id 
    LEFT JOIN mandi.commodities comm ON COALESCE(si.item_id, l.item_id) = comm.id 
    WHERE si.sale_id = p_sale_id;
    
    IF jsonb_array_length(v_products) = 1 THEN 
        v_item_summary := (v_products->0->>'name') || ' [Lot: ' || (v_products->0->>'lot_no') || ']: ' || (v_products->0->>'qty') || (v_products->0->>'unit') || ' @ ₹' || (v_products->0->>'rate');
    ELSE v_item_summary := jsonb_array_length(v_products) || ' Items'; END IF;
    
    v_rich_narration := 'Sale Bill #' || v_bill_no || ' (' || v_item_summary || ')';
    IF v_sale.vehicle_number IS NOT NULL THEN v_rich_narration := v_rich_narration || ' | Vehicle: ' || v_sale.vehicle_number; END IF;

    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id AND transaction_type IN ('sale', 'sale_payment', 'receipt');
    DELETE FROM mandi.vouchers WHERE reference_id = p_sale_id AND type IN ('sale', 'receipt');
    
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'sale';
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, contact_id, invoice_id, reference_id, account_id) 
    VALUES (v_org_id, v_sale_date, 'sale', v_voucher_no, v_rich_narration, v_total_bill, v_buyer_id, v_buyer_id, p_sale_id, p_sale_id, v_ar_acc_id) RETURNING id INTO v_voucher_id;
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id, products) 
    VALUES (v_org_id, v_voucher_id, v_buyer_id, v_ar_acc_id, v_total_bill, 0, v_sale_date, v_rich_narration, v_rich_narration, 'sale', p_sale_id, v_products);
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, narration, transaction_type, reference_id) 
    VALUES (v_org_id, v_voucher_id, v_rev_acc_id, 0, v_total_bill, v_sale_date, v_rich_narration, v_rich_narration, 'sale', p_sale_id);
    
    IF v_amount_received > 0 THEN
        IF LOWER(v_sale.payment_mode) = 'cash' THEN v_liquid_acc_id := mandi.resolve_account_robust(v_org_id, 'cash', '%Cash%', '1001');
        ELSE v_liquid_acc_id := COALESCE(v_sale.bank_account_id, mandi.resolve_account_robust(v_org_id, 'bank', '%Bank%', '1002')); END IF;
        
        IF v_liquid_acc_id IS NOT NULL THEN
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'receipt';
            INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, contact_id, invoice_id, reference_id, payment_mode, bank_account_id, account_id) 
            VALUES (v_org_id, v_sale_date, 'receipt', v_voucher_no, 'Receipt for Bill #' || v_bill_no, v_amount_received, v_buyer_id, v_buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode, v_liquid_acc_id, v_ar_acc_id);
        END IF;
    END IF;
    
    v_final_status := mandi.classify_bill_status(v_total_bill, v_amount_received);
    UPDATE mandi.sales SET payment_status = v_final_status, balance_due = (v_total_bill - v_amount_received), paid_amount = v_amount_received WHERE id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'status', v_final_status, 'total', v_total_bill, 'received', v_amount_received);
END;
$$;
