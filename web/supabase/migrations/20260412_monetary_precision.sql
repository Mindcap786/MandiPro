-- ============================================================
-- FIX 3: Monetary Precision Constraint
-- Migration: 20260412_monetary_precision.sql
--
-- PROBLEM: Core financial columns use NUMERIC (arbitrary precision)
-- instead of NUMERIC(15,2). This allows decimal drift like
-- ₹15000.00000001 in calculations.
--
-- SOLUTION: Cast all monetary columns to NUMERIC(15,2).
-- The USING clause safely rounds existing data to 2 decimal places.
-- ============================================================

-- mandi.ledger_entries — the central ledger
ALTER TABLE mandi.ledger_entries
    ALTER COLUMN debit  TYPE NUMERIC(15,2) USING ROUND(COALESCE(debit,  0)::NUMERIC, 2),
    ALTER COLUMN credit TYPE NUMERIC(15,2) USING ROUND(COALESCE(credit, 0)::NUMERIC, 2);

-- mandi.sales — invoice totals and charges
ALTER TABLE mandi.sales
    ALTER COLUMN total_amount       TYPE NUMERIC(15,2) USING ROUND(COALESCE(total_amount,       0)::NUMERIC, 2),
    ALTER COLUMN market_fee         TYPE NUMERIC(15,2) USING ROUND(COALESCE(market_fee,         0)::NUMERIC, 2),
    ALTER COLUMN nirashrit          TYPE NUMERIC(15,2) USING ROUND(COALESCE(nirashrit,          0)::NUMERIC, 2),
    ALTER COLUMN misc_fee           TYPE NUMERIC(15,2) USING ROUND(COALESCE(misc_fee,           0)::NUMERIC, 2),
    ALTER COLUMN loading_charges    TYPE NUMERIC(15,2) USING ROUND(COALESCE(loading_charges,    0)::NUMERIC, 2),
    ALTER COLUMN unloading_charges  TYPE NUMERIC(15,2) USING ROUND(COALESCE(unloading_charges,  0)::NUMERIC, 2),
    ALTER COLUMN other_expenses     TYPE NUMERIC(15,2) USING ROUND(COALESCE(other_expenses,     0)::NUMERIC, 2);

-- mandi.sale_items — line item amounts
ALTER TABLE mandi.sale_items
    ALTER COLUMN quantity    TYPE NUMERIC(15,3) USING ROUND(COALESCE(quantity,    0)::NUMERIC, 3),
    ALTER COLUMN rate        TYPE NUMERIC(15,2) USING ROUND(COALESCE(rate,        0)::NUMERIC, 2),
    ALTER COLUMN total_price TYPE NUMERIC(15,2) USING ROUND(COALESCE(total_price, 0)::NUMERIC, 2);

-- mandi.lots — supplier rate and cost fields
ALTER TABLE mandi.lots
    ALTER COLUMN supplier_rate     TYPE NUMERIC(15,2) USING ROUND(COALESCE(supplier_rate,     0)::NUMERIC, 2),
    ALTER COLUMN commission_percent TYPE NUMERIC(5,2)  USING ROUND(COALESCE(commission_percent, 0)::NUMERIC, 2);

-- mandi.vouchers — voucher amounts
ALTER TABLE mandi.vouchers
    ALTER COLUMN amount          TYPE NUMERIC(15,2) USING ROUND(COALESCE(amount,          0)::NUMERIC, 2),
    ALTER COLUMN discount_amount TYPE NUMERIC(15,2) USING ROUND(COALESCE(discount_amount, 0)::NUMERIC, 2);

-- mandi.advance_payments
ALTER TABLE mandi.advance_payments
    ALTER COLUMN amount TYPE NUMERIC(15,2) USING ROUND(COALESCE(amount, 0)::NUMERIC, 2);
