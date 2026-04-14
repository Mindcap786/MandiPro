-- Fix Duplicate Invoice Issue and Add Uniqueness Constraint
-- This migration:
-- 1. Investigates duplicate invoices
-- 2. Adds a unique constraint to prevent future duplicates
-- 3. Cleans up existing duplicates

-- Step 1: Identify and log duplicate invoices
DO $$
DECLARE
    duplicate_record RECORD;
    duplicate_count INT;
BEGIN
    RAISE NOTICE '=== INVESTIGATING DUPLICATE INVOICES ===';
    
    -- Find all duplicate bill_no within the same organization
    FOR duplicate_record IN
        SELECT 
            organization_id,
            bill_no,
            COUNT(*) as count,
            STRING_AGG(id::TEXT, ', ') as sale_ids,
            STRING_AGG(sale_date::TEXT, ', ') as dates,
            STRING_AGG(total_amount::TEXT, ', ') as amounts
        FROM sales
        GROUP BY organization_id, bill_no
        HAVING COUNT(*) > 1
        ORDER BY organization_id, bill_no
    LOOP
        RAISE NOTICE 'DUPLICATE FOUND: Org=%, Bill#=%, Count=%, IDs=[%], Dates=[%], Amounts=[%]',
            duplicate_record.organization_id,
            duplicate_record.bill_no,
            duplicate_record.count,
            duplicate_record.sale_ids,
            duplicate_record.dates,
            duplicate_record.amounts;
    END LOOP;
    
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT organization_id, bill_no
        FROM sales
        GROUP BY organization_id, bill_no
        HAVING COUNT(*) > 1
    ) dups;
    
    RAISE NOTICE 'Total duplicate invoice numbers found: %', duplicate_count;
END $$;

-- Step 2: Clean up duplicates (keep the earliest one, merge ledger entries)
DO $$
DECLARE
    dup_record RECORD;
    keeper_id UUID;
    duplicate_ids UUID[];
    ledger_count INT;
BEGIN
    RAISE NOTICE '=== CLEANING UP DUPLICATE INVOICES ===';
    
    -- For each set of duplicates
    FOR dup_record IN
        SELECT 
            organization_id,
            bill_no,
            ARRAY_AGG(id ORDER BY created_at) as all_ids
        FROM sales
        GROUP BY organization_id, bill_no
        HAVING COUNT(*) > 1
    LOOP
        -- Keep the first one (earliest created)
        keeper_id := dup_record.all_ids[1];
        duplicate_ids := dup_record.all_ids[2:array_length(dup_record.all_ids, 1)];
        
        RAISE NOTICE 'Processing Bill #%: Keeping ID=%, Removing IDs=%', 
            dup_record.bill_no, keeper_id, duplicate_ids;
        
        -- Update ledger entries to point to the keeper sale
        -- First, check if there are any ledger entries for duplicates
        SELECT COUNT(*) INTO ledger_count
        FROM ledger_entries
        WHERE voucher_id IN (
            SELECT id FROM vouchers 
            WHERE organization_id = dup_record.organization_id 
            AND voucher_no = dup_record.bill_no
            AND type = 'sales'
        );
        
        IF ledger_count > 0 THEN
            RAISE NOTICE 'Found % ledger entries for Bill #%', ledger_count, dup_record.bill_no;
            
            -- Get the keeper's voucher ID
            DECLARE
                keeper_voucher_id UUID;
            BEGIN
                SELECT id INTO keeper_voucher_id
                FROM vouchers
                WHERE organization_id = dup_record.organization_id
                AND voucher_no = dup_record.bill_no
                AND type = 'sales'
                ORDER BY created_at
                LIMIT 1;
                
                IF keeper_voucher_id IS NOT NULL THEN
                    -- Update all ledger entries to use the keeper voucher
                    UPDATE ledger_entries
                    SET voucher_id = keeper_voucher_id
                    WHERE voucher_id IN (
                        SELECT id FROM vouchers 
                        WHERE organization_id = dup_record.organization_id 
                        AND voucher_no = dup_record.bill_no
                        AND type = 'sales'
                        AND id != keeper_voucher_id
                    );
                    
                    -- Delete duplicate vouchers
                    DELETE FROM vouchers
                    WHERE organization_id = dup_record.organization_id 
                    AND voucher_no = dup_record.bill_no
                    AND type = 'sales'
                    AND id != keeper_voucher_id;
                END IF;
            END;
        END IF;
        
        -- Delete sale_items for duplicate sales
        DELETE FROM sale_items
        WHERE sale_id = ANY(duplicate_ids);
        
        -- Delete sale_adjustments for duplicate sales
        DELETE FROM sale_adjustments
        WHERE sale_id = ANY(duplicate_ids);
        
        -- Delete duplicate sales
        DELETE FROM sales
        WHERE id = ANY(duplicate_ids);
        
        RAISE NOTICE 'Cleaned up duplicates for Bill #%', dup_record.bill_no;
    END LOOP;
    
    RAISE NOTICE '=== CLEANUP COMPLETE ===';
END $$;

-- Step 3: Add unique constraint to prevent future duplicates
-- First check if constraint already exists
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'sales_organization_bill_no_unique'
    ) THEN
        ALTER TABLE sales DROP CONSTRAINT sales_organization_bill_no_unique;
        RAISE NOTICE 'Dropped existing constraint sales_organization_bill_no_unique';
    END IF;
    
    -- Add the unique constraint
    ALTER TABLE sales 
    ADD CONSTRAINT sales_organization_bill_no_unique 
    UNIQUE (organization_id, bill_no);
    
    RAISE NOTICE 'Added unique constraint: sales_organization_bill_no_unique';
END $$;

-- Step 4: Verify the fix
DO $$
DECLARE
    remaining_duplicates INT;
BEGIN
    RAISE NOTICE '=== VERIFICATION ===';
    
    SELECT COUNT(*) INTO remaining_duplicates
    FROM (
        SELECT organization_id, bill_no
        FROM sales
        GROUP BY organization_id, bill_no
        HAVING COUNT(*) > 1
    ) dups;
    
    IF remaining_duplicates = 0 THEN
        RAISE NOTICE '✓ SUCCESS: No duplicate invoices remain';
    ELSE
        RAISE WARNING '✗ WARNING: % duplicate invoice numbers still exist', remaining_duplicates;
    END IF;
END $$;

COMMENT ON CONSTRAINT sales_organization_bill_no_unique ON sales IS 
'Ensures invoice numbers are unique within each organization to prevent duplicate billing';
