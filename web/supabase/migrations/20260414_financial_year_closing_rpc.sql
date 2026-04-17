-- ============================================================
-- STATUTORY COMPLIANCE: Financial Year Closing (March 31)
-- Migration: 20260414_financial_year_closing_rpc.sql
--
-- GOAL: 
-- 1. Automate the zeroing of Nominal Accounts (Income/Expense).
-- 2. Transfer Net Profit/Loss to Retained Earnings (Equity).
-- 3. Ensure a clean audit trail for fiscal year breaks.
-- ============================================================

CREATE OR REPLACE FUNCTION mandi.close_financial_year(
    p_organization_id uuid,
    p_closing_date date,
    p_retained_earnings_acc_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher_id       uuid;
    v_voucher_no       bigint;
    v_row              record;
    v_net_profit       numeric := 0;
    v_total_posted     integer := 0;
BEGIN
    -- 1. Create a "Year-End Closing" Voucher
    v_voucher_no := core.next_voucher_no(p_organization_id);
    
    INSERT INTO mandi.vouchers (organization_id, date, type, voucher_no, narration)
    VALUES (p_organization_id, p_closing_date, 'journal', v_voucher_no, 'Financial Year Closing - Nominal Account Clearing')
    RETURNING id INTO v_voucher_id;

    -- 2. Iterate through all Income and Expense accounts with non-zero balances
    FOR v_row IN 
        SELECT 
            account_id, 
            SUM(debit - credit) as balance
        FROM mandi.ledger_entries
        WHERE organization_id = p_organization_id
          AND entry_date <= p_closing_date
          AND account_id IN (
              SELECT id FROM mandi.accounts 
              WHERE organization_id = p_organization_id 
                AND type IN ('income', 'expense')
          )
        GROUP BY account_id
        HAVING SUM(debit - credit) != 0
    LOOP
        -- Zero out the account
        -- If balance is positive (Dr), we need to Credit it.
        -- If balance is negative (Cr), we need to Debit it.
        
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, 
            description, transaction_type
        ) VALUES (
            p_organization_id, v_voucher_id, v_row.account_id,
            CASE WHEN v_row.balance < 0 THEN ABS(v_row.balance) ELSE 0 END,
            CASE WHEN v_row.balance > 0 THEN ABS(v_row.balance) ELSE 0 END,
            p_closing_date,
            'Year-End Zeroing',
            'closing'
        );

        -- Accumulate Net Profit (Positive balance = Expense/Debit, Negative = Income/Credit)
        -- Standard Formula: Net Profit = Income - Expense
        -- Here, v_row.balance is (Dr - Cr). 
        -- If income, balance is negative. If expense, balance is positive.
        v_net_profit := v_net_profit - v_row.balance;
        v_total_posted := v_total_posted + 1;
    END LOOP;

    -- 3. Post the Net Profit/Loss to Retained Earnings
    IF v_net_profit != 0 THEN
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit, entry_date, 
            description, transaction_type
        ) VALUES (
            p_organization_id, v_voucher_id, p_retained_earnings_acc_id,
            CASE WHEN v_net_profit < 0 THEN ABS(v_net_profit) ELSE 0 END,
            CASE WHEN v_net_profit > 0 THEN ABS(v_net_profit) ELSE 0 END,
            p_closing_date,
            'Transferred to Retained Earnings',
            'closing'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'voucher_no', v_voucher_no, 
        'accounts_zeroed', v_total_posted, 
        'net_result', v_net_profit
    );
END;
$function$;
