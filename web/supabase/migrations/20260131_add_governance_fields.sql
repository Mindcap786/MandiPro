-- Migration: Add Governance Fields to Vouchers
-- Date: 2026-01-31

-- 1. Add created_by column to vouchers
ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Update RPC to include created_by
CREATE OR REPLACE FUNCTION create_financial_transaction(
    p_organization_id UUID,
    p_contact_id UUID,          -- The Party (Farmer/Buyer)
    p_amount NUMERIC,           -- The Amount
    p_transaction_type TEXT,    -- 'receipt' (Money In) or 'payment' (Money Out)
    p_payment_mode TEXT,        -- 'cash' or 'bank'
    p_date DATE,
    p_narration TEXT
) RETURNS JSONB AS $$
DECLARE
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_cash_account_id UUID;
    v_bank_account_id UUID;
    v_selected_asset_account_id UUID;
    v_auth_user_id UUID;
BEGIN
    -- 0. Get Current User
    v_auth_user_id := auth.uid();

    -- 1. Validation
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- 2. Identify the Liquid Asset Account (Cash or Bank)
    IF p_payment_mode = 'cash' THEN
        SELECT id INTO v_selected_asset_account_id 
        FROM accounts 
        WHERE organization_id = p_organization_id 
          AND (name ILIKE '%Cash%' OR type = 'asset') 
        ORDER BY CASE WHEN name ILIKE '%Cash%' THEN 0 ELSE 1 END, name
        LIMIT 1;
        
        IF v_selected_asset_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash Account not found. Please create an account named "Cash in Hand".';
        END IF;
    ELSIF p_payment_mode = 'bank' THEN
        SELECT id INTO v_selected_asset_account_id 
        FROM accounts 
        WHERE organization_id = p_organization_id 
          AND (name ILIKE '%Bank%' OR type = 'asset')
        ORDER BY CASE WHEN name ILIKE '%Bank%' THEN 0 ELSE 1 END, name
        LIMIT 1;

        IF v_selected_asset_account_id IS NULL THEN
            RAISE EXCEPTION 'Bank Account not found. Please create an account named "Bank Account".';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid payment mode: %', p_payment_mode;
    END IF;

    -- 3. Get Next Voucher No
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM vouchers 
    WHERE organization_id = p_organization_id;

    -- 4. Create Voucher with Governance
    INSERT INTO vouchers (
        organization_id,
        date,
        type,
        voucher_no,
        narration,
        created_by, -- New Field
        created_at  -- Auto-populated by default, but typically explicit is good. defaults to now()
    ) VALUES (
        p_organization_id,
        p_date,
        p_transaction_type,
        v_voucher_no,
        COALESCE(p_narration, 'Financial Transaction'),
        v_auth_user_id,
        NOW()
    ) RETURNING id INTO v_voucher_id;

    -- 5. Create Ledger Entries (Double Entry)
    
    IF p_transaction_type = 'receipt' THEN
        -- RECEIPT: DR Cash, CR Party
        INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit) 
        VALUES (p_organization_id, v_voucher_id, v_selected_asset_account_id, p_amount, 0);

        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit) 
        VALUES (p_organization_id, v_voucher_id, p_contact_id, 0, p_amount);

    ELSIF p_transaction_type = 'payment' THEN
        -- PAYMENT: DR Party, CR Cash
        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit) 
        VALUES (p_organization_id, v_voucher_id, p_contact_id, p_amount, 0);

        INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit) 
        VALUES (p_organization_id, v_voucher_id, v_selected_asset_account_id, 0, p_amount);
        
    ELSE
        RAISE EXCEPTION 'Invalid transaction type: %. Must be "receipt" or "payment".', p_transaction_type;
    END IF;

    RETURN jsonb_build_object('success', true, 'voucher_id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$$ LANGUAGE plpgsql;
