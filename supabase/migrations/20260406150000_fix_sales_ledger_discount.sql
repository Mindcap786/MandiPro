-- Fix: Sales ledger trigger uses GREATEST(total_amount_inc_tax, total_amount)
-- which picks the raw pre-discount amount when a discount is applied.
-- Changed to prefer total_amount_inc_tax (final amount after discount + charges + tax)
-- and only fall back to total_amount for legacy rows where total_amount_inc_tax is NULL/0.

CREATE OR REPLACE FUNCTION mandi.manage_sales_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_sales_acct_id uuid;
    v_ar_acct_id uuid;
    v_amount numeric;
    v_org_id uuid;
    v_reference_no text;
BEGIN
    v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    v_reference_no := coalesce(COALESCE(NEW.contact_bill_no, OLD.contact_bill_no), COALESCE(NEW.bill_no, OLD.bill_no))::text;

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

    -- Use total_amount_inc_tax (final amount after discount, charges, and tax) when available.
    -- Fall back to total_amount only for legacy rows where total_amount_inc_tax is not set.
    v_amount := CASE
        WHEN COALESCE(NEW.total_amount_inc_tax, 0) > 0 THEN NEW.total_amount_inc_tax
        ELSE COALESCE(NEW.total_amount, 0)
    END;

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
                v_reference_no,
                'sale',
                'Invoice #' || v_reference_no,
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
                v_reference_no,
                'sale',
                'Sales Revenue - Inv #' || v_reference_no,
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
        reference_no = v_reference_no,
        description = 'Invoice #' || v_reference_no,
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
            v_reference_no,
            'sale',
            'Invoice #' || v_reference_no,
            NEW.sale_date,
            v_amount,
            0
        );
    END IF;

    UPDATE mandi.ledger_entries
    SET organization_id = NEW.organization_id,
        contact_id = NULL,
        account_id = v_sales_acct_id,
        reference_no = v_reference_no,
        description = 'Sales Revenue - Inv #' || v_reference_no,
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
            v_reference_no,
            'sale',
            'Sales Revenue - Inv #' || v_reference_no,
            NEW.sale_date,
            0,
            v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;
