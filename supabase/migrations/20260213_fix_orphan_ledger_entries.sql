-- Fix orphan ledger entries and rebuild vouchers for sales
-- This migration addresses the "Orphan Sales" issue where ledger entries exist without proper voucher linkage

-- Step 1: Create vouchers for sales that have ledger entries but no vouchers
INSERT INTO vouchers (organization_id, date, type, voucher_no, narration)
SELECT DISTINCT
    s.organization_id,
    s.sale_date as date,
    'sales' as type,
    s.bill_no as voucher_no,
    'Sale Invoice #' || s.bill_no as narration
FROM sales s
WHERE EXISTS (
    -- Find sales that have ledger entries
    SELECT 1 FROM ledger_entries le
    JOIN contacts c ON le.contact_id = c.id
    WHERE c.id = s.buyer_id
    AND le.debit > 0
    AND le.voucher_id IS NULL
)
AND NOT EXISTS (
    -- But don't have vouchers
    SELECT 1 FROM vouchers v
    WHERE v.type = 'sales'
    AND v.voucher_no = s.bill_no
    AND v.organization_id = s.organization_id
)
ON CONFLICT DO NOTHING;

-- Step 2: Link orphan ledger entries to their vouchers
UPDATE ledger_entries le
SET voucher_id = v.id
FROM vouchers v, contacts c, sales s
WHERE le.contact_id = c.id
AND c.id = s.buyer_id
AND v.type = 'sales'
AND v.voucher_no = s.bill_no
AND v.organization_id = s.organization_id
AND le.voucher_id IS NULL
AND le.debit > 0;

-- Step 3: For sales marked as "paid" but missing credit entries, create the credit
-- First, identify such sales
DO $$
DECLARE
    sale_record RECORD;
    buyer_contact_id UUID;
    sale_voucher_id UUID;
    total_amount NUMERIC;
BEGIN
    FOR sale_record IN 
        SELECT s.* 
        FROM sales s
        WHERE s.payment_status = 'paid'
        AND EXISTS (
            -- Has a debit entry
            SELECT 1 FROM ledger_entries le
            WHERE le.contact_id = s.buyer_id
            AND le.debit > 0
        )
        AND NOT EXISTS (
            -- But no corresponding credit entry
            SELECT 1 FROM ledger_entries le
            WHERE le.contact_id = s.buyer_id
            AND le.credit > 0
            AND le.created_at >= s.created_at
        )
    LOOP
        -- Get the voucher for this sale
        SELECT id INTO sale_voucher_id
        FROM vouchers
        WHERE type = 'sales'
        AND voucher_no = sale_record.bill_no
        AND organization_id = sale_record.organization_id;
        
        -- Calculate total amount
        total_amount := COALESCE(sale_record.total_amount_inc_tax, 
                                 sale_record.total_amount + 
                                 COALESCE(sale_record.market_fee, 0) + 
                                 COALESCE(sale_record.nirashrit, 0) + 
                                 COALESCE(sale_record.misc_fee, 0) +
                                 COALESCE(sale_record.loading_charges, 0) +
                                 COALESCE(sale_record.unloading_charges, 0) +
                                 COALESCE(sale_record.other_expenses, 0));
        
        IF sale_voucher_id IS NOT NULL THEN
            -- Create a payment receipt voucher
            INSERT INTO vouchers (organization_id, date, type, voucher_no, narration)
            VALUES (
                sale_record.organization_id,
                sale_record.sale_date,
                'receipt',
                sale_record.bill_no,
                'Payment for Invoice #' || sale_record.bill_no
            )
            RETURNING id INTO sale_voucher_id;
            
            -- Credit the buyer (reduce receivable)
            INSERT INTO ledger_entries (organization_id, voucher_id, contact_id, debit, credit)
            VALUES (
                sale_record.organization_id,
                sale_voucher_id,
                sale_record.buyer_id,
                0,
                total_amount
            );
            
            -- Debit cash/bank (increase cash)
            -- Try to find a Cash account
            DECLARE
                cash_account_id UUID;
            BEGIN
                SELECT id INTO cash_account_id
                FROM accounts
                WHERE organization_id = sale_record.organization_id
                AND name ILIKE '%cash%'
                LIMIT 1;
                
                IF cash_account_id IS NOT NULL THEN
                    INSERT INTO ledger_entries (organization_id, voucher_id, account_id, debit, credit)
                    VALUES (
                        sale_record.organization_id,
                        sale_voucher_id,
                        cash_account_id,
                        total_amount,
                        0
                    );
                END IF;
            END;
        END IF;
    END LOOP;
END $$;

-- Step 4: Verify the fix
SELECT 
    'Orphan Check' as check_type,
    COUNT(*) as orphan_count
FROM ledger_entries
WHERE voucher_id IS NULL;
