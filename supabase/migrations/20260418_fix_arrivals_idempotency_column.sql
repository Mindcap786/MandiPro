-- ============================================================================
-- MIGRATION: 20260418_fix_arrivals_idempotency_column.sql  (v2 — COMPLETE)
-- PURPOSE: Fix ALL missing columns and constraints that create_mixed_arrival needs.
--
-- ROOT CAUSE ANALYSIS:
--   The create_mixed_arrival RPC (20260418_cheque_and_arrival_hardening.sql)
--   references columns and constraints that were never created:
--     1. mandi.arrivals.idempotency_key (column missing)
--     2. mandi.payments.arrival_id (column may be missing)
--     3. mandi.payments.reference_number (column may be missing)
--     4. UNIQUE constraint on mandi.payments(idempotency_key) (needed for ON CONFLICT)
--
-- THIS FIX DOES:
--   • Adds missing columns with IF NOT EXISTS (safe to re-run)
--   • Creates the UNIQUE constraint payments needs for ON CONFLICT
--   • Does NOT modify any RPC, trigger, or existing data
--   • Zero risk to Sales, Purchase, or Ledger flows
--
-- SAFE TO RE-RUN: Yes.
-- ============================================================================

-- 1. mandi.arrivals: Add idempotency_key column
ALTER TABLE mandi.arrivals
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- 2. mandi.arrivals: Add unique index for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'mandi' AND tablename = 'arrivals'
      AND indexname = 'idx_arrivals_idempotency_key'
  ) THEN
    CREATE UNIQUE INDEX idx_arrivals_idempotency_key
    ON mandi.arrivals (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- 3. mandi.payments: Add arrival_id column (referenced in create_mixed_arrival line 140)
ALTER TABLE mandi.payments
  ADD COLUMN IF NOT EXISTS arrival_id UUID;

-- 4. mandi.payments: Add reference_number column (referenced in create_mixed_arrival line 142)
ALTER TABLE mandi.payments
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- 5. mandi.payments: Add UNIQUE constraint on idempotency_key
--    (required for the ON CONFLICT (idempotency_key) DO NOTHING clause)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'mandi' AND tablename = 'payments'
      AND indexname = 'idx_payments_idempotency_key_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_payments_idempotency_key_unique
    ON mandi.payments (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
