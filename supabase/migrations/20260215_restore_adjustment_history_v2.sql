-- Restore adjustment history and update ledger description (Attempt 2)
-- The user wants to see the audit trail of the negotiation (20000 -> 19000)

DO $$
DECLARE
    v_sale_id UUID := '54f896a3-0b87-4213-a754-85698894c16c';
    v_item_record RECORD;
    v_user_id UUID;
BEGIN
    -- Get sale item details
    SELECT id, organization_id INTO v_item_record
    FROM sale_items 
    WHERE sale_id = v_sale_id 
    LIMIT 1;
    
    IF v_item_record.id IS NULL THEN
        RAISE EXCEPTION 'Sale Item not found for sale %', v_sale_id;
    END IF;

    -- Insert Adjustment Record
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
        created_at,
        created_by -- Leave NULL to be safe with constraints in migration context
    ) VALUES (
        v_item_record.organization_id,
        v_sale_id,
        v_item_record.id,
        'rate_change',
        200.00,  -- Old Rate
        190.00,  -- New Rate
        100.00,  -- Old Qty
        100.00,  -- New Qty
        -1000.00,
        'negotiate',
        NOW(),
        NULL
    );

    -- Update Ledger Entry Description to reflect the history
    -- Finds the debit entry for this sale
    UPDATE ledger_entries
    SET description = 'Invoice #34 (Adj: negotiate, Was: 20000.00)'
    WHERE reference_id = v_sale_id 
      AND transaction_type = 'sale'
      AND debit > 0;
      
    RAISE NOTICE 'Restored adjustment history and updated ledger description.';

END $$;
