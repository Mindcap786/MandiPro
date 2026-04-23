-- Migration: Fix Ledger Redundancy and Robust Party Resolution
-- Description: Centralizes ledger sync in triggers and cleans up create_voucher manual posting.

BEGIN;

-- 1. Enhanced Trigger Function
CREATE OR REPLACE FUNCTION mandi.sync_voucher_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_liquid_acc_id UUID;
    v_receivable_acc_id UUID;
    v_payable_acc_id UUID;
    v_writeoff_acc_id UUID;
    v_v_type TEXT;
    v_amount NUMERIC;
    v_discount NUMERIC;
    v_narration TEXT;
    v_party_id UUID;
    v_other_acc_id UUID;
BEGIN
    v_v_type := LOWER(NEW.type);
    v_amount := COALESCE(NEW.amount, 0);
    v_discount := COALESCE(NEW.discount_amount, 0);
    v_narration := COALESCE(NEW.narration, initcap(v_v_type) || ' #' || NEW.voucher_no);
    
    -- [PARTY RESOLUTION]
    v_party_id := COALESCE(NEW.party_id, NEW.contact_id);
    IF v_party_id IS NULL AND NEW.arrival_id IS NOT NULL THEN
        SELECT party_id INTO v_party_id FROM mandi.arrivals WHERE id = NEW.arrival_id;
    END IF;
    IF v_party_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
        SELECT buyer_id INTO v_party_id FROM mandi.sales WHERE id = NEW.invoice_id;
    END IF;

    v_other_acc_id := NEW.account_id;
    
    -- [IDEMPOTENCY] Always clean before re-posting
    DELETE FROM mandi.ledger_entries WHERE voucher_id = NEW.id;

    -- Skip zero-value vouchers
    IF v_amount = 0 AND v_discount = 0 THEN RETURN NEW; END IF;

    -- Standard types handled here
    IF v_v_type NOT IN ('receipt', 'payment', 'expense', 'expenses', 'deposit', 'withdrawal') THEN
        RETURN NEW;
    END IF;

    -- Resolve Standard Accounts
    v_liquid_acc_id := COALESCE(
        NEW.bank_account_id, 
        mandi.resolve_account_robust(NEW.organization_id, 'cash', '%Cash%', '1001')
    );
    v_receivable_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'receivable', '%Receivable%', '1200');
    v_payable_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'payable', '%Payable%', '2100');
    v_writeoff_acc_id := mandi.resolve_account_robust(NEW.organization_id, 'expense', '%Write-off%', '4006');

    CASE v_v_type
        WHEN 'receipt' THEN
            IF v_amount > 0 THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, v_amount, 0, NEW.date, v_narration, 'receipt', NEW.id);
            END IF;
            IF v_discount > 0 THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_writeoff_acc_id, v_discount, 0, NEW.date, 'Settlement Discount', 'receipt', NEW.id);
            END IF;
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, v_receivable_acc_id, 0, v_amount + v_discount, NEW.date, v_narration, 'receipt', NEW.id);
            ELSIF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, 0, v_amount + v_discount, NEW.date, v_narration, 'receipt', NEW.id);
            ELSE
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_receivable_acc_id, 0, v_amount + v_discount, NEW.date, v_narration || ' (Unidentified)', 'receipt', NEW.id);
            END IF;

        WHEN 'payment' THEN
            IF v_party_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_party_id, v_payable_acc_id, v_amount + v_discount, 0, NEW.date, v_narration, 'payment', NEW.id);
            ELSIF v_other_acc_id IS NOT NULL THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_other_acc_id, v_amount + v_discount, 0, NEW.date, v_narration, 'payment', NEW.id);
            ELSE
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_payable_acc_id, v_amount + v_discount, 0, NEW.date, v_narration || ' (Unidentified)', 'payment', NEW.id);
            END IF;
            IF v_amount > 0 THEN
                INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'payment', NEW.id);
            END IF;

        WHEN 'expense', 'expenses' THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, COALESCE(v_other_acc_id, v_writeoff_acc_id), v_amount, 0, NEW.date, v_narration, 'expense', NEW.id);
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
            VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, 'expense', NEW.id);

        WHEN 'deposit', 'withdrawal' THEN
             IF v_amount > 0 THEN
                 INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                 VALUES (NEW.organization_id, NEW.id, COALESCE(v_other_acc_id, v_liquid_acc_id), v_amount, 0, NEW.date, v_narration, v_v_type, NEW.id);
                 INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, transaction_type, reference_id)
                 VALUES (NEW.organization_id, NEW.id, v_liquid_acc_id, 0, v_amount, NEW.date, v_narration, v_v_type, NEW.id);
            END IF;
    END CASE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Clean up create_voucher
CREATE OR REPLACE FUNCTION mandi.create_voucher(
    p_organization_id uuid,
    p_voucher_type text,
    p_date date,
    p_amount numeric,
    p_party_id uuid DEFAULT NULL,
    p_account_id uuid DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL,
    p_remarks text DEFAULT NULL,
    p_payment_mode text DEFAULT 'cash',
    p_bank_account_id uuid DEFAULT NULL,
    p_invoice_id uuid DEFAULT NULL,
    p_cheque_no text DEFAULT NULL,
    p_cheque_date date DEFAULT NULL,
    p_cheque_status text DEFAULT 'Pending',
    p_discount numeric DEFAULT 0,
    p_employee_id uuid DEFAULT NULL,
    p_arrival_id uuid DEFAULT NULL,
    p_lot_id uuid DEFAULT NULL,
    p_bank_name text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_voucher_id uuid;
    v_voucher_no bigint;
BEGIN
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no FROM mandi.vouchers WHERE organization_id = p_organization_id;
    INSERT INTO mandi.vouchers (
        organization_id, type, date, narration, invoice_id, amount, discount_amount,
        voucher_no, cheque_no, cheque_date, is_cleared, cheque_status,
        bank_name, party_id, account_id, payment_mode, bank_account_id, reference_id,
        arrival_id, lot_id, created_at
    ) VALUES (
        p_organization_id, p_voucher_type, p_date, COALESCE(p_remarks, initcap(p_voucher_type)),
        p_invoice_id, p_amount, p_discount, v_voucher_no, p_cheque_no, p_cheque_date, 
        (lower(p_cheque_status) = 'cleared'), p_cheque_status, p_bank_name, p_party_id, p_account_id, 
        lower(p_payment_mode), p_bank_account_id, p_reference_id, p_arrival_id, p_lot_id, now()
    ) RETURNING id INTO v_voucher_id;
    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$$ LANGUAGE plpgsql;

COMMIT;
