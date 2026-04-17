-- Clean up orphan ledger entries for buyer
-- This script removes ledger entries that don't have corresponding sales records

DO $$
DECLARE
    buyer_contact_id UUID;
    orphan_count INT;
BEGIN
    -- Get the buyer contact ID
    SELECT id INTO buyer_contact_id
    FROM contacts
    WHERE name = 'buyer'
    LIMIT 1;

    IF buyer_contact_id IS NULL THEN
        RAISE NOTICE 'Buyer contact not found';
        RETURN;
    END IF;

    RAISE NOTICE 'Found buyer contact: %', buyer_contact_id;

    -- Find and display orphan ledger entries
    RAISE NOTICE '=== ORPHAN LEDGER ENTRIES ===';
    
    FOR orphan_record IN
        SELECT 
            le.id,
            le.entry_date,
            le.debit,
            le.credit,
            le.description,
            le.voucher_id
        FROM ledger_entries le
        WHERE le.contact_id = buyer_contact_id
        AND le.voucher_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM sales s
            JOIN vouchers v ON v.voucher_no = s.bill_no AND v.type = 'sales'
            WHERE v.id = le.voucher_id
        )
    LOOP
        RAISE NOTICE 'Orphan Entry: Date=%, Debit=%, Credit=%, Desc=%',
            orphan_record.entry_date,
            orphan_record.debit,
            orphan_record.credit,
            orphan_record.description;
    END LOOP;

    -- Count orphans
    SELECT COUNT(*) INTO orphan_count
    FROM ledger_entries le
    WHERE le.contact_id = buyer_contact_id
    AND le.voucher_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM sales s
        JOIN vouchers v ON v.voucher_no = s.bill_no AND v.type = 'sales'
        WHERE v.id = le.voucher_id
    );

    RAISE NOTICE 'Total orphan entries: %', orphan_count;

    IF orphan_count > 0 THEN
        -- Delete orphan ledger entries
        DELETE FROM ledger_entries
        WHERE id IN (
            SELECT le.id
            FROM ledger_entries le
            WHERE le.contact_id = buyer_contact_id
            AND le.voucher_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM sales s
                JOIN vouchers v ON v.voucher_no = s.bill_no AND v.type = 'sales'
                WHERE v.id = le.voucher_id
            )
        );

        RAISE NOTICE '✓ Deleted % orphan ledger entries', orphan_count;
    ELSE
        RAISE NOTICE '✓ No orphan entries to clean up';
    END IF;

    -- Recalculate balance
    DECLARE
        new_balance NUMERIC;
    BEGIN
        SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
        INTO new_balance
        FROM ledger_entries
        WHERE contact_id = buyer_contact_id;

        RAISE NOTICE '=== RESULT ===';
        RAISE NOTICE 'New balance for buyer: ₹%', new_balance;
    END;
END $$;
