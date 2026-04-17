-- Migration: Sync Sales to Ledger (Double Entry) & Backfill
-- Date: 2026-02-15
-- Author: Antigravity

-- 1. Create Trigger Function
CREATE OR REPLACE FUNCTION manage_sales_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_sales_acct_id UUID;
    v_ar_acct_id UUID;
    v_amount NUMERIC;
BEGIN
    -- Get Sales/Income Account ID
    SELECT id INTO v_sales_acct_id FROM accounts 
    WHERE organization_id = NEW.organization_id 
      AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income') 
      AND name NOT ILIKE '%Commission%' 
    ORDER BY name = 'Sales' DESC, name = 'Sales Revenue' DESC
    LIMIT 1;

    -- Get Accounts Receivable ID
    SELECT id INTO v_ar_acct_id FROM accounts 
    WHERE organization_id = NEW.organization_id 
      AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%' OR name ILIKE '%Debtors%')
    LIMIT 1;

    -- Calculate Amount
    v_amount := GREATEST(COALESCE(NEW.total_amount_inc_tax, 0), COALESCE(NEW.total_amount, 0));

    IF (TG_OP = 'INSERT') THEN
        -- Debit Customer (AR)
        IF v_ar_acct_id IS NOT NULL THEN
            INSERT INTO ledger_entries (
                organization_id, contact_id, account_id, reference_id, reference_no,
                transaction_type, description, entry_date, debit, credit
            ) VALUES (
                NEW.organization_id, NEW.buyer_id, v_ar_acct_id, NEW.id, NEW.bill_no::TEXT,
                'sale', 'Invoice #' || NEW.bill_no, NEW.sale_date, v_amount, 0
            );
        END IF;
        
        -- Credit Sales (Income)
        IF v_sales_acct_id IS NOT NULL THEN
            INSERT INTO ledger_entries (
                organization_id, contact_id, account_id, reference_id, reference_no,
                transaction_type, description, entry_date, debit, credit
            ) VALUES (
                NEW.organization_id, NULL, v_sales_acct_id, NEW.id, NEW.bill_no::TEXT,
                'sale', 'Sales Revenue - Inv #' || NEW.bill_no, NEW.sale_date, 0, v_amount
            );
        END IF;

    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only update if amount or buyer changed
        IF (OLD.total_amount_inc_tax IS DISTINCT FROM NEW.total_amount_inc_tax) OR
           (OLD.total_amount IS DISTINCT FROM NEW.total_amount) OR
           (OLD.buyer_id IS DISTINCT FROM NEW.buyer_id) THEN
            
            -- Update Debit Entry (AR)
            UPDATE ledger_entries
            SET 
                debit = v_amount,
                contact_id = NEW.buyer_id,
                account_id = v_ar_acct_id,
                entry_date = NEW.sale_date
            WHERE reference_id = NEW.id 
              AND transaction_type = 'sale'
              AND (debit > 0 OR credit = 0);

            -- Update Credit Entry (Income)
            UPDATE ledger_entries
            SET 
                credit = v_amount,
                account_id = v_sales_acct_id,
                entry_date = NEW.sale_date
            WHERE reference_id = NEW.id 
              AND transaction_type = 'sale'
              AND (credit > 0 OR debit = 0);
              
            -- Handle potential missing entries (insert if not found)
            IF NOT FOUND THEN
                 -- Debit Customer (AR)
                IF v_ar_acct_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = NEW.id AND transaction_type = 'sale' AND debit > 0) THEN
                    INSERT INTO ledger_entries (
                        organization_id, contact_id, account_id, reference_id, reference_no,
                        transaction_type, description, entry_date, debit, credit
                    ) VALUES (
                        NEW.organization_id, NEW.buyer_id, v_ar_acct_id, NEW.id, NEW.bill_no::TEXT,
                        'sale', 'Invoice #' || NEW.bill_no, NEW.sale_date, v_amount, 0
                    );
                END IF;
                
                -- Credit Sales (Income)
                IF v_sales_acct_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = NEW.id AND transaction_type = 'sale' AND credit > 0) THEN
                    INSERT INTO ledger_entries (
                        organization_id, contact_id, account_id, reference_id, reference_no,
                        transaction_type, description, entry_date, debit, credit
                    ) VALUES (
                        NEW.organization_id, NULL, v_sales_acct_id, NEW.id, NEW.bill_no::TEXT,
                        'sale', 'Sales Revenue - Inv #' || NEW.bill_no, NEW.sale_date, 0, v_amount
                    );
                END IF;
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM ledger_entries 
        WHERE reference_id = OLD.id AND transaction_type = 'sale';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Apply Trigger
DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON sales;
CREATE TRIGGER trg_sync_sales_ledger
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION manage_sales_ledger_entry();

-- 3. Backfill Script (Double Entry)
DO $$
DECLARE
    r RECORD;
    v_sales_acct_id UUID;
    v_ar_acct_id UUID;
    v_amount NUMERIC;
BEGIN
    FOR r IN SELECT * FROM sales LOOP
        -- Get IDs
        SELECT id INTO v_sales_acct_id FROM accounts 
        WHERE organization_id = r.organization_id 
          AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income') 
        ORDER BY name = 'Sales' DESC, name = 'Sales Revenue' DESC LIMIT 1;

        SELECT id INTO v_ar_acct_id FROM accounts 
        WHERE organization_id = r.organization_id 
          AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%' OR name ILIKE '%Debtors%')
        LIMIT 1;

        v_amount := GREATEST(COALESCE(r.total_amount_inc_tax, 0), COALESCE(r.total_amount, 0));

        -- Insert Debit if missing
        IF v_ar_acct_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = r.id AND transaction_type = 'sale' AND debit > 0) THEN
            INSERT INTO ledger_entries (
                organization_id, contact_id, account_id, reference_id, reference_no,
                transaction_type, description, entry_date, debit, credit
            ) VALUES (
                r.organization_id, r.buyer_id, v_ar_acct_id, r.id, r.bill_no::TEXT,
                'sale', 'Invoice #' || r.bill_no, r.sale_date, v_amount, 0
            );
        END IF;

        -- Insert Credit if missing
        IF v_sales_acct_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE reference_id = r.id AND transaction_type = 'sale' AND credit > 0) THEN
             INSERT INTO ledger_entries (
                organization_id, contact_id, account_id, reference_id, reference_no,
                transaction_type, description, entry_date, debit, credit
            ) VALUES (
                r.organization_id, NULL, v_sales_acct_id, r.id, r.bill_no::TEXT,
                'sale', 'Sales Revenue - Inv #' || r.bill_no, r.sale_date, 0, v_amount
            );
        END IF;
    END LOOP;
END $$;
