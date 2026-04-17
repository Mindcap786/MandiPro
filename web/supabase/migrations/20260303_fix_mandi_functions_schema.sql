-- Fix mandi.process_sale_return_transaction
CREATE OR REPLACE FUNCTION mandi.process_sale_return_transaction(p_return_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_return_record RECORD;
    v_item RECORD;
    v_voucher_id UUID;
    v_sales_account_id UUID;
    v_cash_account_id UUID;
    v_narration TEXT;
BEGIN
    SELECT * INTO v_return_record FROM mandi.sale_returns WHERE id = p_return_id;
    
    IF v_return_record.status = 'approved' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Return already processed');
    END IF;

    -- Inventory Update (Restock)
    FOR v_item IN SELECT * FROM mandi.sale_return_items WHERE return_id = p_return_id LOOP
        UPDATE mandi.lots 
        SET current_qty = current_qty + v_item.qty 
        WHERE id = v_item.lot_id;
        
        -- Log to Stock Ledger
        INSERT INTO mandi.stock_ledger (
            organization_id, lot_id, transaction_type, qty_change, reference_id
        ) VALUES (
            v_return_record.organization_id, v_item.lot_id, 'sale_return', v_item.qty, p_return_id
        );
    END LOOP;

    -- Accounting
    v_narration := 'Return for Invoice Ref: ' || COALESCE((SELECT bill_no FROM mandi.sales WHERE id = v_return_record.sale_id)::text, 'Unknown');

    -- Create Voucher (mandi.vouchers)
    INSERT INTO mandi.vouchers (
        organization_id, date, type, narration, amount
    ) VALUES (
        v_return_record.organization_id, v_return_record.return_date, 'journal', v_narration || ' (Credit Note)', v_return_record.total_amount
    ) RETURNING id INTO v_voucher_id;

    -- Debit Sales (Reduce Revenue) - Account 3001
    SELECT id INTO v_sales_account_id FROM mandi.accounts WHERE organization_id = v_return_record.organization_id AND code = '3001' LIMIT 1;
    IF v_sales_account_id IS NULL THEN
        -- Fallback to first income account
        SELECT id INTO v_sales_account_id FROM mandi.accounts WHERE organization_id = v_return_record.organization_id AND type = 'income' LIMIT 1;
    END IF;

    -- Debit Sales (Reduce Income)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit, entry_date, description
    ) VALUES (
        v_return_record.organization_id, v_voucher_id, v_sales_account_id, v_return_record.total_amount, 0, v_return_record.return_date, v_narration
    );

    -- Credit Customer (Reduce Receivable - Asset)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, contact_id, debit, credit, entry_date, description
    ) VALUES (
        v_return_record.organization_id, v_voucher_id, v_return_record.contact_id, 0, v_return_record.total_amount, v_return_record.return_date, v_narration
    );

    -- If Cash Refund
    IF v_return_record.return_type = 'cash' THEN
        -- Find Cash Account
        SELECT id INTO v_cash_account_id FROM mandi.accounts WHERE organization_id = v_return_record.organization_id AND (code = '1001' OR name ILIKE 'Cash%') LIMIT 1;
        
        -- Create Payment Voucher (Payout to Customer)
        INSERT INTO mandi.vouchers (
            organization_id, date, type, narration, amount
        ) VALUES (
            v_return_record.organization_id, v_return_record.return_date, 'payment', 'Cash Refund Paid', v_return_record.total_amount
        ) RETURNING id INTO v_voucher_id;

        -- Debit Customer (Settlement)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit, entry_date, description
        ) VALUES (
            v_return_record.organization_id, v_voucher_id, v_return_record.contact_id, v_return_record.total_amount, 0, v_return_record.return_date, 'Refund Paid'
        );

        -- Credit Cash (Asset Down - Money Out)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, description
        ) VALUES (
            v_return_record.organization_id, v_voucher_id, v_cash_account_id, 0, v_return_record.total_amount, v_return_record.return_date, 'Refund Paid'
        );
    END IF;

    UPDATE mandi.sale_returns SET status = 'approved' WHERE id = p_return_id;
    RETURN jsonb_build_object('success', true);
END;
$function$;

-- Fix mandi.get_ledger_statement
CREATE OR REPLACE FUNCTION mandi.get_ledger_statement(p_organization_id uuid, p_contact_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
    v_rows JSONB;
    v_closing_balance NUMERIC;
BEGIN
    -- 1. Calculate Opening Balance
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_opening_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date < p_start_date;

    -- 2. Fetch & Group Transactions
    WITH raw_data AS (
        SELECT 
            le.id,
            le.entry_date,
            le.voucher_id,
            le.transaction_type,
            le.description as raw_description,
            le.debit,
            le.credit,
            le.reference_no,
            le.reference_id,
            l.arrival_id,
            l.lot_code,
            a.bill_no as arrival_bill_no,
            a.reference_no as arrival_ref_no,
            v.type as v_type,
            v.voucher_no as v_voucher_no,
            v.narration as v_narration,
            COALESCE(le.voucher_id::text, l.arrival_id::text, le.id::text) as group_id
        FROM mandi.ledger_entries le
        LEFT JOIN mandi.lots l ON (le.transaction_type = 'lot_purchase' AND le.reference_id = l.id)
        LEFT JOIN mandi.arrivals a ON l.arrival_id = a.id
        LEFT JOIN mandi.vouchers v ON le.voucher_id = v.id
        WHERE le.organization_id = p_organization_id
          AND le.contact_id = p_contact_id
          AND le.entry_date BETWEEN p_start_date AND p_end_date
    ),
    grouped_data AS (
        SELECT
            group_id,
            MIN(id::text)::uuid as sort_id, 
            MIN(entry_date) as entry_date,
            SUM(debit) as debit,
            SUM(credit) as credit,
            CASE 
                WHEN MAX(v_type) = 'sales' OR MAX(raw_description) ILIKE 'Invoice #%' THEN 
                    CASE WHEN SUM(debit) > 0 THEN 'SALE (CREDIT)' ELSE 'SALE (CASH)' END
                WHEN MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL THEN 'PURCHASE'
                WHEN (MAX(v_type) IN ('receipt', 'payment') OR MAX(transaction_type) = 'payment') AND SUM(credit) > 0 THEN 'PAYMENT'
                WHEN SUM(credit) > 0 AND MAX(v_type) IS NULL THEN 'RECEIPT'
                ELSE UPPER(COALESCE(MAX(v_type), MAX(transaction_type), 'TRANSACTION'))
            END as voucher_type,
            COALESCE(
                'Bill #' || NULLIF(MAX(arrival_ref_no), ''),
                'Bill #' || MAX(arrival_bill_no)::TEXT,
                MAX(v_voucher_no)::TEXT,
                MAX(reference_no),
                '-'
            ) as voucher_no,
            CASE 
                WHEN COUNT(*) > 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN 
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no), ''), MAX(arrival_bill_no)::TEXT, 'Multi') || ' (Multi-item)'
                WHEN COUNT(*) = 1 AND (MAX(transaction_type) = 'lot_purchase' OR MAX(arrival_id::text) IS NOT NULL) THEN
                    'Purchase Bill #' || COALESCE(NULLIF(MAX(arrival_ref_no), ''), MAX(arrival_bill_no)::TEXT, '-') || ' | LOT: ' || COALESCE(MAX(lot_code), '-')
                WHEN COUNT(*) > 1 THEN 'Grouped Transaction'
                ELSE MAX(COALESCE(raw_description, v_narration, 'Transaction'))
            END as description
        FROM raw_data
        GROUP BY group_id
    ),
    ranked_tx AS (
        SELECT 
            *,
            SUM(COALESCE(debit, 0) - COALESCE(credit, 0)) OVER (ORDER BY entry_date, sort_id) as running_diff
        FROM grouped_data
    ),
    ordered_tx AS (
        SELECT * FROM ranked_tx
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', group_id,
            'date', entry_date,
            'voucher_type', voucher_type,
            'voucher_no', voucher_no,
            'description', description,
            'debit', debit,
            'credit', credit,
            'products', (
                SELECT jsonb_agg(p) FROM (
                    SELECT jsonb_build_object('name', i.name, 'qty', si.quantity, 'unit', 'Units', 'rate', si.rate, 'lot_no', l1.lot_code) as p
                    FROM (SELECT DISTINCT voucher_id, reference_id FROM raw_data WHERE group_id = OuterQuery.group_id) rd
                    LEFT JOIN mandi.vouchers v ON v.id = rd.voucher_id
                    LEFT JOIN mandi.sales s ON (s.organization_id = p_organization_id AND ( (v.type = 'sales' AND s.id::text = v.invoice_id::text) OR s.id = rd.reference_id))
                    LEFT JOIN mandi.sale_items si ON si.sale_id = s.id
                    LEFT JOIN mandi.lots l1 ON si.lot_id = l1.id
                    LEFT JOIN mandi.commodities i ON l1.item_id = i.id
                    WHERE s.id IS NOT NULL
                    
                    UNION ALL
                    
                    SELECT jsonb_build_object('name', i1.name, 'qty', l2.initial_qty, 'unit', l2.unit, 'rate', l2.supplier_rate, 'lot_no', l2.lot_code) as p
                    FROM (SELECT DISTINCT arrival_id FROM raw_data WHERE group_id = OuterQuery.group_id) ra
                    JOIN mandi.lots l2 ON l2.arrival_id = ra.arrival_id
                    JOIN mandi.commodities i1 ON l2.item_id = i1.id
                    WHERE ra.arrival_id IS NOT NULL
                ) t
            ),
            'running_balance', (v_opening_balance + running_diff)
        )
    ) INTO v_rows
    FROM (SELECT * FROM ordered_tx ORDER BY entry_date DESC, sort_id DESC) OuterQuery;

    -- 3. Calculate Closing Balance
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_closing_balance
    FROM mandi.ledger_entries
    WHERE organization_id = p_organization_id
      AND contact_id = p_contact_id
      AND entry_date <= p_end_date;

    RETURN jsonb_build_object(
        'opening_balance', v_opening_balance,
        'closing_balance', v_closing_balance,
        'transactions', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$function$;

-- Fix mandi.record_advance_payment
CREATE OR REPLACE FUNCTION mandi.record_advance_payment(p_organization_id uuid, p_contact_id uuid, p_lot_id uuid, p_amount numeric, p_payment_mode text, p_date date, p_narration text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_advance_id UUID;
    v_asset_account_id UUID;
    v_voucher_id UUID;
    v_voucher_no BIGINT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Advance amount must be positive.';
    END IF;

    -- Find asset account (cash or bank) in mandi
    IF p_payment_mode = 'cash' THEN
        SELECT id INTO v_asset_account_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND name ILIKE '%Cash%'
        ORDER BY name LIMIT 1;
    ELSE
        SELECT id INTO v_asset_account_id FROM mandi.accounts
        WHERE organization_id = p_organization_id AND name ILIKE '%Bank%'
        ORDER BY name LIMIT 1;
    END IF;

    IF v_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'No % account found. Please create one in Chart of Accounts.',
            CASE p_payment_mode WHEN 'cash' THEN 'Cash' ELSE 'Bank' END;
    END IF;

    -- Record the advance in mandi
    INSERT INTO mandi.advance_payments (
        organization_id, contact_id, lot_id, amount, payment_mode, date, narration, created_by
    ) VALUES (
        p_organization_id, p_contact_id, p_lot_id, p_amount, p_payment_mode, p_date,
        COALESCE(p_narration, 'Farmer Advance / Dadani'), auth.uid()
    ) RETURNING id INTO v_advance_id;

    -- Create voucher in mandi
    -- Note: get_next_voucher_no is assumed to be in public
    v_voucher_no := public.get_next_voucher_no(p_organization_id);
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration)
    VALUES (p_organization_id, p_date, 'payment', v_voucher_no, COALESCE(p_narration, 'Farmer Advance / Dadani'))
    RETURNING id INTO v_voucher_id;

    -- Double entry: Advance in mandi.ledger_entries
    -- DR: Farmer (contact_id)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, transaction_type, reference_id, description)
    VALUES (p_organization_id, v_voucher_id, p_contact_id, p_amount, 0, p_date, 'advance', v_advance_id, 'Advance Payment / Dadani');

    -- CR: Cash/Bank (account_id)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, transaction_type, reference_id, description)
    VALUES (p_organization_id, v_voucher_id, v_asset_account_id, 0, p_amount, p_date, 'advance', v_advance_id, 'Advance Paid from ' || p_payment_mode);

    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_advance_id,
        'voucher_no', v_voucher_no,
        'amount', p_amount
    );
END;
$function$;

-- Fix mandi.process_purchase_return
CREATE OR REPLACE FUNCTION mandi.process_purchase_return(p_organization_id uuid, p_lot_id uuid, p_qty numeric, p_rate numeric, p_remarks text, p_return_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_contact_id UUID;
    v_amount NUMERIC;
    v_return_id UUID;
    v_voucher_id UUID;
    v_purchases_account_id UUID;
    v_narration TEXT;
BEGIN
    -- Get Supplier from Lot
    SELECT contact_id INTO v_contact_id FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id;
    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Lot or Supplier not found';
    END IF;

    v_amount := p_qty * p_rate;

    -- Create Return Record
    INSERT INTO mandi.purchase_returns (organization_id, lot_id, contact_id, qty, rate, amount, remarks, return_date)
    VALUES (p_organization_id, p_lot_id, v_contact_id, p_qty, p_rate, v_amount, p_remarks, p_return_date)
    RETURNING id INTO v_return_id;

    -- Update Lot Quantity (Reduce)
    UPDATE mandi.lots 
    SET current_qty = current_qty - p_qty
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- Log to Stock Ledger
    INSERT INTO mandi.stock_ledger (organization_id, lot_id, transaction_type, qty_change, reference_id)
    VALUES (p_organization_id, p_lot_id, 'purchase_return', -p_qty, v_return_id);

    -- Accounting: Use mandi.vouchers and mandi.ledger_entries
    SELECT id INTO v_purchases_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    IF v_purchases_account_id IS NULL THEN
        SELECT id INTO v_purchases_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND type = 'expense' LIMIT 1;
    END IF;

    v_narration := 'Purchase Return for Lot ' || (SELECT lot_code FROM mandi.lots WHERE id = p_lot_id) || ' - ' || COALESCE(p_remarks, '');

    INSERT INTO mandi.vouchers (organization_id, date, type, narration, amount)
    VALUES (p_organization_id, p_return_date, 'debit_note', v_narration, v_amount)
    RETURNING id INTO v_voucher_id;

    -- Debit Supplier (Reduce Payable)
    INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, domain)
    VALUES (p_organization_id, v_voucher_id, v_contact_id, v_amount, 0, p_return_date, v_narration, 'mandi');

    -- Credit Purchases (Reduce Expense)
    IF v_purchases_account_id IS NOT NULL THEN
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, domain)
        VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, 0, v_amount, p_return_date, v_narration, 'mandi');
    END IF;

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id, 'voucher_id', v_voucher_id);
END;
$function$;

-- Fix mandi.process_purchase_adjustment
CREATE OR REPLACE FUNCTION mandi.process_purchase_adjustment(p_organization_id uuid, p_lot_id uuid, p_new_rate numeric, p_reason text, p_adjustment_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_contact_id UUID;
    v_old_rate NUMERIC;
    v_initial_qty NUMERIC;
    v_diff_rate NUMERIC;
    v_diff_amount NUMERIC;
    v_adjustment_id UUID;
    v_voucher_id UUID;
    v_purchases_account_id UUID;
    v_narration TEXT;
BEGIN
    SELECT contact_id, supplier_rate, initial_qty INTO v_contact_id, v_old_rate, v_initial_qty
    FROM mandi.lots WHERE id = p_lot_id AND organization_id = p_organization_id AND arrival_type = 'direct';

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Lot not found or not a direct purchase';
    END IF;

    v_diff_rate := v_old_rate - p_new_rate; -- e.g. 100 - 90 = 10 discount
    v_diff_amount := v_diff_rate * v_initial_qty;

    IF v_diff_amount = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No difference in rate');
    END IF;

    -- Create Adjustment Record
    INSERT INTO mandi.purchase_adjustments (organization_id, lot_id, old_rate, new_rate, reason, adjustment_date)
    VALUES (p_organization_id, p_lot_id, v_old_rate, p_new_rate, p_reason, p_adjustment_date)
    RETURNING id INTO v_adjustment_id;

    -- Update Lot Rate
    UPDATE mandi.lots 
    SET supplier_rate = p_new_rate
    WHERE id = p_lot_id AND organization_id = p_organization_id;

    -- Accounting
    SELECT id INTO v_purchases_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4001' LIMIT 1;
    IF v_purchases_account_id IS NULL THEN
        SELECT id INTO v_purchases_account_id FROM mandi.accounts WHERE organization_id = p_organization_id AND type = 'expense' LIMIT 1;
    END IF;

    v_narration := 'Purchase Rate Adj for Lot ' || (SELECT lot_code FROM mandi.lots WHERE id = p_lot_id) || ' from ' || v_old_rate || ' to ' || p_new_rate || ' - ' || COALESCE(p_reason, '');

    INSERT INTO mandi.vouchers (organization_id, date, type, narration, amount)
    VALUES (p_organization_id, p_adjustment_date, 'journal', v_narration, ABS(v_diff_amount))
    RETURNING id INTO v_voucher_id;

    IF v_diff_amount > 0 THEN
        -- Discount received (expense down, payable down)
        -- Debit Supplier
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, domain)
        VALUES (p_organization_id, v_voucher_id, v_contact_id, v_diff_amount, 0, p_adjustment_date, v_narration, 'mandi');
        
        -- Credit Purchases
        IF v_purchases_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, domain)
            VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, 0, v_diff_amount, p_adjustment_date, v_narration, 'mandi');
        END IF;
    ELSE
        -- Cost increased (expense up, payable up)
        -- Credit Supplier
        INSERT INTO mandi.ledger_entries (organization_id, voucher_id, contact_id, debit, credit, entry_date, description, domain)
        VALUES (p_organization_id, v_voucher_id, v_contact_id, 0, ABS(v_diff_amount), p_adjustment_date, v_narration, 'mandi');
        
        -- Debit Purchases
        IF v_purchases_account_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (organization_id, voucher_id, account_id, debit, credit, entry_date, description, domain)
            VALUES (p_organization_id, v_voucher_id, v_purchases_account_id, ABS(v_diff_amount), 0, p_adjustment_date, v_narration, 'mandi');
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'adjustment_id', v_adjustment_id, 'voucher_id', v_voucher_id);
END;
$function$;

-- Fix mandi.get_invoice_balance
CREATE OR REPLACE FUNCTION mandi.get_invoice_balance(p_invoice_id uuid)
 RETURNS TABLE(total_amount numeric, amount_paid numeric, balance_due numeric, status text, is_overpaid boolean, overpaid_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_buyer_id UUID;
    v_sale_date DATE;
    v_created_at TIMESTAMPTZ;
    v_invoice_total NUMERIC;
    v_total_credits NUMERIC;
    v_sum_older_invoices NUMERIC;
    v_available_for_this NUMERIC;
BEGIN
    -- 1. Get Invoice Details
    SELECT s.buyer_id, s.sale_date, s.created_at, 
           GREATEST(COALESCE(s.total_amount_inc_tax, 0), COALESCE(s.total_amount, 0))
    INTO v_buyer_id, v_sale_date, v_created_at, v_invoice_total
    FROM mandi.sales s
    WHERE s.id = p_invoice_id;

    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    -- 2. Get Total Ledger Credits
    SELECT COALESCE(SUM(le.credit), 0) INTO v_total_credits
    FROM mandi.ledger_entries le
    WHERE le.contact_id = v_buyer_id;

    -- 3. Sum of Older Invoices (Strict FIFO)
    SELECT COALESCE(SUM(
        GREATEST(COALESCE(s2.total_amount_inc_tax, 0), COALESCE(s2.total_amount, 0))
    ), 0)
    INTO v_sum_older_invoices
    FROM mandi.sales s2
    WHERE s2.buyer_id = v_buyer_id
      AND (s2.sale_date < v_sale_date OR (s2.sale_date = v_sale_date AND s2.created_at < v_created_at))
      AND s2.payment_status != 'cancelled';

    -- 4. Calculate Amount Paid
    v_available_for_this := v_total_credits - v_sum_older_invoices;

    -- Default Values
    is_overpaid := FALSE;
    overpaid_amount := 0;
    status := 'pending';

    IF v_available_for_this <= 0 THEN
        amount_paid := 0;
        balance_due := v_invoice_total;
    ELSIF v_available_for_this >= v_invoice_total THEN
        amount_paid := v_invoice_total;
        balance_due := 0;
        status := 'paid';
        
        -- Check for Overpayment
        IF v_available_for_this > v_invoice_total THEN
             is_overpaid := TRUE;
             overpaid_amount := v_available_for_this - v_invoice_total;
        END IF;
    ELSE
        amount_paid := v_available_for_this;
        balance_due := v_invoice_total - amount_paid;
    END IF;

    total_amount := v_invoice_total;
    
    RETURN NEXT;
END;
$function$;

-- Fix mandi.create_voucher
CREATE OR REPLACE FUNCTION mandi.create_voucher(p_organization_id uuid, p_voucher_type text, p_date timestamp with time zone, p_amount numeric, p_payment_mode text, p_party_id uuid, p_remarks text, p_discount numeric DEFAULT 0, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id UUID;
    v_voucher_no BIGINT;
    v_contra_account_id UUID;
    v_discount_allowed_acc_id UUID;
    v_discount_received_acc_id UUID;
BEGIN
    -- 1. Insert Voucher Header in mandi
    v_voucher_no := public.get_next_voucher_no(p_organization_id);
    INSERT INTO mandi.vouchers (organization_id, type, date, narration, invoice_id, amount, discount_amount, voucher_no)
    VALUES (p_organization_id, p_voucher_type, p_date, p_remarks, p_invoice_id, p_amount, p_discount, v_voucher_no)
    RETURNING id INTO v_voucher_id;

    -- Only check/fetch Cash/Bank account if there is a cash/bank amount
    IF p_amount > 0 THEN
        SELECT id INTO v_contra_account_id FROM mandi.accounts 
        WHERE organization_id = p_organization_id 
        AND code = (CASE WHEN p_payment_mode = 'cash' THEN '1001' ELSE '1002' END)
        LIMIT 1;

        IF v_contra_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash/Bank Account not found in Chart of Accounts';
        END IF;
    END IF;

    IF p_discount > 0 THEN
        SELECT id INTO v_discount_allowed_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '4006' LIMIT 1;
        SELECT id INTO v_discount_received_acc_id FROM mandi.accounts WHERE organization_id = p_organization_id AND code = '3003' LIMIT 1;
    END IF;

    IF p_voucher_type = 'payment' THEN
        -- PAYING OUT (DR Party, CR Cash/Bank)
        
        -- A. Party Debit
        INSERT INTO mandi.ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            contact_id, description, debit, credit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
            p_party_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
        );

        -- B. Bank/Cash Credit
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
                v_contra_account_id, 'Payment Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;

        -- C. Discount Received Credit
        IF p_discount > 0 AND v_discount_received_acc_id IS NOT NULL THEN
             INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, credit, debit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'payment', v_voucher_id, v_voucher_no::TEXT,
                v_discount_received_acc_id, 'Discount Received', p_discount, 0, v_voucher_id
            );
        END IF;
        
    ELSIF p_voucher_type = 'receipt' THEN
        -- RECEIVING IN (DR Cash/Bank, CR Party)
        
        -- A. Cash/Bank Debit
        IF p_amount > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
                v_contra_account_id, 'Receipt Mode: ' || p_payment_mode, p_amount, 0, v_voucher_id
            );
        END IF;

        -- B. Discount Allowed Debit
        IF p_discount > 0 AND v_discount_allowed_acc_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, entry_date, transaction_type, reference_id, reference_no,
                account_id, description, debit, credit, voucher_id
            ) VALUES (
                p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
                v_discount_allowed_acc_id, 'Discount Allowed', p_discount, 0, v_voucher_id
            );
        END IF;

        -- C. Party Credit
        INSERT INTO mandi.ledger_entries (
            organization_id, entry_date, transaction_type, reference_id, reference_no,
            contact_id, description, credit, debit, voucher_id
        ) VALUES (
            p_organization_id, p_date, 'receipt', v_voucher_id, v_voucher_no::TEXT,
            p_party_id, p_remarks, (p_amount + p_discount), 0, v_voucher_id
        );

        -- D. UPDATE INVOICE STATUS in mandi
        IF p_invoice_id IS NOT NULL THEN
            UPDATE mandi.sales 
            SET status = 'paid'
            WHERE id = p_invoice_id;
        END IF;

    END IF;

    RETURN jsonb_build_object('id', v_voucher_id, 'voucher_no', v_voucher_no);
END;
$function$;
