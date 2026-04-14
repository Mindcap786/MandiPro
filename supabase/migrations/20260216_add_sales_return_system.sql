-- Create Sale Returns Table
CREATE TABLE IF NOT EXISTS public.sale_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    sale_id UUID REFERENCES public.sales(id),
    contact_id UUID REFERENCES public.contacts(id), -- Buyer
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    return_type TEXT NOT NULL CHECK (return_type IN ('credit', 'cash', 'exchange')),
    status TEXT NOT NULL DEFAULT 'draft', -- draft, approved, cancelled
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Sale Return Items Table
CREATE TABLE IF NOT EXISTS public.sale_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.items(id), -- For reference
    lot_id UUID REFERENCES public.lots(id),   -- Critical for inventory adjustment
    qty NUMERIC(15, 2) NOT NULL DEFAULT 0,
    rate NUMERIC(15, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view returns for their org" ON public.sale_returns
    FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create returns for their org" ON public.sale_returns
    FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view return items for their org" ON public.sale_return_items
    FOR SELECT USING (
        return_id IN (
            SELECT id FROM public.sale_returns WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can create return items for their org" ON public.sale_return_items
    FOR INSERT WITH CHECK (
        return_id IN (
            SELECT id FROM public.sale_returns WHERE organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
        )
    );

-- RPC: Process Sale Return Transaction
CREATE OR REPLACE FUNCTION public.process_sale_return_transaction(p_return_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_return_record RECORD;
    v_item RECORD;
    v_voucher_id UUID;
    v_sales_account_id UUID;
    v_cash_account_id UUID;
    v_account_receivable_id UUID; -- Buyer's account implies AR reduce
    v_narration TEXT;
BEGIN
    -- 1. Fetch Return Header
    SELECT * INTO v_return_record FROM sale_returns WHERE id = p_return_id;
    
    IF v_return_record.status = 'approved' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Return already processed');
    END IF;

    -- 2. Process Inventory (Restock)
    FOR v_item IN SELECT * FROM sale_return_items WHERE return_id = p_return_id LOOP
        -- Increase Lot Quantity
        UPDATE lots 
        SET current_qty = current_qty + v_item.qty
        WHERE id = v_item.lot_id;
        
        -- Log to Stock Ledger
        INSERT INTO stock_ledger (
            organization_id, lot_id, transaction_type, qty_change, reference_id, reference_type
        ) VALUES (
            v_return_record.organization_id, v_item.lot_id, 'sale_return', v_item.qty, p_return_id, 'sale_return'
        );
    END LOOP;

    -- 3. Accounting Entries (Financial Impact)
    -- We need to reverse the Sale: Debit Sales (Contra) / Credit Customer
    
    -- Find generic Sales Account (or create strictly 'Sales Return' account logic later)
    -- For now, debiting the Sales Income account reduces the income, which is correct for P&L.
    SELECT id INTO v_sales_account_id FROM accounts 
    WHERE organization_id = v_return_record.organization_id AND code = 3001 LIMIT 1; -- Sales Account
    
    IF v_sales_account_id IS NULL THEN
        -- Fallback
        SELECT id INTO v_sales_account_id FROM accounts 
        WHERE organization_id = v_return_record.organization_id AND type = 'income' LIMIT 1;
    END IF;

    v_narration := 'Sales Return for Invoice Ref: ' || COALESCE((SELECT bill_no FROM sales WHERE id = v_return_record.sale_id), 'Unknown');

    -- Create Voucher (Credit Note)
    INSERT INTO vouchers (
        organization_id, date, type, narration, amount
    ) VALUES (
        v_return_record.organization_id, v_return_record.return_date, 'credit_note', v_narration, v_return_record.total_amount
    ) RETURNING id INTO v_voucher_id;

    -- Entry A: Debit Sales (Reduce Income)
    INSERT INTO ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date, description
    ) VALUES (
        v_return_record.organization_id, v_voucher_id, v_sales_account_id, v_return_record.total_amount, 0, v_return_record.return_date, v_narration
    );

    -- Entry B: Credit Customer (Reduce Receivable)
    -- Even for Cash Returns, step 1 is credit customer, step 2 is pay customer. This keeps ledger clean.
    INSERT INTO ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit, entry_date, description
    ) VALUES (
        v_return_record.organization_id, v_voucher_id, v_return_record.contact_id, 0, v_return_record.total_amount, v_return_record.return_date, v_narration
    );

    -- 4. Handle "Cash Refund" Scenario
    -- If return_type is 'cash', we immediately pay the customer back.
    IF v_return_record.return_type = 'cash' THEN
        -- Find Cash Account
        SELECT id INTO v_cash_account_id FROM accounts WHERE organization_id = v_return_record.organization_id AND code = 1001 LIMIT 1;
        
        -- Create Payment Voucher
        INSERT INTO vouchers (
            organization_id, date, type, narration, amount
        ) VALUES (
            v_return_record.organization_id, v_return_record.return_date, 'payment', 'Cash Refund for Return ' || v_narration, v_return_record.total_amount
        ) RETURNING id INTO v_voucher_id;

        -- Entry A: Debit Customer (They received cash, clearing the credit we just gave them)
        INSERT INTO ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit, entry_date, description
        ) VALUES (
            v_return_record.organization_id, v_voucher_id, v_return_record.contact_id, v_return_record.total_amount, 0, v_return_record.return_date, 'Cash Refund Paid'
        );

        -- Entry B: Credit Cash (Asset reduces)
        INSERT INTO ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, description
        ) VALUES (
            v_return_record.organization_id, v_voucher_id, v_cash_account_id, 0, v_return_record.total_amount, v_return_record.return_date, 'Cash Refund Paid'
        );
    END IF;

    -- 5. Mark Return as Approved
    UPDATE sale_returns SET status = 'approved' WHERE id = p_return_id;

    RETURN jsonb_build_object('success', true, 'voucher_id', v_voucher_id);
END;
$function$;
