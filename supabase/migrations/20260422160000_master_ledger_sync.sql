-- ============================================================
-- MASTER FINANCIAL SYNC ENGINE
-- Migration: 20260422160000_master_ledger_sync.sql
-- ============================================================

BEGIN;

-- 1. Drop the old broken trigger function
DROP FUNCTION IF EXISTS mandi.post_voucher_ledger_entry() CASCADE;

-- 2. CREATE THE NEW MASTER SYNC FUNCTION
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
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
    
    -- Resolve Liquid Account (Cash/Bank)
    v_liquid_acc_id := NEW.bank_account_id;
    IF v_liquid_acc_id IS NULL THEN
        -- Fallback to default cash if not specified
        SELECT id INTO v_liquid_acc_id FROM mandi.accounts 
        WHERE organization_id = NEW.organization_id AND (code = '1100' OR account_sub_type = 'cash' OR name = 'Cash in Hand') LIMIT 1;
    END IF;

    -- [IDEMPOTENCY] Clean existing ledger entries for this voucher
    DELETE FROM mandi.ledger_entries WHERE voucher_id = NEW.id;

    -- Skip zero amounts
    IF v_amount = 0 THEN RETURN NEW; END IF;

    -- ========================================================
    -- CASE-BY-CASE BUSINESS LOGIC
    -- ========================================================
    
    CASE v_v_type
        -- ----------------------------------------------------
        -- CASE 1: MAKE PAYMENT (Money Decreases)
        -- ----------------------------------------------------
        WHEN 'payment' THEN
            -- DEBIT the Party (He owes us less / We paid our debt)
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, v_amount, 0, NEW.date, v_narration, 'payment', NEW.id);
            ELSIF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'payment', NEW.id);
            END IF;

            -- CREDIT Cash/Bank (Money decreases)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'payment', NEW.id);

        -- ----------------------------------------------------
        -- CASE 2: RECEIVE MONEY (Money Increases)
        -- ----------------------------------------------------
        WHEN 'receipt' THEN
            -- DEBIT Cash/Bank (Money increases)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, v_amount, 0, NEW.date, v_narration, 'receipt', NEW.id);

            -- CREDIT the Party (They paid us)
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, 0, v_amount, NEW.date, v_narration, 'receipt', NEW.id);
            ELSIF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, v_amount, NEW.date, v_narration, 'receipt', NEW.id);
            END IF;

        -- ----------------------------------------------------
        -- CASE 3: EXPENSES (Money Decreases)
        -- ----------------------------------------------------
        WHEN 'expense', 'expenses' THEN
            -- DEBIT Expense Account
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'expense', NEW.id);
            END IF;

            -- CREDIT Cash/Bank (Money decreases)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'expense', NEW.id);

        -- ----------------------------------------------------
        -- CASE 4: DEPOSIT (Money Increases)
        -- ----------------------------------------------------
        WHEN 'deposit' THEN
            -- DEBIT Cash/Bank (Increases)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, v_amount, 0, NEW.date, v_narration, 'deposit', NEW.id);

            -- CREDIT Source/Contra
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, v_amount, NEW.date, v_narration, 'deposit', NEW.id);
            END IF;

        -- ----------------------------------------------------
        -- CASE 5: WITHDRAWAL (Money Decreases)
        -- ----------------------------------------------------
        WHEN 'withdrawal' THEN
            -- DEBIT Destination/Contra
            IF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount, 0, NEW.date, v_narration, 'withdrawal', NEW.id);
            END IF;

            -- CREDIT Cash/Bank (Decreases)
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'withdrawal', NEW.id);

        ELSE
            -- Unknown types — do nothing to avoid noise
    END CASE;

    RETURN NEW;
END;
$$;

-- 3. ATTACH THE TRIGGER
DROP TRIGGER IF EXISTS trg_sync_voucher_to_ledger ON mandi.vouchers;
CREATE TRIGGER trg_sync_voucher_to_ledger
AFTER INSERT OR UPDATE ON mandi.vouchers
FOR EACH ROW EXECUTE FUNCTION mandi.sync_voucher_to_ledger();

COMMIT;
