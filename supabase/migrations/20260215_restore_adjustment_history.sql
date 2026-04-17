-- Restore adjustment history and update ledger description
-- The user wants to see the audit trail of the negotiation (20000 -> 19000)

DO $$
DECLARE
    v_sale_id UUID := '54f896a3-0b87-4213-a754-85698894c16c';
    v_sale_item_id UUID;
    v_org_id UUID;
    v_user_id UUID;
BEGIN
    -- Get sale item details
    SELECT id, organization_id INTO v_sale_item_id, v_org_id
    FROM sale_items 
    WHERE sale_id = v_sale_id 
    LIMIT 1;

    -- Get a valid user ID for 'created_by' (optional, or use NULL/auth.uid checks in real app)
    -- Here we might just leave created_by NULL or fetch one if strict FK constraint exists
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- 1. Insert Adjustment Record
    INSERT INTO sale_adjustments (
        organization_id,
        sale_id,
        sale_item_id,
        adjustment_type,
        old_value, -- Old Rate
        new_value, -- New Rate
        old_qty,
        new_qty,
        delta_amount,
        reason,
        created_at
    ) VALUES (
        v_org_id,
        v_sale_id,
        v_sale_item_id,
        'rate_change',
        200.00,  -- Old Rate
        190.00,  -- New Rate
        100.00,  -- Old Qty
        100.00,  -- New Qty
        -1000.00,
        'negotiate',
        NOW()
    );

    -- 2. Update Ledger Entry Description to reflect the history
    -- Finds the debit entry for this sale
    UPDATE ledger_entries
    SET description = 'Invoice #34 (Adj: negotiate, Was: 20000.00)'
    WHERE reference_id = v_sale_id 
      AND transaction_type = 'sale'
      AND debit > 0;

END $$;
