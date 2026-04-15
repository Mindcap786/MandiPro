-- Migration: Sales Return Module
-- Date: 2026-02-15
-- Author: Antigravity

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    sale_id UUID REFERENCES sales(id),
    contact_id UUID REFERENCES contacts(id),
    return_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    return_no SERIAL,
    status TEXT DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
    return_type TEXT NOT NULL CHECK (return_type IN ('credit', 'cash')),
    total_amount NUMERIC DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID REFERENCES sale_returns(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES lots(id),
    item_id UUID REFERENCES items(id),
    qty NUMERIC NOT NULL,
    rate NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sale_returns_org ON sale_returns(organization_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_contact ON sale_returns(contact_id);

-- 2. RPC to Process Return (Inventory + Ledger)
CREATE OR REPLACE FUNCTION process_sale_return_transaction(
    p_return_id UUID
) RETURNS VOID AS $$
DECLARE
    v_return sale_returns%ROWTYPE;
    r_item RECORD;
    v_return_acct_id UUID;
    v_customer_acct_id UUID;
    v_cash_acct_id UUID;
    v_return_no TEXT;
BEGIN
    SELECT * INTO v_return FROM sale_returns WHERE id = p_return_id;
    v_return_no := 'RET-' || v_return.return_no;

    -- 1. Inventory Update (Increment Stock)
    FOR r_item IN SELECT * FROM sale_return_items WHERE return_id = p_return_id LOOP
        UPDATE lots 
        SET current_qty = current_qty + r_item.qty
        WHERE id = r_item.lot_id;
    END LOOP;

    -- 2. Ledger Entries
    
    -- A. Find 'Sales Return' Account (Contra Revenue)
    SELECT id INTO v_return_acct_id FROM accounts 
    WHERE organization_id = v_return.organization_id AND name ILIKE 'Sales Return%' LIMIT 1;
    
    -- If not found, check for 'Sales' to debit (reduce revenue) or create one. 
    -- For now, let's look for a generic sales account if Sales Return doesn't exist
    IF v_return_acct_id IS NULL THEN
         SELECT id INTO v_return_acct_id FROM accounts 
         WHERE organization_id = v_return.organization_id AND (name ILIKE 'Sales%' OR type = 'income') LIMIT 1;
    END IF;

    -- B. Handle Return Type
    IF v_return.return_type = 'credit' THEN
        -- CREDIT CUSTOMER (Reduce Receivable) => Credit Entry in Ledger
        -- Find Customer Account (AR) - In our system, contact_id is used for AR, account_id is AR account
        SELECT id INTO v_customer_acct_id FROM accounts 
        WHERE organization_id = v_return.organization_id 
          AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%') LIMIT 1;

        -- Debit Sales Return (Reduce Revenue)
        INSERT INTO ledger_entries (
            organization_id, contact_id, account_id, reference_id, reference_no,
            transaction_type, description, entry_date, debit, credit
        ) VALUES (
            v_return.organization_id, NULL, v_return_acct_id, v_return.id, v_return_no,
            'sale_return', 'Sales Return #' || v_return.return_no, v_return.return_date, v_return.total_amount, 0
        );

        -- Credit Customer (Reduce Debt)
        INSERT INTO ledger_entries (
            organization_id, contact_id, account_id, reference_id, reference_no,
            transaction_type, description, entry_date, debit, credit
        ) VALUES (
            v_return.organization_id, v_return.contact_id, v_customer_acct_id, v_return.id, v_return_no,
            'sale_return', 'Return Credit #' || v_return.return_no, v_return.return_date, 0, v_return.total_amount
        );

    ELSIF v_return.return_type = 'cash' THEN
        -- CASH REFUND (Money Out) => Credit Cash
        -- Find Cash Account
        SELECT id INTO v_cash_acct_id FROM accounts 
        WHERE organization_id = v_return.organization_id 
          AND (name ILIKE 'Cash%' OR type = 'asset') LIMIT 1;

        -- Debit Sales Return (Reduce Revenue)
        INSERT INTO ledger_entries (
            organization_id, contact_id, account_id, reference_id, reference_no,
            transaction_type, description, entry_date, debit, credit
        ) VALUES (
            v_return.organization_id, NULL, v_return_acct_id, v_return.id, v_return_no,
            'sale_return', 'Sales Return #' || v_return.return_no, v_return.return_date, v_return.total_amount, 0
        );

        -- Credit Cash (Payout)
        INSERT INTO ledger_entries (
            organization_id, contact_id, account_id, reference_id, reference_no,
            transaction_type, description, entry_date, debit, credit
        ) VALUES (
            v_return.organization_id, NULL, v_cash_acct_id, v_return.id, v_return_no,
            'sale_return', 'Cash Refund #' || v_return.return_no, v_return.return_date, 0, v_return.total_amount
        );
    END IF;

    -- Update Return Status to completed/processed if needed (already approved default)
END;
$$ LANGUAGE plpgsql;
