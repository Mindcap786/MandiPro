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

-- 6. MODULE-SPECIFIC API WRAPPERS
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
