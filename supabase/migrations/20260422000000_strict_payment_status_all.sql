-- ============================================================
-- STRICT PAYMENT STATUS: ALL SALE & PURCHASE ENTRY POINTS
-- Migration: 20260422000000_strict_payment_status_all.sql
-- ============================================================
-- RULES ENFORCED:
--
-- SALES (POS / New Invoice / Bulk Lot Sale):
--   Cash/UPI/Bank + full amount  → paid
--   Cash/UPI/Bank + partial amt  → partial  (balance stays as Udhaar receivable)
--   Udhaar / Credit              → pending
--   Cheque not yet cleared       → pending  (treated as Udhaar)
--   Cheque instantly cleared     → paid / partial  (same as cash rule)
--   [Note: 'overdue' is a UI-level display rule: pending/partial past due_date]
--
-- PURCHASES (Arrivals / Quick Purchase):
--   Cash advance >= bill         → paid
--   Cash advance > 0 < bill      → partial
--   No advance                   → pending
--   Cheque advance not cleared   → pending  (no ledger entry; placeholder voucher created)
--   Cheque instantly cleared     → paid / partial  (counts as cash advance)
--
-- CHEQUE CLEARANCE (both Sale and Purchase):
--   When cleared via clear_cheque:
--   → correct ledger entries posted (money IN for sales, money OUT for purchases)
--   → status recalculated mathematically (paid / partial / pending)
--   → same flow as Udhaar payment for tracking in ledger
-- ============================================================

-- ============================================================
-- PART 1: mandi.post_arrival_ledger
-- Source: Arrivals (Gate) + Quick Purchase both call this
-- ============================================================

CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_arrival          RECORD;
    v_lot              RECORD;
    v_org_id           UUID;
    v_party_id         UUID;
    v_arrival_date     DATE;
    v_reference_no     TEXT;
    v_arrival_type     TEXT;

    -- Account IDs
    v_purchase_acc_id          UUID;
    v_expense_recovery_acc_id  UUID;
    v_cash_acc_id              UUID;
    v_commission_income_acc_id UUID;
    v_inventory_acc_id         UUID;

    -- Bill aggregates
    v_total_commission  NUMERIC := 0;
    v_total_inventory   NUMERIC := 0;
    v_total_direct_cost NUMERIC := 0;
    v_total_transport   NUMERIC := 0;
    v_lot_count         INT     := 0;

    -- Voucher
    v_main_voucher_id UUID;
    v_voucher_no      BIGINT;
    v_gross_bill      NUMERIC;

    -- Payment tracking
    v_total_advance_cleared NUMERIC := 0;  -- only cash + cleared-cheque advances
    v_final_status          TEXT    := 'pending';

    -- Advance loop
    v_adv        RECORD;
    v_contra_acc UUID;
    v_pend_vo_no BIGINT;
BEGIN
    -- 0. Fetch arrival (LEFT JOIN keeps party-less direct purchases)
    SELECT a.*, c.name AS party_name INTO v_arrival
    FROM mandi.arrivals a
    LEFT JOIN mandi.contacts c ON a.party_id = c.id
    WHERE a.id = p_arrival_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found');
    END IF;

    v_org_id       := v_arrival.organization_id;
    v_party_id     := v_arrival.party_id;  -- may be NULL for direct/party-less purchases
    v_arrival_date := v_arrival.arrival_date;
    v_reference_no := COALESCE(v_arrival.reference_no, '#' || v_arrival.bill_no);
    v_arrival_type := CASE v_arrival.arrival_type
                        WHEN 'farmer'   THEN 'commission'
                        WHEN 'purchase' THEN 'direct'
                        ELSE v_arrival.arrival_type
                      END;

    -- Cleanup: remove old purchase ledger entries and their vouchers
    WITH del AS (
        DELETE FROM mandi.ledger_entries
        WHERE (reference_id = p_arrival_id
               OR reference_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id))
          AND transaction_type = 'purchase'
        RETURNING voucher_id
    )
    DELETE FROM mandi.vouchers
    WHERE id IN (SELECT voucher_id FROM del WHERE voucher_id IS NOT NULL)
      AND type = 'purchase';

    -- Cleanup: remove uncleared cheque placeholder payment vouchers (will recreate below)
    DELETE FROM mandi.vouchers
    WHERE arrival_id = p_arrival_id
      AND type = 'payment'
      AND COALESCE(is_cleared, false) = false
      AND cheque_status = 'Pending';

    -- 1. Get accounts
    SELECT id INTO v_purchase_acc_id          FROM mandi.accounts WHERE organization_id = v_org_id AND code = '5001' LIMIT 1;
    SELECT id INTO v_expense_recovery_acc_id  FROM mandi.accounts WHERE organization_id = v_org_id AND code = '4002' LIMIT 1;
    SELECT id INTO v_cash_acc_id              FROM mandi.accounts WHERE organization_id = v_org_id AND code = '1001' LIMIT 1;
    SELECT id INTO v_commission_income_acc_id FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Commission Income%' LIMIT 1;
    SELECT id INTO v_inventory_acc_id         FROM mandi.accounts WHERE organization_id = v_org_id AND name ILIKE '%Inventory%' LIMIT 1;

    -- 2. Calculate bill aggregates from lots
    FOR v_lot IN SELECT * FROM mandi.lots WHERE arrival_id = p_arrival_id LOOP
        v_lot_count := v_lot_count + 1;
        DECLARE
            v_adj_qty NUMERIC := CASE
                WHEN COALESCE(v_lot.less_units, 0) > 0
                THEN COALESCE(v_lot.initial_qty, 0) - COALESCE(v_lot.less_units, 0)
                ELSE COALESCE(v_lot.initial_qty, 0) * (1.0 - COALESCE(v_lot.less_percent, 0) / 100.0)
            END;
            v_val NUMERIC := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
        BEGIN
            IF v_arrival_type = 'commission' THEN
                v_total_commission := v_total_commission + (v_val * COALESCE(v_lot.commission_percent, 0) / 100.0);
                v_total_inventory  := v_total_inventory  + v_val;
            ELSE
                v_total_direct_cost := v_total_direct_cost + (v_val - COALESCE(v_lot.farmer_charges, 0));
                v_total_commission  := v_total_commission  + ((v_val - COALESCE(v_lot.farmer_charges, 0)) * COALESCE(v_lot.commission_percent, 0) / 100.0);
            END IF;
        END;
    END LOOP;

    IF v_lot_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'msg', 'No lots');
    END IF;

    v_total_transport := COALESCE(v_arrival.hire_charges, 0)
                       + COALESCE(v_arrival.hamali_expenses, 0)
                       + COALESCE(v_arrival.other_expenses, 0);

    v_gross_bill := CASE WHEN v_arrival_type = 'commission'
                    THEN v_total_inventory
                    ELSE v_total_direct_cost
                   END;

    -- 3. Create ONE purchase voucher (goods entry only)
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_voucher_no
    FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'purchase';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        party_id, arrival_id
    ) VALUES (
        v_org_id, v_arrival_date, 'purchase', v_voucher_no,
        'Arrival ' || v_reference_no, v_gross_bill,
        v_party_id, p_arrival_id
    ) RETURNING id INTO v_main_voucher_id;

    -- 4. Goods-side ledger entries
    -- Dr Purchase/Inventory account (goods come in)
    INSERT INTO mandi.ledger_entries (
        organization_id, voucher_id, account_id, debit, credit,
        entry_date, description, transaction_type, reference_id
    ) VALUES (
        v_org_id, v_main_voucher_id,
        CASE WHEN v_arrival_type = 'commission' THEN v_inventory_acc_id ELSE v_purchase_acc_id END,
        v_gross_bill, 0, v_arrival_date, 'Goods Received', 'purchase', p_arrival_id
    );

    IF v_party_id IS NOT NULL THEN
        -- Cr Party (we owe them this amount)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, contact_id, debit, credit,
            entry_date, description, transaction_type, reference_id
        ) VALUES (
            v_org_id, v_main_voucher_id, v_party_id, 0, v_gross_bill,
            v_arrival_date, 'Goods Payable', 'purchase', p_arrival_id
        );

        -- Transport / Hamali Recovery: Dr Party, Cr Recovery Account
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_party_id,
                v_total_transport, 0, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id
            );
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_expense_recovery_acc_id,
                0, v_total_transport, v_arrival_date, 'Transport Recovery', 'purchase', p_arrival_id
            );
        END IF;

        -- Commission Deduction: Dr Party, Cr Commission Income
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_party_id,
                v_total_commission, 0, v_arrival_date, 'Commission Deduction', 'purchase', p_arrival_id
            );
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_commission_income_acc_id,
                0, v_total_commission, v_arrival_date, 'Commission Income', 'purchase', p_arrival_id
            );
        END IF;

    ELSE
        -- Party-less: only account-side entries for transport/commission
        IF v_total_transport > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_expense_recovery_acc_id,
                0, v_total_transport, v_arrival_date, 'Transport (No Party)', 'purchase', p_arrival_id
            );
        END IF;
        IF v_total_commission > 0 THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_commission_income_acc_id,
                0, v_total_commission, v_arrival_date, 'Commission (No Party)', 'purchase', p_arrival_id
            );
        END IF;
    END IF;

    -- 5. Process Advances — strict cash/cheque separation
    FOR v_adv IN
        SELECT
            COALESCE(advance_payment_mode, 'cash') AS mode,
            COALESCE(advance_cheque_status, false)  AS chq_cleared,
            advance_cheque_no                        AS chq_no,
            advance_cheque_date                      AS chq_date,
            advance_bank_name                        AS bnk_name,
            advance_bank_account_id                  AS bank_acc_id,
            SUM(advance)                             AS total_adv
        FROM mandi.lots
        WHERE arrival_id = p_arrival_id AND COALESCE(advance, 0) > 0
        GROUP BY 1, 2, 3, 4, 5, 6
    LOOP
        -- Resolve contra (cash or bank) account
        v_contra_acc := CASE
            WHEN v_adv.mode = 'cash' THEN v_cash_acc_id
            ELSE COALESCE(v_adv.bank_acc_id, v_cash_acc_id)
        END;

        IF v_adv.mode IN ('cash', 'upi', 'bank_transfer', 'bank', 'UPI/BANK')
           OR (v_adv.mode = 'cheque' AND v_adv.chq_cleared = true)
        THEN
            -- ─── IMMEDIATE PAYMENT ───
            -- Cash, UPI, bank transfer, or instantly-cleared cheque
            -- → Record in ledger NOW, counts toward paid/partial status
            v_total_advance_cleared := v_total_advance_cleared + v_adv.total_adv;

            IF v_party_id IS NOT NULL THEN
                -- Dr Party (reduces what we owe them)
                INSERT INTO mandi.ledger_entries (
                    organization_id, voucher_id, contact_id, debit, credit,
                    entry_date, description, transaction_type, reference_id
                ) VALUES (
                    v_org_id, v_main_voucher_id, v_party_id,
                    v_adv.total_adv, 0, v_arrival_date,
                    'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id
                );
            END IF;
            -- Cr Cash/Bank (money leaves)
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, account_id, debit, credit,
                entry_date, description, transaction_type, reference_id
            ) VALUES (
                v_org_id, v_main_voucher_id, v_contra_acc,
                0, v_adv.total_adv, v_arrival_date,
                'Advance Paid (' || v_adv.mode || ')', 'purchase', p_arrival_id
            );

        ELSE
            -- ─── UNCLEARED CHEQUE = UDHAAR ───
            -- Treat exactly like Udhaar: no ledger entry now.
            -- Create a pending placeholder voucher so the UI can call clear_cheque() later.
            -- When cleared, ledger entries are posted the same way as a Udhaar payment.
            SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_pend_vo_no
            FROM mandi.vouchers WHERE organization_id = v_org_id AND type = 'payment';

            INSERT INTO mandi.vouchers (
                organization_id, date, type, voucher_no, narration, amount,
                arrival_id, party_id,
                cheque_no, cheque_date, bank_name,
                cheque_status, is_cleared, bank_account_id
            ) VALUES (
                v_org_id, v_arrival_date, 'payment', v_pend_vo_no,
                'Pending Cheque — Arrival ' || v_reference_no,
                v_adv.total_adv,
                p_arrival_id, v_party_id,
                v_adv.chq_no, v_adv.chq_date, v_adv.bnk_name,
                'Pending', false, v_adv.bank_acc_id
            );
            -- No ledger entries created; will be posted when clear_cheque() is called.
        END IF;
    END LOOP;

    -- 6. Calculate status based ONLY on cleared (cash/instant) advances
    IF v_total_advance_cleared >= v_gross_bill AND v_gross_bill > 0 THEN
        v_final_status := 'paid';
    ELSIF v_total_advance_cleared > 0 THEN
        v_final_status := 'partial';
    ELSE
        v_final_status := 'pending';
    END IF;

    UPDATE mandi.arrivals SET status = v_final_status WHERE id = p_arrival_id;
    UPDATE mandi.purchase_bills
       SET payment_status = v_final_status
     WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = p_arrival_id);

    RETURN jsonb_build_object(
        'success',        true,
        'arrival_id',     p_arrival_id,
        'status',         v_final_status,
        'cleared_amount', v_total_advance_cleared,
        'gross_bill',     v_gross_bill,
        'message',        'Arrival recorded. Payment status: ' || v_final_status
    );
END;
$function$;


-- ============================================================
-- PART 2: mandi.clear_cheque
-- Called when:
--   - A buyer's sale cheque is cleared (money IN)
--   - A supplier/farmer's advance cheque is cleared (money OUT)
-- Fixes:
--   - Ledger signs for SALE were reversed (Dr Buyer / Cr Bank)
--     → now correct: Dr Bank (asset up) / Cr Buyer (debt down)
--   - Status always set 'paid' regardless of partial coverage
--     → now calculates paid / partial / pending from real totals
-- ============================================================

CREATE OR REPLACE FUNCTION mandi.clear_cheque(
    p_voucher_id     uuid,
    p_bank_account_id uuid,
    p_clear_date     timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_voucher            mandi.vouchers%ROWTYPE;
    v_target_bank_id     uuid;
    v_final_contact_id   uuid;
    v_payment_voucher_id uuid;
    v_payment_voucher_no bigint;
    v_reference_no       text;

    -- Status calculation variables
    v_total_received    NUMERIC;  -- sales: total asset debits   (cash IN)
    v_total_paid_out    NUMERIC;  -- arrivals: total asset credits (cash OUT)
    v_party_net_balance NUMERIC;  -- arrivals: net balance still owed to party
    v_sale_total        NUMERIC;
    v_new_sale_status   TEXT;
    v_new_arr_status    TEXT;
BEGIN
    SELECT * INTO v_voucher FROM mandi.vouchers WHERE id = p_voucher_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Voucher not found');
    END IF;

    IF COALESCE(v_voucher.cheque_status, '') = 'Cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cancelled cheque cannot be cleared');
    END IF;

    IF COALESCE(v_voucher.is_cleared, false) = true THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cheque already cleared');
    END IF;

    v_final_contact_id := COALESCE(v_voucher.contact_id, v_voucher.party_id);
    v_target_bank_id   := COALESCE(p_bank_account_id, v_voucher.bank_account_id);

    IF v_target_bank_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bank account required to clear cheque');
    END IF;

    -- Mark original voucher as cleared
    UPDATE mandi.vouchers
    SET is_cleared      = true,
        cleared_at      = p_clear_date,
        cheque_status   = 'Cleared',
        bank_account_id = v_target_bank_id
    WHERE id = p_voucher_id;

    -- Build reference number
    v_reference_no := CASE
        WHEN v_voucher.invoice_id IS NOT NULL
            THEN (SELECT bill_no::text FROM mandi.sales WHERE id = v_voucher.invoice_id)
        WHEN v_voucher.arrival_id IS NOT NULL
            THEN (SELECT bill_no::text FROM mandi.arrivals WHERE id = v_voucher.arrival_id)
        ELSE v_voucher.voucher_no::text
    END;

    -- Create new payment voucher for the cleared amount
    SELECT COALESCE(MAX(voucher_no), 0) + 1 INTO v_payment_voucher_no
    FROM mandi.vouchers
    WHERE organization_id = v_voucher.organization_id AND type = 'payment';

    INSERT INTO mandi.vouchers (
        organization_id, date, type, voucher_no, narration, amount,
        cheque_no, cheque_status, is_cleared, cleared_at, bank_account_id,
        contact_id, party_id, invoice_id, arrival_id
    ) VALUES (
        v_voucher.organization_id, p_clear_date::date, 'payment', v_payment_voucher_no,
        'Cheque Cleared — ' || COALESCE(v_reference_no, v_voucher.voucher_no::text),
        v_voucher.amount,
        v_voucher.cheque_no, 'Cleared', true, p_clear_date, v_target_bank_id,
        v_voucher.contact_id, v_voucher.party_id, v_voucher.invoice_id, v_voucher.arrival_id
    ) RETURNING id INTO v_payment_voucher_id;

    -- ─── SALE CHEQUE: money flows IN from buyer ───────────────────────────────
    IF v_voucher.invoice_id IS NOT NULL THEN

        -- Dr Bank/Cash (asset INCREASES — money received)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, transaction_type, reference_id, reference_no
        ) VALUES (
            v_voucher.organization_id, v_payment_voucher_id, v_target_bank_id,
            v_voucher.amount, 0, p_clear_date::date,
            'Cheque Received & Cleared', 'receipt',
            v_voucher.invoice_id, v_reference_no
        );

        -- Cr Buyer (their receivable DECREASES — debt partially/fully paid)
        IF v_final_contact_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_id, reference_no
            ) VALUES (
                v_voucher.organization_id, v_payment_voucher_id, v_final_contact_id,
                0, v_voucher.amount, p_clear_date::date,
                'Cheque Received & Cleared', 'receipt',
                v_voucher.invoice_id, v_reference_no
            );
        END IF;

        -- Recalculate sale status: sum all asset-account DEBITS for this sale
        -- (Dr Bank entries = actual cash/bank received from buyer, including instant receipts)
        SELECT COALESCE(SUM(le.debit), 0) INTO v_total_received
        FROM mandi.ledger_entries le
        JOIN mandi.accounts a ON le.account_id = a.id
        WHERE le.reference_id = v_voucher.invoice_id
          AND a.type = 'asset'
          AND le.debit > 0;

        SELECT COALESCE(total_amount_inc_tax, 0) INTO v_sale_total
        FROM mandi.sales WHERE id = v_voucher.invoice_id;

        v_new_sale_status := CASE
            WHEN v_total_received >= v_sale_total THEN 'paid'
            WHEN v_total_received > 0             THEN 'partial'
            ELSE                                       'pending'
        END;

        UPDATE mandi.sales
        SET payment_status    = v_new_sale_status,
            is_cheque_cleared = true
        WHERE id = v_voucher.invoice_id;

    -- ─── PURCHASE / ARRIVAL CHEQUE: money flows OUT to supplier/farmer ────────
    ELSIF v_voucher.arrival_id IS NOT NULL THEN

        -- Dr Party (what we owe them DECREASES — payment made)
        IF v_final_contact_id IS NOT NULL THEN
            INSERT INTO mandi.ledger_entries (
                organization_id, voucher_id, contact_id, debit, credit,
                entry_date, description, transaction_type, reference_id, reference_no
            ) VALUES (
                v_voucher.organization_id, v_payment_voucher_id, v_final_contact_id,
                v_voucher.amount, 0, p_clear_date::date,
                'Cheque Paid & Cleared', 'purchase',
                v_voucher.arrival_id, v_reference_no
            );
        END IF;

        -- Cr Bank/Cash (asset DECREASES — money leaves for supplier)
        INSERT INTO mandi.ledger_entries (
            organization_id, voucher_id, account_id, debit, credit,
            entry_date, description, transaction_type, reference_id, reference_no
        ) VALUES (
            v_voucher.organization_id, v_payment_voucher_id, v_target_bank_id,
            0, v_voucher.amount, p_clear_date::date,
            'Cheque Paid & Cleared', 'purchase',
            v_voucher.arrival_id, v_reference_no
        );

        -- Recalculate arrival status:
        -- Net party balance = credits_to_party - debits_to_party
        -- (positive = still owe them, zero/negative = fully settled)
        SELECT COALESCE(SUM(credit - debit), 0) INTO v_party_net_balance
        FROM mandi.ledger_entries
        WHERE contact_id = v_final_contact_id
          AND reference_id = v_voucher.arrival_id;

        -- Total cash paid out = sum of all asset-account CREDITS for this arrival
        -- (captures both cash advances in purchase voucher + cleared cheque payments)
        SELECT COALESCE(SUM(le.credit), 0) INTO v_total_paid_out
        FROM mandi.ledger_entries le
        JOIN mandi.accounts a ON le.account_id = a.id
        WHERE le.reference_id = v_voucher.arrival_id
          AND a.type = 'asset'
          AND le.credit > 0;

        -- Determine status
        IF v_final_contact_id IS NULL THEN
            -- No party to track — treat as paid
            v_new_arr_status := 'paid';
        ELSE
            v_new_arr_status := CASE
                WHEN v_party_net_balance <= 0 THEN 'paid'     -- fully settled
                WHEN v_total_paid_out > 0     THEN 'partial'  -- some paid, balance remains
                ELSE                               'pending'  -- nothing paid yet
            END;
        END IF;

        UPDATE mandi.arrivals
        SET status = v_new_arr_status
        WHERE id = v_voucher.arrival_id;

        UPDATE mandi.purchase_bills
        SET payment_status = v_new_arr_status
        WHERE lot_id IN (SELECT id FROM mandi.lots WHERE arrival_id = v_voucher.arrival_id);

    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cheque cleared. Ledger and payment status updated.'
    );
END;
$function$;


-- ============================================================
-- PART 3: mandi.cancel_cheque
-- No changes needed for cancellation logic;
-- re-applying for completeness with no functional change.
-- ============================================================

-- (Optional re-apply to keep consistent — no changes)
-- mandi.cancel_cheque is unchanged from 20260406120000.


-- ============================================================
-- SUMMARY
-- ============================================================
/*
PAYMENT STATUS RULES NOW ENFORCED:

SALES (confirm_sale_transaction — unchanged from 20260421130000):
  cash/upi/bank + full amount   → paid    (receipt voucher = full amount)
  cash/upi/bank + partial amount → partial (receipt voucher = partial amount)
  credit / udhaar               → pending
  cheque uncleared              → pending  (no payment entry)
  cheque instantly cleared      → paid / partial (same as cash)

PURCHASES (post_arrival_ledger — NEW in this migration):
  cash advance >= gross bill    → paid
  cash advance < gross bill     → partial
  no advance                    → pending
  cheque advance uncleared      → pending  (+placeholder voucher, NO ledger entry)
  cheque advance instantly clrd → paid / partial (same as cash)

CHEQUE CLEARANCE (clear_cheque — FIXED in this migration):
  Sale cheque cleared:
    Dr Bank (money IN), Cr Buyer (debt down)
    Status = sum(asset debits for sale) vs total_amount_inc_tax → paid/partial/pending
  Purchase cheque cleared:
    Dr Party (owed amount down), Cr Bank (money OUT)
    Status = party net balance → paid / total_paid_out > 0 → partial / pending
*/
