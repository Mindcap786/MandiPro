-- Add products column to ledger_entries and populate from sales

ALTER TABLE mandi.ledger_entries ADD COLUMN products JSONB;

-- Update the manage_sales_ledger_entry trigger to include product details
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
    v_products jsonb;
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

    -- Pre-fetch product details for this sale
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', c.name,
            'qty', si.qty,
            'unit', si.unit,
            'rate', si.rate,
            'amount', si.amount,
            'tax_amount', si.tax_amount
        )
    )
    INTO v_products
    FROM mandi.sale_items si
    JOIN mandi.lots l ON si.lot_id = l.id
    JOIN mandi.commodities i ON l.item_id = i.id
    WHERE si.sale_id = COALESCE(NEW.id, OLD.id);

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
                credit,
                products
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
                0,
                v_products
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
                credit,
                products
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
                v_amount,
                v_products
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
        credit = 0,
        products = v_products
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
            credit,
            products
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
            0,
            v_products
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
        credit = v_amount,
        products = v_products
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
            credit,
            products
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
            v_amount,
            v_products
        );
    END IF;

    RETURN NEW;
END;
$function$;