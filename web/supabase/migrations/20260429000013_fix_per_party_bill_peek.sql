-- Migration: 20260429000013_fix_per_party_bill_peek.sql
--
-- ROOT CAUSE: get_next_contact_bill_no was reading from id_sequences (global counter)
-- instead of the actual arrivals table. Result: every party showed the global bill number.
--
-- FIX: Replace with a pure STABLE function that reads MAX(contact_bill_no) from the
-- actual arrivals/sales rows for that specific party. Zero state, zero side-effects.
-- No sequence tables involved in the peek — only in the consume (save time).

BEGIN;

-- Drop all previous versions cleanly
DROP FUNCTION IF EXISTS mandi.get_next_contact_bill_no(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS mandi.get_next_bill_no(uuid) CASCADE;

-- ===========================================================
-- THE ONLY FUNCTION THE FORM CALLS FOR BILL NUMBER PREVIEW
-- ===========================================================
-- Rules:
--   Party with 0 arrivals    → returns 1
--   Party with arrivals      → returns MAX(contact_bill_no) + 1
--   Called 100 times in a row → always returns the same number (STABLE)
--   No writes, no counters, no state mutation
-- ===========================================================
CREATE OR REPLACE FUNCTION mandi.get_next_contact_bill_no(
    p_organization_id uuid,
    p_contact_id      uuid,
    p_type            text     -- 'arrival' | 'sale' | anything
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT CASE p_type
        WHEN 'sale' THEN
            COALESCE(
                (SELECT MAX(contact_bill_no)
                 FROM mandi.sales
                 WHERE organization_id = p_organization_id
                   AND buyer_id        = p_contact_id),
                0
            ) + 1
        ELSE
            -- 'arrival', 'purchase', anything else → purchase sequence
            COALESCE(
                (SELECT MAX(contact_bill_no)
                 FROM mandi.arrivals
                 WHERE organization_id = p_organization_id
                   AND party_id        = p_contact_id),
                0
            ) + 1
    END;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_next_contact_bill_no(uuid, uuid, text)
    TO anon, authenticated, service_role;

-- Keep get_next_bill_no as a safe global peek (never destructive)
-- Only used for the global audit counter, NOT shown in the UI
CREATE OR REPLACE FUNCTION mandi.get_next_bill_no(p_organization_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (SELECT last_number FROM mandi.id_sequences
         WHERE organization_id = p_organization_id AND entity_type = 'bill_no'),
        0
    ) + 1;
$$;

GRANT EXECUTE ON FUNCTION mandi.get_next_bill_no(uuid)
    TO anon, authenticated, service_role;

COMMIT;
