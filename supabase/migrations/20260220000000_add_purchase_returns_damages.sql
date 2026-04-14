-- Migration: Purchase Returns, Adjustments, and Damages
-- Date: 2026-02-20

-- 1. Damages / Spoilage
CREATE TABLE IF NOT EXISTS public.damages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    lot_id UUID NOT NULL REFERENCES public.lots(id),
    qty NUMERIC(15, 2) NOT NULL DEFAULT 0,
    damage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Damages
ALTER TABLE public.damages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view damages for their org" ON public.damages
    FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create damages for their org" ON public.damages
    FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- RPC: Record Damage
CREATE OR REPLACE FUNCTION public.record_lot_damage(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_reason TEXT,
    p_damage_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_damage_id UUID;
BEGIN
    -- Insert Damage Record
    INSERT INTO damages (organization_id, lot_id, qty, reason, damage_date)
    VALUES (p_organization_id, p_lot_id, p_qty, p_reason, p_damage_date)
    RETURNING id INTO v_damage_id;

    -- Update Lot Quantity (Reduce)
    UPDATE lots 
    SET current_qty = current_qty - p_qty
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- Log to Stock Ledger
    INSERT INTO stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'damage', -p_qty, v_damage_id);

    RETURN jsonb_build_object('success', true, 'damage_id', v_damage_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Purchase Returns
CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    lot_id UUID NOT NULL REFERENCES public.lots(id),
    contact_id UUID NOT NULL REFERENCES public.contacts(id), -- Supplier
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    qty NUMERIC(15, 2) NOT NULL DEFAULT 0,
    rate NUMERIC(15, 2) NOT NULL DEFAULT 0,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'approved',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Purchase Returns
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase returns for their org" ON public.purchase_returns
    FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create purchase returns for their org" ON public.purchase_returns
    FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- RPC: Process Purchase Return
CREATE OR REPLACE FUNCTION public.process_purchase_return(
    p_organization_id UUID,
    p_lot_id UUID,
    p_qty NUMERIC,
    p_rate NUMERIC,
    p_remarks TEXT,
    p_return_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_contact_id UUID;
    v_amount NUMERIC;
    v_return_id UUID;
    v_voucher_id UUID;
    v_purchases_account_id UUID;
    v_narration TEXT;
BEGIN
    -- Get Supplier from Lot
    SELECT contact_id INTO v_contact_id FROM lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Lot or Supplier not found';
    END IF;

    v_amount := p_qty * p_rate;

    -- Create Return Record
    INSERT INTO purchase_returns (organization_id, lot_id, contact_id, qty, rate, amount, remarks, return_date)
    VALUES (p_organization_id, p_lot_id, v_contact_id, p_qty, p_rate, v_amount, p_remarks, p_return_date)
    RETURNING id INTO v_return_id;

    -- Update Lot Quantity (Reduce)
    UPDATE lots 
    SET current_qty = current_qty - p_qty
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- Log to Stock Ledger
    INSERT INTO stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'purchase_return', -p_qty, v_return_id);

    -- Accounting: Debit Supplier, Credit Purchase Return (Reduce Expenses)
    SELECT id INTO v_purchases_account_id FROM accounts WHERE organization_id = p_organization_id AND code = 4001 LIMIT 1;
    IF v_purchases_account_id IS NULL THEN
        SELECT id INTO v_purchases_account_id FROM accounts WHERE organization_id = p_organization_id AND type = 'expense' LIMIT 1;
    END IF;

    v_narration := 'Purchase Return for Lot ' || (SELECT lot_code FROM lots WHERE id = p_lot_id) || ' - ' || COALESCE(p_remarks, '');

    INSERT INTO vouchers (organization_id, date, type, narration, amount)
    VALUES (p_organization_id, p_return_date, 'debit_note', v_narration, v_amount)
    RETURNING id INTO v_voucher_id;

    -- Debit Supplier (Reduce Payable)
    INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description)
    VALUES (p_organization_id, v_voucher_id, v_contact_id, v_amount, 0, p_return_date, v_narration);

    -- Credit Purchases (Reduce Expense)
    IF v_purchases_account_id IS NOT NULL THEN
        INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, 0, v_amount, p_return_date, v_narration);
    END IF;

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id, 'voucher_id', v_voucher_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Purchase Adjustments
CREATE TABLE IF NOT EXISTS public.purchase_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    lot_id UUID NOT NULL REFERENCES public.lots(id),
    old_rate NUMERIC(15, 2) NOT NULL,
    new_rate NUMERIC(15, 2) NOT NULL,
    reason TEXT,
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Purchase Adjustments
ALTER TABLE public.purchase_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase adjustments for their org" ON public.purchase_adjustments
    FOR SELECT USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create purchase adjustments for their org" ON public.purchase_adjustments
    FOR INSERT WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- RPC: Process Purchase Adjustment
CREATE OR REPLACE FUNCTION public.process_purchase_adjustment(
    p_organization_id UUID,
    p_lot_id UUID,
    p_new_rate NUMERIC,
    p_reason TEXT,
    p_adjustment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB AS $$
DECLARE
    v_contact_id UUID;
    v_old_rate NUMERIC;
    v_initial_qty NUMERIC;
    v_diff_rate NUMERIC;
    v_diff_amount NUMERIC;
    v_adjustment_id UUID;
    v_voucher_id UUID;
    v_purchases_account_id UUID;
    v_narration TEXT;
BEGIN
    SELECT contact_id, supplier_rate, initial_qty INTO v_contact_id, v_old_rate, v_initial_qty
    FROM lots WHERE id = p_lot_id AND organization_id = p_organization_id AND arrival_type = 'direct';

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Lot not found or not a direct purchase';
    END IF;

    v_diff_rate := v_old_rate - p_new_rate; -- e.g. 100 - 90 = 10 discount
    v_diff_amount := v_diff_rate * v_initial_qty;

    IF v_diff_amount = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No difference in rate');
    END IF;

    -- Create Adjustment Record
    INSERT INTO purchase_adjustments (organization_id, lot_id, old_rate, new_rate, reason, adjustment_date)
    VALUES (p_organization_id, p_lot_id, v_old_rate, p_new_rate, p_reason, p_adjustment_date)
    RETURNING id INTO v_adjustment_id;

    -- Update Lot Rate
    UPDATE lots 
    SET supplier_rate = p_new_rate
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- Accounting: If rate decreases (discount), we debit supplier (owe them less), credit purchases (expense decreases)
    -- If rate increases, credit supplier (owe them more), debit purchases (expense increases)
    
    SELECT id INTO v_purchases_account_id FROM accounts WHERE organization_id = p_organization_id AND code = 4001 LIMIT 1;
    IF v_purchases_account_id IS NULL THEN
        SELECT id INTO v_purchases_account_id FROM accounts WHERE organization_id = p_organization_id AND type = 'expense' LIMIT 1;
    END IF;

    v_narration := 'Purchase Rate Adj for Lot ' || (SELECT lot_code FROM lots WHERE id = p_lot_id) || ' from ' || v_old_rate || ' to ' || p_new_rate || ' - ' || COALESCE(p_reason, '');

    INSERT INTO vouchers (organization_id, date, type, narration, amount)
    VALUES (p_organization_id, p_adjustment_date, 'adjustment', v_narration, ABS(v_diff_amount))
    RETURNING id INTO v_voucher_id;

    IF v_diff_amount > 0 THEN
        -- Discount received (expense down, payable down)
        -- Debit Supplier
        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_contact_id, v_diff_amount, 0, p_adjustment_date, v_narration);
        
        -- Credit Purchases
        IF v_purchases_account_id IS NOT NULL THEN
            INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
            VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, 0, v_diff_amount, p_adjustment_date, v_narration);
        END IF;
    ELSE
        -- Cost increased (expense up, payable up)
        -- Credit Supplier
        INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description)
        VALUES (p_organization_id, v_voucher_id, v_contact_id, 0, ABS(v_diff_amount), p_adjustment_date, v_narration);
        
        -- Debit Purchases
        IF v_purchases_account_id IS NOT NULL THEN
            INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description)
            VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, ABS(v_diff_amount), 0, p_adjustment_date, v_narration);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'adjustment_id', v_adjustment_id, 'voucher_id', v_voucher_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
