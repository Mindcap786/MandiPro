-- Ensure every mandi sale posts into mandi.ledger_entries.
-- This restores the missing mandi.sales trigger and backfills sales
-- that were created without ledger rows.

CREATE OR REPLACE FUNCTION mandi.manage_sales_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_sales_acct_id uuid;
    v_ar_acct_id uuid;
    v_amount numeric;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);

    SELECT id
    INTO v_sales_acct_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
      AND name NOT ILIKE '%Commission%'
    ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
    LIMIT 1;

    SELECT id
    INTO v_ar_acct_id
    FROM mandi.accounts
    WHERE organization_id = v_org_id
      AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%' OR name ILIKE '%Debtors%')
    ORDER BY (name = 'Buyers Receivable') DESC, name
    LIMIT 1;

    IF TG_OP = 'DELETE' THEN
        DELETE FROM mandi.ledger_entries
        WHERE reference_id = OLD.id
          AND transaction_type = 'sale';

        RETURN OLD;
    END IF;

    v_amount := GREATEST(COALESCE(NEW.total_amount_inc_tax, 0), COALESCE(NEW.total_amount, 0));

    IF TG_OP = 'INSERT' THEN
        IF v_ar_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = NEW.id
                 AND transaction_type = 'sale'
                 AND debit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                NEW.organization_id,
                NEW.buyer_id,
                v_ar_acct_id,
                NEW.id,
                NEW.bill_no::text,
                'sale',
                'Invoice #' || NEW.bill_no,
                NEW.sale_date,
                v_amount,
                0
            );
        END IF;

        IF v_sales_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = NEW.id
                 AND transaction_type = 'sale'
                 AND credit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                NEW.organization_id,
                NULL,
                v_sales_acct_id,
                NEW.id,
                NEW.bill_no::text,
                'sale',
                'Sales Revenue - Inv #' || NEW.bill_no,
                NEW.sale_date,
                0,
                v_amount
            );
        END IF;

        RETURN NEW;
    END IF;

    UPDATE mandi.ledger_entries
    SET organization_id = NEW.organization_id,
        contact_id = NEW.buyer_id,
        account_id = v_ar_acct_id,
        reference_no = NEW.bill_no::text,
        description = 'Invoice #' || NEW.bill_no,
        entry_date = NEW.sale_date,
        debit = v_amount,
        credit = 0
    WHERE reference_id = NEW.id
      AND transaction_type = 'sale'
      AND debit > 0;

    IF NOT FOUND
       AND v_ar_acct_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mandi.ledger_entries
           WHERE reference_id = NEW.id
             AND transaction_type = 'sale'
             AND debit > 0
       ) THEN
        INSERT INTO mandi.ledger_entries (
            organization_id,
            contact_id,
            account_id,
            reference_id,
            reference_no,
            transaction_type,
            description,
            entry_date,
            debit,
            credit
        ) VALUES (
            NEW.organization_id,
            NEW.buyer_id,
            v_ar_acct_id,
            NEW.id,
            NEW.bill_no::text,
            'sale',
            'Invoice #' || NEW.bill_no,
            NEW.sale_date,
            v_amount,
            0
        );
    END IF;

    UPDATE mandi.ledger_entries
    SET organization_id = NEW.organization_id,
        contact_id = NULL,
        account_id = v_sales_acct_id,
        reference_no = NEW.bill_no::text,
        description = 'Sales Revenue - Inv #' || NEW.bill_no,
        entry_date = NEW.sale_date,
        debit = 0,
        credit = v_amount
    WHERE reference_id = NEW.id
      AND transaction_type = 'sale'
      AND credit > 0;

    IF NOT FOUND
       AND v_sales_acct_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mandi.ledger_entries
           WHERE reference_id = NEW.id
             AND transaction_type = 'sale'
             AND credit > 0
       ) THEN
        INSERT INTO mandi.ledger_entries (
            organization_id,
            contact_id,
            account_id,
            reference_id,
            reference_no,
            transaction_type,
            description,
            entry_date,
            debit,
            credit
        ) VALUES (
            NEW.organization_id,
            NULL,
            v_sales_acct_id,
            NEW.id,
            NEW.bill_no::text,
            'sale',
            'Sales Revenue - Inv #' || NEW.bill_no,
            NEW.sale_date,
            0,
            v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_sales_ledger ON mandi.sales;

CREATE TRIGGER trg_sync_sales_ledger
AFTER INSERT OR UPDATE OR DELETE ON mandi.sales
FOR EACH ROW
EXECUTE FUNCTION mandi.manage_sales_ledger_entry();

DO $$
DECLARE
    r record;
    v_sales_acct_id uuid;
    v_ar_acct_id uuid;
    v_amount numeric;
BEGIN
    FOR r IN
        SELECT *
        FROM mandi.sales
    LOOP
        SELECT id
        INTO v_sales_acct_id
        FROM mandi.accounts
        WHERE organization_id = r.organization_id
          AND (name ILIKE 'Sales%' OR name = 'Revenue' OR type = 'income')
          AND name NOT ILIKE '%Commission%'
        ORDER BY (name = 'Sales') DESC, (name = 'Sales Revenue') DESC, name
        LIMIT 1;

        SELECT id
        INTO v_ar_acct_id
        FROM mandi.accounts
        WHERE organization_id = r.organization_id
          AND (name = 'Buyers Receivable' OR name ILIKE '%Receivable%' OR name ILIKE '%Debtors%')
        ORDER BY (name = 'Buyers Receivable') DESC, name
        LIMIT 1;

        v_amount := GREATEST(COALESCE(r.total_amount_inc_tax, 0), COALESCE(r.total_amount, 0));

        IF v_ar_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = r.id
                 AND transaction_type = 'sale'
                 AND debit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                r.organization_id,
                r.buyer_id,
                v_ar_acct_id,
                r.id,
                r.bill_no::text,
                'sale',
                'Invoice #' || r.bill_no,
                r.sale_date,
                v_amount,
                0
            );
        END IF;

        IF v_sales_acct_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
               FROM mandi.ledger_entries
               WHERE reference_id = r.id
                 AND transaction_type = 'sale'
                 AND credit > 0
           ) THEN
            INSERT INTO mandi.ledger_entries (
                organization_id,
                contact_id,
                account_id,
                reference_id,
                reference_no,
                transaction_type,
                description,
                entry_date,
                debit,
                credit
            ) VALUES (
                r.organization_id,
                NULL,
                v_sales_acct_id,
                r.id,
                r.bill_no::text,
                'sale',
                'Sales Revenue - Inv #' || r.bill_no,
                r.sale_date,
                0,
                v_amount
            );
        END IF;
    END LOOP;
END $$;
