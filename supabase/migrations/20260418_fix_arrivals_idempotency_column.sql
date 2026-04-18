-- ============================================================================
-- MIGRATION: 20260418_fix_arrivals_idempotency_column.sql
-- PURPOSE: Add missing idempotency_key column to mandi.arrivals table.
--
-- ROOT CAUSE:
--   The create_mixed_arrival RPC (in 20260418_cheque_and_arrival_hardening.sql)
--   was updated to INSERT idempotency_key into mandi.arrivals, but the column
--   was NEVER added to the table via ALTER TABLE.
--   This causes: ERROR: column "idempotency_key" does not exist
--
-- IMPACT: This fix ONLY adds a column. It does NOT modify any RPC, trigger,
--   or existing data. Zero risk to Sales, Purchase, or Ledger flows.
--
-- SAFE TO RE-RUN: Yes (IF NOT EXISTS).
-- ============================================================================

-- 1. Add the missing column
ALTER TABLE mandi.arrivals
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

-- 2. Add a unique constraint for idempotency protection
-- (ON CONFLICT requires a unique index)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'mandi' 
      AND tablename = 'arrivals' 
      AND indexname = 'idx_arrivals_idempotency_key'
  ) THEN
    CREATE UNIQUE INDEX idx_arrivals_idempotency_key 
    ON mandi.arrivals (idempotency_key) 
    WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN mandi.arrivals.idempotency_key IS 'UUID to prevent duplicate arrival creation from double-clicks or network retries';

NOTIFY pgrst, 'reload schema';
