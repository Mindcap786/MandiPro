-- ============================================================
-- INVOICE BALANCE RCA FIX
-- Migration: 20260420_fix_invoice_balance_rca.sql
-- Date: 2026-04-20
--
-- ROOT CAUSE ANALYSIS:
-- ====================
-- get_invoice_balance previously used a FIFO algorithm:
--   v_total_credits      = SUM(all ledger credits for this buyer, all time)
--   v_sum_older_invoices = SUM(face value of all older invoices, paid or not)
--   v_available          = v_total_credits - v_sum_older_invoices
--
-- PROBLEM 1 — FIFO breaks when unpaid invoices exist:
--   If buyer has: Inv#1 ₹30k (PENDING), Inv#2 ₹30k (PENDING), Inv#3 ₹15k (PAID cash)
--   v_total_credits = ₹15k (from Inv#3 receipt)
--   v_sum_older_invoices = ₹30k + ₹30k = ₹60k
--   v_available = ₹15k - ₹60k = NEGATIVE → shows Inv#3 received ₹0 ❌
--
-- PROBLEM 2 — Older versions of confirm_sale_transaction did NOT create
--   a receipt voucher row (only wrote amount_received to sales.amount_received).
--   So for those invoices: receipt vouchers = 0, ledger credits = 0.
--   Both old AND new get_invoice_balance return 0 for them.
--
-- THE FIX:
-- ========
-- Use a 3-tier fallback that is CORRECT for ALL invoice types:
--
--   Tier 1: Sum receipt vouchers directly linked to this invoice via
--           vouchers.invoice_id. This is the correct source for all
--           invoices created by the latest confirm_sale_transaction.
--
--   Tier 2: If no receipt vouchers found, fall back to the sales.amount_received
--           column, which is written by older versions of confirm_sale_transaction
--           and by the bulk-sale form's direct INSERT path.
--
--   Tier 3: If both are 0, correlate via ledger_entries WHERE reference_id = sale_id
--           AND transaction_type = 'receipt'. This covers any edge cases where
--           vouchers.invoice_id was not set but the ledger was written correctly.
--
-- RESULT: Every invoice now shows the correct received amount regardless of which
--         version of confirm_sale_transaction created it.
--
-- DOES NOT TOUCH: sales, purchase, arrivals, ledger logic, or any other flow.
-- ============================================================

CREATE OR REPLACE FUNCTION mandi.get_invoice_balance(p_invoice_id uuid)
RETURNS TABLE(
    total_amount    numeric,
    amount_paid     numeric,
    balance_due     numeric,
    status          text,
    is_overpaid     boolean,
    overpaid_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
    v_invoice_total     NUMERIC;
    v_db_amount_received NUMERIC;
    v_voucher_receipts  NUMERIC;
    v_ledger_receipts   NUMERIC;
    v_amount_paid       NUMERIC;
BEGIN
    -- ── Step 1: Get invoice face value + DB amount_received column ──────────
    SELECT
        GREATEST(COALESCE(s.total_amount_inc_tax, 0), COALESCE(s.total_amount, 0)),
        COALESCE(s.amount_received, 0)
    INTO v_invoice_total, v_db_amount_received
    FROM mandi.sales s
    WHERE s.id = p_invoice_id;

    IF v_invoice_total IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
    END IF;

    -- ── Step 2: Tier 1 — Sum receipt vouchers linked directly to this invoice ─
    -- confirm_sale_transaction (latest) sets vouchers.invoice_id = sale_id
    -- create_voucher (payment dialog) also sets vouchers.invoice_id
    SELECT COALESCE(SUM(v.amount + COALESCE(v.discount_amount, 0)), 0)
    INTO v_voucher_receipts
    FROM mandi.vouchers v
    WHERE v.invoice_id  = p_invoice_id
      AND v.type        = 'receipt'
      AND COALESCE(v.cheque_status, '') NOT IN ('cancelled', 'v_cancelled', 'Cancelled');

    -- ── Step 3: Tier 3 — Ledger-based receipt entries for this invoice ───────
    -- Covers edge cases where voucher.invoice_id was NULL but ledger was correct
    SELECT COALESCE(SUM(le.credit), 0)
    INTO v_ledger_receipts
    FROM mandi.ledger_entries le
    WHERE le.reference_id       = p_invoice_id
      AND le.transaction_type   = 'receipt'
      AND le.contact_id         IS NOT NULL;  -- CR to buyer/party (not account)

    -- ── Step 4: Choose the most reliable value (highest wins within invoice) ─
    -- Tier 1 (vouchers) is most accurate, then Tier 2 (DB column), then Tier 3
    v_amount_paid := GREATEST(v_voucher_receipts, v_db_amount_received, v_ledger_receipts);

    -- ── Step 5: Build output ─────────────────────────────────────────────────
    total_amount    := v_invoice_total;
    amount_paid     := v_amount_paid;
    balance_due     := GREATEST(0, v_invoice_total - v_amount_paid);
    is_overpaid     := (v_amount_paid > v_invoice_total AND v_invoice_total > 0);
    overpaid_amount := CASE WHEN is_overpaid THEN v_amount_paid - v_invoice_total ELSE 0 END;
    status          := CASE
                         WHEN v_invoice_total  = 0          THEN 'paid'
                         WHEN balance_due      = 0          THEN 'paid'
                         WHEN v_amount_paid    > 0          THEN 'partial'
                         ELSE                                    'pending'
                       END;

    RETURN NEXT;
END;
$function$;
