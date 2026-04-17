-- ============================================================
-- FIX 1: Atomic Bill Number Sequencing
-- Migration: 20260412_atomic_bill_sequences.sql
--
-- PROBLEM: SELECT MAX(bill_no) + 1 is non-atomic. Concurrent
-- inserts can produce duplicate bill_no values.
--
-- SOLUTION: Use PostgreSQL SEQUENCES for atomic, collision-free
-- bill and voucher number generation.
-- ============================================================

-- 1. Create one sequence per organization is not how Postgres
--    sequences work (they're global). Instead we upgrade the
--    existing get_next_voucher_no to be truly atomic using
--    advisory locks AND ensure the voucher_sequences table
--    is used for ALL sequential numbering.

-- Ensure core.voucher_sequences exists with correct structure
CREATE TABLE IF NOT EXISTS core.voucher_sequences (
    organization_id UUID PRIMARY KEY REFERENCES core.organizations(id) ON DELETE CASCADE,
    sale_no         BIGINT DEFAULT 0,
    voucher_no      BIGINT DEFAULT 0,
    arrival_no      BIGINT DEFAULT 0
);

-- Seed from existing data (safe: ON CONFLICT DO NOTHING if row exists)
INSERT INTO core.voucher_sequences (organization_id, sale_no, voucher_no, arrival_no)
SELECT
    org.id,
    COALESCE((SELECT MAX(bill_no) FROM mandi.sales WHERE organization_id = org.id), 0),
    COALESCE((SELECT MAX(voucher_no) FROM mandi.vouchers WHERE organization_id = org.id), 0),
    COALESCE((SELECT MAX(bill_no) FROM mandi.arrivals WHERE organization_id = org.id), 0)
FROM core.organizations org
ON CONFLICT (organization_id) DO UPDATE SET
    sale_no    = GREATEST(EXCLUDED.sale_no,    core.voucher_sequences.sale_no),
    voucher_no = GREATEST(EXCLUDED.voucher_no, core.voucher_sequences.voucher_no),
    arrival_no = GREATEST(EXCLUDED.arrival_no, core.voucher_sequences.arrival_no);

-- 2. Atomic increment functions (pg advisory lock ensures no race)
CREATE OR REPLACE FUNCTION core.next_sale_no(p_org_id uuid)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next BIGINT;
BEGIN
    INSERT INTO core.voucher_sequences (organization_id, sale_no)
    VALUES (p_org_id, 1)
    ON CONFLICT (organization_id)
    DO UPDATE SET sale_no = core.voucher_sequences.sale_no + 1
    RETURNING sale_no INTO v_next;
    RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION core.next_voucher_no(p_org_id uuid)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next BIGINT;
BEGIN
    INSERT INTO core.voucher_sequences (organization_id, voucher_no)
    VALUES (p_org_id, 1)
    ON CONFLICT (organization_id)
    DO UPDATE SET voucher_no = core.voucher_sequences.voucher_no + 1
    RETURNING voucher_no INTO v_next;
    RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION core.next_arrival_no(p_org_id uuid)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next BIGINT;
BEGIN
    INSERT INTO core.voucher_sequences (organization_id, arrival_no)
    VALUES (p_org_id, 1)
    ON CONFLICT (organization_id)
    DO UPDATE SET arrival_no = core.voucher_sequences.arrival_no + 1
    RETURNING arrival_no INTO v_next;
    RETURN v_next;
END;
$$;

-- 3. Update the public shim (used by payroll and advance payment) to use core
CREATE OR REPLACE FUNCTION public.get_next_voucher_no(p_org_id uuid)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN core.next_voucher_no(p_org_id);
END;
$$;

-- 4. Grant access
GRANT EXECUTE ON FUNCTION core.next_sale_no(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION core.next_voucher_no(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION core.next_arrival_no(uuid) TO authenticated, service_role;
GRANT ALL ON core.voucher_sequences TO service_role, postgres;
