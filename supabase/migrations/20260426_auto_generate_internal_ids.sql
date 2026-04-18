-- ============================================================================
-- Auto-generate internal_id for commodities (Pattern A: industry-standard)
-- Fixes: duplicate key violation "idx_unique_item_internal_id" when users
-- leave Internal ID blank. Root cause: empty strings collided in a rogue
-- unique index that lacked a partial filter.
--
-- Strategy:
--   1. Drop the rogue index (schema drift — not in any migration file).
--   2. Introduce a per-tenant, per-entity sequence table.
--   3. Install a BEFORE INSERT trigger that auto-fills blank internal_id
--      from the sequence, atomically. Covers every insert path (web, RPC,
--      future API, CSV import).
--   4. Backfill existing NULL/blank rows so the uniqueness guarantee holds
--      cleanly going forward.
-- ============================================================================

-- 1. Remove the drift index. The correctly-scoped partial index
--    idx_unique_commodity_internal_id remains (created in 20260418).
DROP INDEX IF EXISTS mandi.idx_unique_item_internal_id;

-- 2. Per-tenant sequence store. One row per (org, entity). Atomic counter.
CREATE TABLE IF NOT EXISTS mandi.id_sequences (
    organization_id UUID    NOT NULL,
    entity_type     TEXT    NOT NULL,
    prefix          TEXT    NOT NULL DEFAULT 'ITM-',
    padding         INT     NOT NULL DEFAULT 5,
    last_number     BIGINT  NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, entity_type)
);

-- 3. Atomic "give me the next code" function. UPDATE ... RETURNING is
--    race-safe — multiple concurrent inserts each receive a distinct number.
CREATE OR REPLACE FUNCTION mandi.next_internal_id(
    p_organization_id UUID,
    p_entity_type     TEXT,
    p_default_prefix  TEXT DEFAULT 'ITM-',
    p_default_padding INT  DEFAULT 5
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix   TEXT;
    v_padding  INT;
    v_next_num BIGINT;
BEGIN
    -- Ensure a row exists for this (org, entity) pair.
    INSERT INTO mandi.id_sequences (organization_id, entity_type, prefix, padding, last_number)
    VALUES (p_organization_id, p_entity_type, p_default_prefix, p_default_padding, 0)
    ON CONFLICT (organization_id, entity_type) DO NOTHING;

    -- Atomically bump and fetch.
    UPDATE mandi.id_sequences
       SET last_number = last_number + 1,
           updated_at  = NOW()
     WHERE organization_id = p_organization_id
       AND entity_type     = p_entity_type
    RETURNING prefix, padding, last_number
        INTO v_prefix, v_padding, v_next_num;

    RETURN v_prefix || LPAD(v_next_num::TEXT, v_padding, '0');
END;
$$;

-- 4. Trigger function — fill blank/null internal_id on insert.
CREATE OR REPLACE FUNCTION mandi.commodities_fill_internal_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.internal_id IS NULL OR TRIM(NEW.internal_id) = '' THEN
        NEW.internal_id := mandi.next_internal_id(NEW.organization_id, 'commodity');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commodities_fill_internal_id ON mandi.commodities;
CREATE TRIGGER trg_commodities_fill_internal_id
    BEFORE INSERT ON mandi.commodities
    FOR EACH ROW
    EXECUTE FUNCTION mandi.commodities_fill_internal_id();

-- 5. Backfill existing rows with empty/null internal_id. Run per-tenant so
--    each organization's sequence stays self-contained.
DO $$
DECLARE
    v_row       RECORD;
    v_new_code  TEXT;
BEGIN
    -- mandi.commodities has no created_at column (only created_by).
    -- Ordering by (organization_id, id) is stable and sufficient for backfill.
    FOR v_row IN
        SELECT id, organization_id
          FROM mandi.commodities
         WHERE internal_id IS NULL OR TRIM(internal_id) = ''
         ORDER BY organization_id, id
    LOOP
        v_new_code := mandi.next_internal_id(v_row.organization_id, 'commodity');
        UPDATE mandi.commodities
           SET internal_id = v_new_code
         WHERE id = v_row.id;
    END LOOP;
END $$;

-- Grants — same pattern as other mandi RPCs in this project.
GRANT EXECUTE ON FUNCTION mandi.next_internal_id(UUID, TEXT, TEXT, INT) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON mandi.id_sequences TO authenticated, service_role;
