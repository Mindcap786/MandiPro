-- ==========================================================================
-- CLEANUP: Duplicate / Orphan Purchase Vouchers
-- ==========================================================================
-- ⚠️  DESTRUCTIVE — reads and deletes rows.
-- ⚠️  ALWAYS run inside a transaction and ALWAYS take a backup first.
-- ⚠️  Run diagnose-duplicate-purchase-vouchers.sql FIRST and confirm what
--    you are about to delete.
--
-- What this script does:
--   A. For every arrival that has >1 purchase voucher, keep the OLDEST and
--      delete the later ones (and their ledger entries).
--   B. Delete purchase ledger entries that have NULL reference_id — these
--      are orphans left over from a pre-patch run of post_arrival_ledger.
--   C. Delete purchase vouchers that have arrival_id = NULL — orphans.
--   D. After cleanup, call post_arrival_ledger for every surviving arrival
--      so the canonical ledger entries are regenerated cleanly.
-- ==========================================================================

BEGIN;

-- ----------------------------------------------------------------------
-- A. Deduplicate purchase vouchers per arrival
-- ----------------------------------------------------------------------
WITH ranked AS (
    SELECT
        id,
        arrival_id,
        ROW_NUMBER() OVER (
            PARTITION BY arrival_id
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM mandi.vouchers
    WHERE arrival_id IS NOT NULL
      AND type = 'purchase'
),
to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM mandi.ledger_entries
WHERE voucher_id IN (SELECT id FROM to_delete);

WITH ranked AS (
    SELECT
        id,
        arrival_id,
        ROW_NUMBER() OVER (
            PARTITION BY arrival_id
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM mandi.vouchers
    WHERE arrival_id IS NOT NULL
      AND type = 'purchase'
)
DELETE FROM mandi.vouchers
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ----------------------------------------------------------------------
-- B. Orphan purchase ledger entries with NULL reference_id
--    (these exist outside the normal group-key scheme and cause the
--     "Unknown · Fruit Value" phantom rows in the Day Book)
-- ----------------------------------------------------------------------
DELETE FROM mandi.ledger_entries le
USING mandi.vouchers v
WHERE le.voucher_id = v.id
  AND le.transaction_type = 'purchase'
  AND le.reference_id IS NULL
  AND v.arrival_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- C. Purchase vouchers with NULL arrival_id (pure orphans, no parent)
-- ----------------------------------------------------------------------
DELETE FROM mandi.ledger_entries
WHERE voucher_id IN (
    SELECT id FROM mandi.vouchers
    WHERE type = 'purchase' AND arrival_id IS NULL
);

DELETE FROM mandi.vouchers
WHERE type = 'purchase' AND arrival_id IS NULL;

-- ----------------------------------------------------------------------
-- D. Regenerate canonical ledger entries for every surviving arrival
--    (idempotent — post_arrival_ledger deletes and re-inserts its own
--     entries via `WHERE reference_id = p_arrival_id`)
-- ----------------------------------------------------------------------
DO $$
DECLARE
    v_arrival_id UUID;
BEGIN
    FOR v_arrival_id IN
        SELECT DISTINCT a.id
        FROM mandi.arrivals a
        WHERE EXISTS (
            SELECT 1 FROM mandi.lots l WHERE l.arrival_id = a.id
        )
    LOOP
        PERFORM mandi.post_arrival_ledger(v_arrival_id);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------
-- Verification — should return ZERO rows if cleanup succeeded
-- ----------------------------------------------------------------------
SELECT
    a.id AS arrival_id,
    COUNT(DISTINCT v.id) AS voucher_count
FROM mandi.arrivals a
LEFT JOIN mandi.vouchers v
       ON v.arrival_id = a.id
      AND v.type = 'purchase'
GROUP BY a.id
HAVING COUNT(DISTINCT v.id) > 1;

-- If the verification above returns rows, ROLLBACK and investigate.
-- If it returns no rows, COMMIT.
--
-- COMMIT;
-- ROLLBACK;
