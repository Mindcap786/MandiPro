-- Drop existing conflicting functions
DROP FUNCTION IF EXISTS public.create_voucher(uuid, text, date, numeric, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.create_voucher(uuid, text, date, numeric, text, uuid, uuid, text, numeric);

-- Create new canonical function with p_invoice_id
CREATE OR REPLACE FUNCTION public.create_voucher(
    p_organization_id uuid,
    p_voucher_type text,
    p_date date,
    p_amount numeric,
    p_payment_mode text,
    p_party_id uuid DEFAULT NULL::uuid,
    p_account_id uuid DEFAULT NULL::uuid,
    p_remarks text DEFAULT ''::text,
    p_discount numeric DEFAULT 0,
    p_invoice_id uuid DEFAULT NULL::uuid -- NEW PARAMETER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_contra_account_id UUID; -- The Cash/Bank account
    v_discount_allowed_acc_id UUID; -- Expense (4006)
    v_discount_received_acc_id UUID; -- Income (3003)
BEGIN
    -- 1. Insert Voucher Header
    INSERT INTO vouchers (organization_id, type, date, narration)
    VALUES (p_organization_id, p_voucher_type, p_date, p_remarks)
    RETURNING id, voucher_no INTO v_voucher_id, v_voucher_no;

    -- 2. Determine Contra Account (Cash/Bank)
    SELECT id INTO v_contra_account_id FROM accounts 
    WHERE organization_id = p_organization_id 
    AND code = (CASE WHEN p_payment_mode = 'cash' THEN '1001' ELSE '1002' END)
    LIMIT 1;

    IF v_contra_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash/Bank Account not found';
    END IF;

    -- 3. Determine Discount Accounts (if discount exists)
    IF p_discount > 0 THEN
        SELECT id INTO v_discount_allowed_acc_id FROM accounts WHERE organization_id = p_organization_id AND code = '4006' LIMIT 1;
        SELECT id INTO v_discount_received_acc_id FROM accounts WHERE organization_id = p_organization_id AND code = '3003' LIMIT 1;
    END IF;

    -- 4. Payment Logic
    IF p_voucher_type = 'payment' THEN
        -- PAYING OUT: Dr (Party/Expense), Cr (Cash/Bank), Cr (Discount Received)
        -- Total Party Settlement = Amount Paid + Discount
        
        -- A. DEBIT ENTRY (Party gets full settlement)
        INSERT INTO ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            contact_id, account_id, description, debit, credit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
            p_party_id, p_account_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
        );

        -- B. CREDIT ENTRY (Cash/Bank Out)
        INSERT INTO ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            account_id, description, credit, debit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
            v_contra_account_id, 'Payment Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
        );

        -- C. CREDIT ENTRY (Discount Received)
        IF p_discount > 0 AND v_discount_received_acc_id IS NOT NULL THEN
             INSERT INTO ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
                v_discount_received_acc_id, 'Discount Received', p_discount, 0, v_voucher_id
            );
        END IF;
        
    ELSIF p_voucher_type = 'receipt' THEN
        -- RECEIVING IN: Dr (Cash/Bank), Dr (Discount Allowed), Cr (Party/Income)
        -- Total Party Credit = Amount Received + Discount Given
        
        -- A. DEBIT ENTRY (Cash/Bank In)
        INSERT INTO ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            account_id, description, debit, credit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
            v_contra_account_id, 'Receipt Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
        );

        -- B. DEBIT ENTRY (Discount Allowed - Expense)
        IF p_discount > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
            INSERT INTO ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
                v_discount_allowed_acc_id, 'Discount Allowed', p_discount, 0, v_voucher_id
            );
        END IF;

        -- C. CREDIT ENTRY (Party/Income)
        INSERT INTO ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            contact_id, account_id, description, credit, debit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
            p_party_id, p_account_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
        );

        -- D. UPDATE INVOICE STATUS (Link Receipt to Invoice)
        IF p_invoice_id IS NOT NULL THEN
            UPDATE sales 
            SET payment_status = 'paid'
            WHERE id = p_invoice_id;

            UPDATE transactions
            SET payment_status = 'paid'
            WHERE invoice_id = p_invoice_id;
        END IF;

    END IF;

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;
