-- Migration: Fix Orphan Sales and Audit Vault
-- Date: 2026-02-04
-- Purpose: 
--   1. Retroactively create ledger entries for orphan sales
--   2. Create global_audit_logs view for Super Admin audit page

-- PART 1: Fix Orphan Sales by creating missing ledger entries
-- This function will create ledger entries for sales that don't have them

DO $$
DECLARE
    orphan_sale RECORD;
    v_sales_account_id UUID;
    v_receivables_account_id UUID;
BEGIN
    -- Process each orphan sale
    FOR orphan_sale IN (
        SELECT s.id, s.organization_id, s.buyer_id, s.sale_date, s.total_amount, s.bill_no
        FROM sales s
        WHERE NOT EXISTS (
            SELECT 1 FROM ledger_entries le 
            WHERE le.reference_id = s.id 
            AND le.transaction_type = 'sale'
        )
        ORDER BY s.created_at
    ) LOOP
        -- Get Sales Revenue Account
        SELECT id INTO v_sales_account_id
        FROM accounts
        WHERE organization_id = orphan_sale.organization_id
        AND account_type = 'INCOME'
        AND name ILIKE '%sales%revenue%'
        LIMIT 1;

        -- Get Accounts Receivable Account
        SELECT id INTO v_receivables_account_id
        FROM accounts
        WHERE organization_id = orphan_sale.organization_id
        AND account_type = 'ASSET'
        AND name ILIKE '%receivable%'
        LIMIT 1;

        -- Create dual entry if accounts found
        IF v_sales_account_id IS NOT NULL AND v_receivables_account_id IS NOT NULL THEN
            -- Credit: Sales Revenue
            INSERT INTO ledger_entries (
                organization_id, account_id, contact_id,
                debit, credit, entry_date, transaction_type,
                reference_id, reference_no, description
            ) VALUES (
                orphan_sale.organization_id,
                v_sales_account_id,
                NULL,
                0,
                orphan_sale.total_amount,
                orphan_sale.sale_date,
                'sale',
                orphan_sale.id,
                orphan_sale.bill_no,
                'Sale Revenue'
            );

            -- Debit: Accounts Receivable
            INSERT INTO ledger_entries (
                organization_id, account_id, contact_id,
                debit, credit, entry_date, transaction_type,
                reference_id, reference_no, description
            ) VALUES (
                orphan_sale.organization_id,
                v_receivables_account_id,
                orphan_sale.buyer_id,
                orphan_sale.total_amount,
                0,
                orphan_sale.sale_date,
                'sale',
                orphan_sale.id,
                orphan_sale.bill_no,
                'Sale Invoice'
            );

            RAISE NOTICE 'Fixed orphan sale: %', orphan_sale.id;
        END IF;
    END LOOP;
END $$;

-- PART 2: Create global_audit_logs view for Super Admin
-- This replaces the empty global_audit_logs table with a view

-- First, check if global_audit_logs is a table and drop it
DO $$
BEGIN
    -- Drop the table if it exists
    DROP TABLE IF EXISTS global_audit_logs CASCADE;
    
    RAISE NOTICE 'Dropped global_audit_logs table';
END $$;

-- Create a view that shows all audit logs with proper joins
CREATE OR REPLACE VIEW global_audit_logs AS
SELECT 
    al.id,
    al.organization_id,
    al.table_name as entity_type,
    al.action as action_type,
    al.record_id,
    al.changes as details,
    al.changed_by as actor_id,
    al.created_at,
    NULL::inet as ip_address,  -- Placeholder for IP tracking
    o.id as target_org_id
FROM audit_logs al
LEFT JOIN organizations o ON o.id = al.organization_id
ORDER BY al.created_at DESC;

-- Grant permissions
GRANT SELECT ON global_audit_logs TO authenticated;
GRANT SELECT ON global_audit_logs TO service_role;

-- Add comment
COMMENT ON VIEW global_audit_logs IS 'Unified view of all audit logs across organizations for Super Admin access';
