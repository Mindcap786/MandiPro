-- Migration: Add Payroll Support to Ledger
-- Date: 2026-03-06

-- 1. Add employee_id to vouchers and ledger_entries
ALTER TABLE mandi.vouchers ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);
ALTER TABLE mandi.ledger_entries ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);

-- 2. Create Staff Salaries account if not exists
DO $$
DECLARE
    v_org_id UUID;
BEGIN
    FOR v_org_id IN SELECT id FROM core.organizations LOOP
        INSERT INTO mandi.accounts (organization_id, name, type, code, is_system)
        VALUES (v_org_id, 'Staff Salaries', 'expense', '4007', true)
        ON CONFLICT (organization_id, code) DO NOTHING;
    END LOOP;
END $$;

-- 3. Update create_voucher RPC to handle account_id and employee_id
CREATE OR REPLACE FUNCTION mandi.create_voucher(
    p_organization_id uuid, 
    p_voucher_type text, 
    p_date timestamp with time zone, 
    p_amount numeric, 
    p_payment_mode text, 
    p_party_id uuid DEFAULT NULL, 
    p_remarks text DEFAULT '', 
    p_discount numeric DEFAULT 0, 
    p_invoice_id uuid DEFAULT NULL,
    p_account_id uuid DEFAULT NULL,
    p_employee_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_contra_account_id UUID;
    v_discount_allowed_acc_id UUID;
    v_discount_received_acc_id UUID;
BEGIN
    -- 1. Insert Voucher Header
    v_voucher_no := public.get_next_voucher_no(p_organization_id);
    INSERT INTO mandi.vouchers (
        organization_id, type, date, narration, invoice_id, 
        amount, discount_amount, voucher_no, employee_id
    )
    VALUES (
        p_organization_id, p_voucher_type, p_date, p_remarks, p_invoice_id, 
        p_amount, p_discount, v_voucher_no, p_employee_id
    )
    RETURNING id INTO v_voucher_id;

    -- 2. Contra Account (Cash/Bank)
    IF p_amount > 0 THEN
        SELECT id INTO v_contra_account_id FROM mandi.accounts 
        WHERE organization_id = p_organization_id 
        AND code = (CASE WHEN p_payment_mode = 'cash' THEN '1001' ELSE '1002' END)
        LIMIT 1;

        IF v_contra_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash/Bank Account not found';
        END IF;
    END IF;

    -- 3. Payment Logic
    IF p_voucher_type = 'payment' THEN
        -- A. Debit (Expense or Party)
        IF p_account_id IS NOT NULL THEN
            -- Generic Expense (e.g., Salaries)
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'expense', v_voucher_id, v_voucher_no::TEXT,
                p_account_id, p_employee_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
            );
        ELSE
            -- Party Payment
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, employee_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
                p_party_id, p_employee_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
            );
        END IF;

        -- B. Credit (Cash/Bank)
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
                v_contra_account_id, 'Payment Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;
        
    ELSIF p_voucher_type = 'receipt' THEN
        -- CR Account/Party, DR Cash/Bank
        IF p_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'income', v_voucher_id, v_voucher_no::TEXT,
                p_account_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
            );
        ELSE
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                contact_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
                p_party_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
            );
        END IF;

        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
                v_contra_account_id, 'Receipt Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;
