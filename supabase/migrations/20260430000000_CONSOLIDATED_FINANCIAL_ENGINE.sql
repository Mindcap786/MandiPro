-- ============================================================================
-- CONSOLIDATED FINANCIAL ENGINE (v6.0)
-- Migration: 20260430000000_CONSOLIDATED_FINANCIAL_ENGINE.sql
-- 
-- GOALS:
-- 1. SEPARATE layers: Sales, Arrivals, and Vouchers have dedicated sync logic.
-- 2. REMOVE NOISE: Drops all legacy triggers and manual posting functions.
-- 3. FACT-BASED: Triggers are the ONLY source of truth for ledger entries.
-- 4. AUTO-HEALING: Missing accounts are created on-the-fly.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: CLEANUP (DROP ALL LEGACY NOISE)
-- ----------------------------------------------------------------------------

-- Drop old triggers on mandi.sales
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS trg_manage_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS trg_update_buyer_ledger ON mandi.sales;
DROP TRIGGER IF EXISTS tg_refresh_dashboard_on_sales ON mandi.sales;

-- Drop old triggers on mandi.arrivals
DROP TRIGGER IF EXISTS trg_sync_arrival_ledger ON mandi.arrivals;
DROP TRIGGER IF EXISTS trg_manage_arrival_ledger ON mandi.arrivals;

-- Drop old triggers on mandi.vouchers
DROP TRIGGER IF EXISTS trg_sync_voucher_to_ledger ON mandi.vouchers;
DROP TRIGGER IF EXISTS trg_post_voucher_ledger_entry ON mandi.vouchers;

-- Drop old triggers on mandi.ledger_entries
DROP TRIGGER IF EXISTS trg_populate_ledger_bill_details ON mandi.ledger_entries;
DROP TRIGGER IF EXISTS trg_enforce_double_entry ON mandi.ledger_entries;
DROP TRIGGER IF EXISTS enforce_voucher_balance ON mandi.ledger_entries;

-- Drop old functions
DROP FUNCTION IF EXISTS mandi.post_sale_ledger(uuid);
DROP FUNCTION IF EXISTS mandi.post_arrival_ledger(uuid);
DROP FUNCTION IF EXISTS mandi.sync_voucher_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS mandi.sync_sales_ledger() CASCADE;
DROP FUNCTION IF EXISTS mandi.populate_ledger_bill_details() CASCADE;
DROP FUNCTION IF EXISTS mandi.check_voucher_balance() CASCADE;
DROP FUNCTION IF EXISTS mandi.post_voucher_ledger_entry() CASCADE;

-- ----------------------------------------------------------------------------
-- STEP 2: ACCOUNT RESOLUTION ENGINE (AUTO-HEALING)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mandi.resolve_account_consolidated(
    p_org_id UUID,
    p_sub_type TEXT,
    p_name_pattern TEXT,
    p_default_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_acc_id UUID;
    v_type TEXT;
BEGIN
    -- Determine target account type
    v_type := CASE 
        WHEN p_sub_type IN ('cash', 'bank', 'receivable') THEN 'asset'
        WHEN p_sub_type IN ('sales', 'commission', 'fees', 'recovery') THEN 'income'
        WHEN p_sub_type IN ('payable', 'cost_of_goods') THEN 'liability'
        WHEN p_sub_type IN ('expense') THEN 'expense'
        ELSE 'asset'
    END;

    -- 1. Match by specific sub-type
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND account_sub_type = p_sub_type LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- 2. Match by standard code
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND code = p_default_code LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- 3. Match by name pattern
    SELECT id INTO v_acc_id FROM mandi.accounts 
    WHERE organization_id = p_org_id AND name ILIKE p_name_pattern ORDER BY code LIMIT 1;
    IF v_acc_id IS NOT NULL THEN RETURN v_acc_id; END IF;

    -- 4. AUTO-CREATE if still not found (Don't assume, Create)
    INSERT INTO mandi.accounts (organization_id, name, type, account_sub_type, code, is_active)
    VALUES (p_org_id, INITCAP(REPLACE(p_sub_type, '_', ' ')), v_type, p_sub_type, p_default_code, true)
    RETURNING id INTO v_acc_id;
    
    RETURN v_acc_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 3: SEPARATED SYNC ENGINES
-- ----------------------------------------------------------------------------

-- 3A. SALES SYNC ENGINE
CREATE OR REPLACE FUNCTION mandi.sync_sale_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_rev_acc_id UUID;
    v_ar_acc_id UUID;
    v_total_inc_tax NUMERIC;
    v_narration TEXT;
BEGIN
    -- 1. Calculate Total (Facts only)
    v_total_inc_tax := COALESCE(NEW.total_amount, 0) + COALESCE(NEW.gst_total, 0) + 
                       COALESCE(NEW.market_fee, 0) + COALESCE(NEW.nirashrit, 0) + 
                       COALESCE(NEW.misc_fee, 0) + COALESCE(NEW.loading_charges, 0) + 
                       COALESCE(NEW.unloading_charges, 0) + COALESCE(NEW.other_expenses, 0) - 
                       COALESCE(NEW.discount_amount, 0);

    -- 2. Resolve Accounts
    v_rev_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'sales', '%Sales Revenue%', '4001');
    v_ar_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'receivable', '%Receivable%', '1200');

    -- 3. Clean existing (Idempotency)
    DELETE FROM mandi.ledger_entries WHERE reference_id = NEW.id AND transaction_type = 'sale';

    -- 4. Post DR Buyer / CR Revenue
    v_narration := 'Sale Bill #' || NEW.bill_no;
    IF NEW.vehicle_number IS NOT NULL THEN v_narration := v_narration || ' | Veh: ' || NEW.vehicle_number; END IF;

    INSERT INTO mandi.ledger_entries (organization_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (NEW.organization_id, NEW.buyer_id, v_ar_acc_id, v_total_inc_tax, 0, NEW.sale_date, v_narration, 'sale', NEW.id);
    
    INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (NEW.organization_id, v_rev_acc_id, 0, v_total_inc_tax, NEW.sale_date, v_narration, 'sale', NEW.id);

    RETURN NEW;
END;
$$;

-- 3B. ARRIVAL SYNC ENGINE
CREATE OR REPLACE FUNCTION mandi.sync_arrival_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_purchase_acc_id UUID;
    v_ap_acc_id UUID;
    v_comm_income_acc_id UUID;
    v_recovery_acc_id UUID;
    v_gross_purchase NUMERIC := 0;
    v_net_payable NUMERIC := 0;
    v_total_comm NUMERIC := 0;
    v_narration TEXT;
BEGIN
    -- 1. Resolve Accounts
    v_purchase_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'cost_of_goods', '%Purchase%', '5001');
    v_ap_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'payable', '%Payable%', '2100');
    v_comm_income_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'commission', '%Commission%', '4003');
    v_recovery_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'fees', '%Recovery%', '4002');

    -- 2. Calculate Totals from Lots
    SELECT 
        SUM(COALESCE(initial_qty * supplier_rate, 0)) as gross,
        SUM(COALESCE(net_payable, 0)) as net,
        SUM(COALESCE(initial_qty * supplier_rate * (COALESCE(commission_percent, 0) / 100.0), 0)) as comm
    INTO v_gross_purchase, v_net_payable, v_total_comm
    FROM mandi.lots WHERE arrival_id = NEW.id;

    -- 3. Clean existing
    DELETE FROM mandi.ledger_entries WHERE reference_id = NEW.id AND transaction_type = 'purchase';

    -- 4. Post DR Purchase / CR Farmer / CR Income
    v_narration := 'Arrival #' || NEW.bill_no;
    IF NEW.vehicle_number IS NOT NULL THEN v_narration := v_narration || ' | Veh: ' || NEW.vehicle_number; END IF;

    -- DR Purchase
    INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (NEW.organization_id, v_purchase_acc_id, v_gross_purchase, 0, NEW.arrival_date, v_narration, 'purchase', NEW.id);
    
    -- CR Farmer (Net Payable)
    INSERT INTO mandi.ledger_entries (organization_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
    VALUES (NEW.organization_id, NEW.party_id, v_ap_acc_id, 0, v_net_payable, NEW.arrival_date, v_narration, 'purchase', NEW.id);
    
    -- CR Commission
    IF v_total_comm > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (NEW.organization_id, v_comm_income_acc_id, 0, v_total_comm, NEW.arrival_date, 'Commission Income #' || NEW.bill_no, 'purchase', NEW.id);
    END IF;

    -- CR Recoveries
    IF (v_gross_purchase - v_net_payable - v_total_comm) > 0 THEN
        INSERT INTO mandi.ledger_entries (organization_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id) 
        VALUES (NEW.organization_id, v_recovery_acc_id, 0, (v_gross_purchase - v_net_payable - v_total_comm), NEW.arrival_date, 'Charges Recovery #' || NEW.bill_no, 'purchase', NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

-- 3C. VOUCHER SYNC ENGINE (Payments/Receipts)
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_party_acc_id UUID;
    v_other_acc_id UUID;
    v_v_type TEXT;
    v_party_id UUID;
BEGIN
    v_v_type := LOWER(NEW.type);
    v_party_id := COALESCE(NEW.party_id, NEW.contact_id);
    v_other_acc_id := NEW.account_id;

    -- Standard Voucher Types Only
    IF v_v_type NOT IN ('receipt', 'payment', 'expense', 'expenses', 'deposit', 'withdrawal') THEN
        RETURN NEW;
    END IF;

    -- Resolve Accounts
    v_liquid_acc_id := COALESCE(NEW.bank_account_id, mandi.resolve_account_consolidated(NEW.organization_id, 'cash', '%Cash%', '1001'));
    
    -- If it's a party voucher, determine if they are a buyer (AR) or supplier (AP)
    IF v_party_id IS NOT NULL THEN
        IF v_v_type = 'receipt' THEN
            v_party_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'receivable', '%Receivable%', '1200');
        ELSE
            v_party_acc_id := mandi.resolve_account_consolidated(NEW.organization_id, 'payable', '%Payable%', '2100');
        END IF;
    END IF;

    -- 1. Clean existing
    DELETE FROM mandi.ledger_entries WHERE voucher_id = NEW.id;

    -- 2. Post by Type
    CASE v_v_type
        WHEN 'receipt' THEN
            -- DR Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, NEW.amount, 0, NEW.date, NEW.narration, 'receipt', NEW.id);
            -- CR Party/Account
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, v_party_acc_id, 0, NEW.amount, NEW.date, NEW.narration, 'receipt', NEW.id);
            ELSE
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, NEW.amount, NEW.date, NEW.narration, 'receipt', NEW.id);
            END IF;

        WHEN 'payment', 'expense', 'expenses' THEN
            -- DEBIT Party/Expense
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, v_party_acc_id, NEW.amount, 0, NEW.date, NEW.narration, v_v_type, NEW.id);
            ELSE
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, NEW.amount, 0, NEW.date, NEW.narration, v_v_type, NEW.id);
            END IF;
            -- CREDIT Cash/Bank
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, NEW.amount, NEW.date, NEW.narration, v_v_type, NEW.id);

        WHEN 'deposit', 'withdrawal' THEN
            -- Double-entry for Contra
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_other_acc_id, CASE WHEN v_v_type = 'withdrawal' THEN NEW.amount ELSE 0 END, CASE WHEN v_v_type = 'deposit' THEN NEW.amount ELSE 0 END, NEW.date, NEW.narration, v_v_type, NEW.id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, CASE WHEN v_v_type = 'deposit' THEN NEW.amount ELSE 0 END, CASE WHEN v_v_type = 'withdrawal' THEN NEW.amount ELSE 0 END, NEW.date, NEW.narration, v_v_type, NEW.id);
    END CASE;

    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 4: ATTACH SEPARATE TRIGGERS
-- ----------------------------------------------------------------------------

-- Sales Trigger
DROP TRIGGER IF EXISTS trg_sync_sale_ledger ON mandi.sales;
CREATE TRIGGER trg_sync_sale_ledger
AFTER INSERT OR UPDATE ON mandi.sales
FOR EACH ROW EXECUTE FUNCTION mandi.sync_sale_to_ledger();

-- Arrival Trigger
DROP TRIGGER IF EXISTS trg_sync_arrival_ledger ON mandi.arrivals;
CREATE TRIGGER trg_sync_arrival_ledger
AFTER INSERT OR UPDATE ON mandi.arrivals
FOR EACH ROW EXECUTE FUNCTION mandi.sync_arrival_to_ledger();

-- Voucher Trigger
DROP TRIGGER IF EXISTS trg_sync_voucher_to_ledger ON mandi.vouchers;
CREATE TRIGGER trg_sync_voucher_to_ledger
AFTER INSERT OR UPDATE ON mandi.vouchers
FOR EACH ROW EXECUTE FUNCTION mandi.sync_voucher_to_ledger();

-- ----------------------------------------------------------------------------
-- STEP 5: RE-SYNC TODAY'S DATA
-- ----------------------------------------------------------------------------
UPDATE mandi.sales SET updated_at = NOW() WHERE created_at::date = CURRENT_DATE;
UPDATE mandi.arrivals SET updated_at = NOW() WHERE created_at::date = CURRENT_DATE;
UPDATE mandi.vouchers SET updated_at = NOW() WHERE created_at::date = CURRENT_DATE;

COMMIT;
