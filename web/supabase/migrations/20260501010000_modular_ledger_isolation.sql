-- ============================================================================
-- MANDIPRO MODULAR HARDENING & ISOLATION (v1.0)
-- Goal: Physically separate Sale, Purchase, and Expense logic to prevent regressions.
-- Standardizes narrations and restores POS API.
-- ============================================================================

BEGIN;

-- 1. SALE MODULE (Isolated)
CREATE OR REPLACE FUNCTION mandi.internal_sync_sale_legs(p_voucher_id uuid, p_v record)
RETURNS void AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_party_acc_id UUID;
    v_narration TEXT;
BEGIN
    v_narration := COALESCE(p_v.narration, 'Sale Receipt against Bill');
    v_liquid_acc_id := COALESCE(p_v.bank_account_id, mandi.resolve_account_robust(p_v.organization_id, 'cash', '%Cash%', '1001'));
    v_party_acc_id := mandi.resolve_account_robust(p_v.organization_id, 'receivable', '%Receivable%', '1200');
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_liquid_acc_id, p_v.amount, 0, p_v.date, v_narration, p_v.type, p_v.invoice_id);
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_party_acc_id, 0, p_v.amount, p_v.date, v_narration, p_v.type, p_v.invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. PURCHASE MODULE (Isolated)
CREATE OR REPLACE FUNCTION mandi.internal_sync_purchase_legs(p_voucher_id uuid, p_v record)
RETURNS void AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_party_acc_id UUID;
    v_narration TEXT;
BEGIN
    v_narration := COALESCE(p_v.narration, 'Payment for Arrival Bill');
    v_liquid_acc_id := COALESCE(p_v.bank_account_id, mandi.resolve_account_robust(p_v.organization_id, 'cash', '%Cash%', '1001'));
    v_party_acc_id := mandi.resolve_account_robust(p_v.organization_id, 'payable', '%Payable%', '2100');
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_party_acc_id, p_v.amount, 0, p_v.date, v_narration, p_v.type, p_v.arrival_id);
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_liquid_acc_id, 0, p_v.amount, p_v.date, v_narration, p_v.type, p_v.arrival_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. EXPENSE MODULE (Isolated)
CREATE OR REPLACE FUNCTION mandi.internal_sync_expense_legs(p_voucher_id uuid, p_v record)
RETURNS void AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_party_acc_id UUID;
    v_narration TEXT;
BEGIN
    v_narration := COALESCE(p_v.narration, 'General Expense');
    v_liquid_acc_id := COALESCE(p_v.bank_account_id, mandi.resolve_account_robust(p_v.organization_id, 'cash', '%Cash%', '1001'));
    v_party_acc_id := mandi.resolve_account_robust(p_v.organization_id, 'fees', '%Expense%', '5002');
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_party_acc_id, p_v.amount, 0, p_v.date, v_narration, p_v.type, p_v.id);
    
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
    VALUES (p_v.organization_id, p_v.id, p_v.party_id, v_liquid_acc_id, 0, p_v.amount, p_v.date, v_narration, p_v.type, p_v.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. MASTER DISPATCHER (The Stable Front Door)
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger(p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_v RECORD;
BEGIN
    SELECT * INTO v_v FROM mandi.vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN RETURN; END IF;

    DELETE FROM mandi.ledger_entries WHERE voucher_id = p_voucher_id;
    IF COALESCE(v_v.amount, 0) < 0.01 THEN RETURN; END IF;

    IF v_v.type IN ('receipt', 'sale_payment', 'cash_receipt') THEN
        PERFORM mandi.internal_sync_sale_legs(p_voucher_id, v_v);
    ELSIF v_v.type IN ('payment', 'cash_payment') THEN
        PERFORM mandi.internal_sync_purchase_legs(p_voucher_id, v_v);
    ELSIF v_v.type = 'expense' THEN
        PERFORM mandi.internal_sync_expense_legs(p_voucher_id, v_v);
    END IF;
END;
$$;

-- 5. TRIGGER WRAPPER
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM mandi.sync_voucher_to_ledger(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. CORE LOGIC (Restored & Fixed for POS)
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
    v_bill_label TEXT;
BEGIN
    SELECT s.*, 
           (COALESCE(s.total_amount, 0) + COALESCE(s.gst_total, 0) + COALESCE(s.market_fee, 0) + 
            COALESCE(s.nirashrit, 0) + COALESCE(s.misc_fee, 0) + COALESCE(s.loading_charges, 0) + 
            COALESCE(s.unloading_charges, 0) + COALESCE(s.other_expenses, 0) - COALESCE(s.discount_amount, 0)) as total_calc
    FROM mandi.sales s WHERE s.id = p_sale_id INTO v_sale;
    
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Sale not found'); END IF;
    
    v_total_inc_tax := v_sale.total_calc;
    v_payment_mode := LOWER(COALESCE(v_sale.payment_mode, 'udhaar'));
    
    -- FIX: Explicitly cast both to text to avoid type mismatch
    v_bill_label := COALESCE(v_sale.contact_bill_no::text, v_sale.bill_no::text);

    SELECT COALESCE(SUM(amount), 0) INTO v_received 
    FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt');

    IF v_received = 0 THEN v_received := COALESCE(v_sale.amount_received, 0); END IF;
    IF v_received = 0 AND v_payment_mode IN ('cash', 'upi', 'bank') THEN v_received := v_total_inc_tax; END IF;

    v_rev_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'sales', '%Sales Revenue%', '4001');
    v_ar_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'receivable', '%Receivable%', '1200');

    DELETE FROM mandi.ledger_entries WHERE reference_id = p_sale_id;
    v_summary_narration := 'Sale Bill #' || v_bill_label || ' | Items Sold';

    -- Handle Sale Voucher
    SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type = 'sale' LIMIT 1;
    IF v_voucher_id IS NULL THEN
        SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
        INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode) 
        VALUES (v_sale.organization_id, v_sale.sale_date, 'sale', v_voucher_no, v_summary_narration, v_total_inc_tax, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode) 
        RETURNING id INTO v_voucher_id;
    ELSE
        UPDATE mandi.vouchers SET narration = v_summary_narration, amount = v_total_inc_tax, party_id = v_sale.buyer_id, payment_mode = v_sale.payment_mode WHERE id = v_voucher_id;
    END IF;
    
    IF v_total_inc_tax > 0.01 THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_sale.organization_id, v_voucher_id, v_sale.buyer_id, v_ar_acc_id, v_total_inc_tax, 0, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (v_sale.organization_id, v_voucher_id, v_sale.buyer_id, v_rev_acc_id, 0, v_total_inc_tax, v_sale.sale_date, v_summary_narration, 'sale', p_sale_id);
    END IF;

    -- Handle Receipt
    IF v_received > 0 THEN
        IF v_payment_mode = 'cash' THEN v_liquid_acc_id := mandi.resolve_account_robust(v_sale.organization_id, 'cash', '%Cash%', '1001');
        ELSE v_liquid_acc_id := COALESCE(v_sale.bank_account_id, mandi.resolve_account_robust(v_sale.organization_id, 'bank', '%Bank%', '1002'));
        END IF;

        IF v_liquid_acc_id IS NOT NULL THEN
            SELECT id INTO v_voucher_id FROM mandi.vouchers WHERE invoice_id = p_sale_id AND type IN ('receipt', 'sale_payment', 'cash_receipt') LIMIT 1;
            IF v_voucher_id IS NULL THEN
                SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = v_sale.organization_id;
                INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration, amount, party_id, invoice_id, reference_id, payment_mode, bank_account_id) 
                VALUES (v_sale.organization_id, v_sale.sale_date, 'receipt', v_voucher_no, 'Receipt against Bill #' || v_bill_label, v_received, v_sale.buyer_id, p_sale_id, p_sale_id, v_sale.payment_mode, v_liquid_acc_id)
                RETURNING id INTO v_voucher_id;
            ELSE
                UPDATE mandi.vouchers SET narration = 'Receipt against Bill #' || v_bill_label, amount = v_received, party_id = v_sale.buyer_id, bank_account_id = v_liquid_acc_id WHERE id = v_voucher_id;
            END IF;
        END IF;
    END IF;

    v_status := CASE WHEN v_received >= v_total_inc_tax - 0.01 THEN 'paid' WHEN v_received > 0 THEN 'partial' ELSE 'pending' END;
    UPDATE mandi.sales SET payment_status = v_status, amount_received = v_received, balance_due = GREATEST(v_total_inc_tax - v_received, 0), total_amount_inc_tax = v_total_inc_tax WHERE id = p_sale_id;
    RETURN jsonb_build_object('success', true, 'status', v_status, 'received', v_received);
END;
$$;

-- 7. MODULE-SPECIFIC API WRAPPERS
CREATE OR REPLACE FUNCTION mandi.api_pos_save(p_sale_id uuid) RETURNS jsonb AS $$
BEGIN RETURN mandi.post_sale_ledger(p_sale_id); END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mandi.api_sales_standard_save(p_sale_id uuid) RETURNS jsonb AS $$
BEGIN RETURN mandi.post_sale_ledger(p_sale_id); END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mandi.api_sales_bulk_save(p_sale_id uuid) RETURNS jsonb AS $$
BEGIN RETURN mandi.post_sale_ledger(p_sale_id); END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mandi.api_purchase_arrival_save(p_arrival_id uuid) RETURNS jsonb AS $$
BEGIN RETURN mandi.post_arrival_ledger(p_arrival_id); END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mandi.api_purchase_quick_save(p_arrival_id uuid) RETURNS jsonb AS $$
BEGIN RETURN mandi.post_arrival_ledger(p_arrival_id); END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mandi.api_brokerage_dual_save(p_sale_id uuid, p_arrival_id uuid) RETURNS jsonb AS $$
BEGIN PERFORM mandi.post_sale_ledger(p_sale_id); PERFORM mandi.post_arrival_ledger(p_arrival_id); RETURN jsonb_build_object('success', true); END; $$ LANGUAGE plpgsql;

-- 7. ENRICHMENT TRIGGER
CREATE OR REPLACE FUNCTION mandi.enrich_ledger_narration()
RETURNS TRIGGER AS $$
DECLARE v_name TEXT;
BEGIN
    IF NEW.contact_id IS NOT NULL THEN
        SELECT name INTO v_name FROM mandi.contacts WHERE id = NEW.contact_id;
        IF v_name IS NOT NULL AND NEW.description NOT LIKE '%' || v_name || '%' THEN
            NEW.description := NEW.description || ' (' || v_name || ')';
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrich_ledger_narration ON mandi.ledger_entries;
CREATE TRIGGER trg_enrich_ledger_narration BEFORE INSERT ON mandi.ledger_entries FOR EACH ROW EXECUTE FUNCTION mandi.enrich_ledger_narration();

COMMIT;
