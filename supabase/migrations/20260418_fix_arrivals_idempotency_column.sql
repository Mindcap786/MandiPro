-- ============================================================================
-- MIGRATION: 20260418_fix_arrivals_idempotency_column.sql (v3 — FINAL)
--
-- ROOT CAUSE OF REPEATED FAILURE:
--   PostgreSQL ON CONFLICT requires a REAL unique constraint, NOT a partial
--   unique index (one with a WHERE clause). Previous fixes created partial
--   indexes which PostgreSQL silently ignores for ON CONFLICT resolution.
--
-- THIS FIX:
--   1. Drops broken partial indexes from v1/v2
--   2. Adds missing columns (IF NOT EXISTS — safe to re-run)
--   3. Creates a REAL UNIQUE constraint on payments.idempotency_key
--   4. Zero changes to any RPC, trigger, or business logic
-- ============================================================================

-- 1. Drop broken partial indexes from previous attempts
DROP INDEX IF EXISTS mandi.idx_payments_idempotency_key_unique;
DROP INDEX IF EXISTS mandi.idx_arrivals_idempotency_key;

-- 2. Ensure ALL columns exist that create_mixed_arrival needs
ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE mandi.payments ADD COLUMN IF NOT EXISTS arrival_id UUID;
ALTER TABLE mandi.payments ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- 3. Clean duplicates before adding constraint
UPDATE mandi.payments SET idempotency_key = NULL WHERE idempotency_key IN (
  SELECT idempotency_key FROM mandi.payments
  WHERE idempotency_key IS NOT NULL
  GROUP BY idempotency_key HAVING COUNT(*) > 1
);

-- 4. Add REAL unique constraint (required for ON CONFLICT)
DO $$ BEGIN
  ALTER TABLE mandi.payments ADD CONSTRAINT uq_payments_idempotency_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
