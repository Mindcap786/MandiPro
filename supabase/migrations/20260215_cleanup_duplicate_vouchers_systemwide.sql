-- System-Wide Cleanup: Delete Orphan/Duplicate 'Sales' Vouchers and Ledger Entries
-- Problem: 'create_voucher' was creating separate ledger entries + vouchers that were NOT linked to the 'sales' table rows.
-- The 'sales' table trigger creates the CORRECT ledger entries.
-- The 'create_voucher' ones are duplicates causing double counting (e.g. 40k instead of 20k).

DO $$
DECLARE
    r RECORD;
    v_deleted_count INTEGER := 0;
BEGIN
    -- Loop through potential duplicate headers (Vouchers causing duplicate Ledger Entries)
    -- Logic: Identify Vouchers of type 'sales' that have NO invoice_id link, but whose voucher_no matches an existing Sale's bill_no.
    FOR r IN 
        SELECT v.id as voucher_id, v.voucher_no, v.amount, le.id as ledger_id, le.debit
        FROM vouchers v
        LEFT JOIN sales s ON s.bill_no = v.voucher_no AND s.organization_id = v.organization_id
        LEFT JOIN ledger_entries le ON le.voucher_id = v.id
        WHERE v.type = 'sales'
          AND v.invoice_id IS NULL -- Orphan voucher (not linked to sale row explicitly)
          AND s.id IS NOT NULL     -- But a matching Sale DOES exist! (So this voucher is redundant)
    LOOP
        RAISE NOTICE 'Deleting Duplicate Voucher/Ledger ID: %, Voucher No: %', r.voucher_id, r.voucher_no;
        
        -- Delete the associated Ledger Entries first
        DELETE FROM ledger_entries WHERE voucher_id = r.voucher_id;
        
        -- Delete the Voucher itself
        DELETE FROM vouchers WHERE id = r.voucher_id;
        
        v_deleted_count := v_deleted_count + 1;
    END LOOP;

    -- Also cleanup any Ledger Entries that have NO reference_id and NO transaction_type (Legacy/Ghost entries)
    -- but do map to a valid contact and seem to be sales duplicates
    -- (This catches cases where voucher deletion might not have cascaded or were inserted differently)
    DELETE FROM ledger_entries 
    WHERE id IN (
        SELECT le.id
        FROM ledger_entries le
        JOIN sales s ON le.contact_id = s.buyer_id 
                     AND le.debit = s.total_amount -- Same Amount
                     AND le.entry_date::date = s.sale_date::date -- Same Day
        WHERE le.transaction_type IS NULL 
          AND le.reference_id IS NULL
          AND le.description IS NULL
    );

    RAISE NOTICE 'Cleanup Complete. Removed % duplicate vouchers/entries.', v_deleted_count;
END $$;
