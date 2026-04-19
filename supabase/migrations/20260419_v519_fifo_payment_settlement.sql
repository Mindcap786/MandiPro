-- ============================================================
-- v5.19: FIFO Supplier Bill Settlement
--
-- FEATURE: When a mandi records a payment to a supplier/farmer,
-- automatically clear oldest bills first (FIFO), updating each
-- lot's payment_status to: 'pending' | 'partial' | 'paid'
--
-- SCHEMA CHANGES:
-- 1. mandi.lots: Add paid_amount, payment_status, net_payable
-- 2. New RPC: mandi.settle_supplier_payment (FIFO engine)
-- 3. New RPC: mandi.set_lot_payment_status (status helper)
-- 4. Backfill existing lots from advance vs gross value
-- ============================================================

-- ── 1. Schema: Add tracking columns to mandi.lots ───────────

ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status TEXT    DEFAULT 'pending';

-- net_payable snapshot: stored at lot creation/rate-set time
-- Avoids recomputing complex JS formula in SQL; writable by create_mixed_arrival
ALTER TABLE mandi.lots
    ADD COLUMN IF NOT EXISTS net_payable NUMERIC DEFAULT 0;

-- Index for fast FIFO queries (contact × created_at)
CREATE INDEX IF NOT EXISTS idx_lots_contact_created 
    ON mandi.lots (organization_id, contact_id, created_at ASC)
    WHERE status != 'void';

-- ── 2. Helper: mandi.compute_lot_net_payable ─────────────────
-- Computes a lot's net payable purely from stored columns.
-- Mirrors the JS calculateLotGrossValue — does NOT deduct advance
-- (advance is tracked separately so FIFO can work correctly)

CREATE OR REPLACE FUNCTION mandi.compute_lot_net_payable(p_lot_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot          RECORD;
    v_adjusted_qty NUMERIC;
    v_base_value   NUMERIC;
    v_commission   NUMERIC;
    v_expenses     NUMERIC;
    v_sales_sum    NUMERIC;
    v_goods_value  NUMERIC;
BEGIN
    SELECT
        l.initial_qty,
        l.supplier_rate,
        l.less_percent,
        l.less_units,
        l.farmer_charges,
        l.packing_cost,
        l.loading_cost,
        l.commission_percent,
        l.expense_paid_by_mandi,
        COALESCE(l.arrival_type, arr.arrival_type, 'direct') AS arrival_type,
        COALESCE(
            (SELECT SUM(si.amount) FROM mandi.sale_items si WHERE si.lot_id = l.id),
            0
        ) AS sales_sum
    INTO v_lot
    FROM mandi.lots l
    LEFT JOIN mandi.arrivals arr ON arr.id = l.arrival_id
    WHERE l.id = p_lot_id;

    IF NOT FOUND THEN RETURN 0; END IF;

    -- Adjusted quantity (less by weight/percent)
    v_adjusted_qty := COALESCE(v_lot.initial_qty, 0)
                    - COALESCE(v_lot.less_units, 0)
                    - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
    
    v_base_value  := v_adjusted_qty * COALESCE(v_lot.supplier_rate, 0);
    v_expenses    := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);

    -- Direct purchase: simple formula
    IF v_lot.arrival_type = 'direct' THEN
        RETURN GREATEST(0, v_base_value - COALESCE(v_lot.farmer_charges, 0));
    END IF;

    -- Commission purchase: use actual sales if available
    v_sales_sum    := COALESCE(v_lot.sales_sum, 0);
    v_goods_value  := CASE WHEN v_sales_sum > 0 THEN v_sales_sum ELSE v_base_value END;
    v_commission   := v_goods_value * COALESCE(v_lot.commission_percent, 0) / 100.0;

    RETURN GREATEST(0,
        v_goods_value
        - v_commission
        - COALESCE(v_lot.farmer_charges, 0)
        - v_expenses
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.compute_lot_net_payable TO authenticated;

-- ── 3. Helper: mandi.refresh_lot_payment_status ──────────────
-- Recomputes and persists a single lot's payment_status.
-- Called after any payment change.

CREATE OR REPLACE FUNCTION mandi.refresh_lot_payment_status(p_lot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_lot        RECORD;
    v_net        NUMERIC;
    v_total_paid NUMERIC;
    v_new_status TEXT;
    v_epsilon    CONSTANT NUMERIC := 0.01;
BEGIN
    SELECT paid_amount, advance, advance_payment_mode, advance_cheque_status, net_payable
    INTO v_lot
    FROM mandi.lots
    WHERE id = p_lot_id;

    IF NOT FOUND THEN RETURN; END IF;

    -- Recompute net_payable if not yet stored
    v_net := CASE 
        WHEN COALESCE(v_lot.net_payable, 0) > v_epsilon 
        THEN v_lot.net_payable
        ELSE mandi.compute_lot_net_payable(p_lot_id)
    END;

    -- Count advance as paid only if cleared (not pending cheque)
    v_total_paid := COALESCE(v_lot.paid_amount, 0) + CASE
        WHEN COALESCE(v_lot.advance_payment_mode, 'cash') IN ('cash', 'bank', 'upi')
          OR v_lot.advance_cheque_status = TRUE
        THEN COALESCE(v_lot.advance, 0)
        ELSE 0
    END;

    -- Status determination
    v_new_status := CASE
        WHEN v_net <= v_epsilon                       THEN 'pending'  -- no gross value yet (rate not set)
        WHEN ABS(v_net - v_total_paid) < v_epsilon   THEN 'paid'
        WHEN v_total_paid > v_epsilon                THEN 'partial'
        ELSE                                               'pending'
    END;

    UPDATE mandi.lots
    SET payment_status = v_new_status,
        net_payable    = v_net,
        updated_at     = NOW()
    WHERE id = p_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.refresh_lot_payment_status TO authenticated;

-- ── 4. CORE: mandi.settle_supplier_payment (FIFO Engine) ─────
-- Called immediately after a payment voucher is created.
-- Allocates payment FIFO across oldest unpaid/partial lots.
--
-- p_payment_id: the voucher/payment UUID (to prevent double-apply)
-- Returns: JSONB summary of bills cleared

CREATE TABLE IF NOT EXISTS mandi.payment_allocations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL,
    payment_id       UUID NOT NULL,   -- links to mandi.vouchers.id
    lot_id           UUID NOT NULL,
    allocated_amount NUMERIC NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (payment_id, lot_id)
);

ALTER TABLE mandi.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_payment_allocations" ON mandi.payment_allocations;
CREATE POLICY "rls_payment_allocations" ON mandi.payment_allocations
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM core.profiles
            WHERE id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION mandi.settle_supplier_payment(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_payment_amount  NUMERIC,
    p_payment_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
DECLARE
    v_remaining     NUMERIC := p_payment_amount;
    v_lot           RECORD;
    v_outstanding   NUMERIC;
    v_allocate      NUMERIC;
    v_bills_paid    INT := 0;
    v_bills_partial INT := 0;
    v_bills_cleared JSONB := '[]'::JSONB;
    v_epsilon       CONSTANT NUMERIC := 0.01;
BEGIN
    -- Guard: idempotency — don't double-apply same payment
    IF p_payment_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM mandi.payment_allocations
            WHERE payment_id = p_payment_id
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'message', 'Payment already allocated'
            );
        END IF;
    END IF;

    IF v_remaining <= v_epsilon THEN
        RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'zero_amount');
    END IF;

    -- FIFO: process lots oldest-first for this supplier
    FOR v_lot IN
        SELECT
            l.id,
            l.lot_code,
            COALESCE(l.paid_amount, 0) AS paid_amount,
            COALESCE(l.advance, 0) AS advance,
            COALESCE(l.advance_payment_mode, 'cash') AS advance_payment_mode,
            COALESCE(l.advance_cheque_status, FALSE) AS advance_cheque_status,
            COALESCE(
                NULLIF(l.net_payable, 0),
                mandi.compute_lot_net_payable(l.id)
            ) AS net_payable,
            l.payment_status
        FROM mandi.lots l
        WHERE l.organization_id = p_organization_id
          AND l.contact_id      = p_contact_id
          AND l.status         != 'void'
          AND COALESCE(l.payment_status, 'pending') IN ('pending', 'partial')
        ORDER BY l.created_at ASC
    LOOP
        EXIT WHEN v_remaining <= v_epsilon;

        -- Effective advance (only if cleared payment mode)
        DECLARE
            v_cleared_advance NUMERIC := CASE
                WHEN v_lot.advance_payment_mode IN ('cash', 'bank', 'upi')
                  OR v_lot.advance_cheque_status = TRUE
                THEN v_lot.advance
                ELSE 0
            END;
        BEGIN
            -- Outstanding = net_payable - what's already paid (advance + previous allocations)
            v_outstanding := GREATEST(0,
                v_lot.net_payable - v_lot.paid_amount - v_cleared_advance
            );

            CONTINUE WHEN v_outstanding <= v_epsilon;  -- already covered

            -- Allocate
            v_allocate := LEAST(v_remaining, v_outstanding);

            -- Update lot
            UPDATE mandi.lots
            SET paid_amount    = COALESCE(paid_amount, 0) + v_allocate,
                payment_status = CASE
                    WHEN ABS((COALESCE(paid_amount, 0) + v_allocate + v_cleared_advance) - net_payable) < v_epsilon
                    THEN 'paid'
                    WHEN (COALESCE(paid_amount, 0) + v_allocate) > v_epsilon
                    THEN 'partial'
                    ELSE 'pending'
                END,
                net_payable    = v_lot.net_payable,
                updated_at     = NOW()
            WHERE id = v_lot.id;

            -- Record allocation (idempotency log)
            IF p_payment_id IS NOT NULL THEN
                INSERT INTO mandi.payment_allocations
                    (organization_id, payment_id, lot_id, allocated_amount)
                VALUES
                    (p_organization_id, p_payment_id, v_lot.id, v_allocate)
                ON CONFLICT (payment_id, lot_id) DO NOTHING;
            END IF;

            -- Tracking
            IF ABS(v_outstanding - v_allocate) < v_epsilon THEN
                v_bills_paid := v_bills_paid + 1;
            ELSE
                v_bills_partial := v_bills_partial + 1;
            END IF;

            v_bills_cleared := v_bills_cleared || jsonb_build_object(
                'lot_id',   v_lot.id,
                'lot_code', v_lot.lot_code,
                'allocated', v_allocate,
                'outstanding_was', v_outstanding,
                'status', CASE
                    WHEN ABS(v_outstanding - v_allocate) < v_epsilon THEN 'paid'
                    ELSE 'partial'
                END
            );

            v_remaining := v_remaining - v_allocate;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success',        true,
        'allocated',      p_payment_amount - v_remaining,
        'unallocated',    v_remaining,
        'bills_paid',     v_bills_paid,
        'bills_partial',  v_bills_partial,
        'details',        v_bills_cleared
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mandi.settle_supplier_payment TO authenticated;

-- Public proxy
DROP FUNCTION IF EXISTS public.settle_supplier_payment CASCADE;
CREATE OR REPLACE FUNCTION public.settle_supplier_payment(
    p_organization_id UUID,
    p_contact_id      UUID,
    p_payment_amount  NUMERIC,
    p_payment_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $$
    SELECT mandi.settle_supplier_payment(
        p_organization_id, p_contact_id, p_payment_amount, p_payment_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.settle_supplier_payment TO authenticated;

-- ── 5. Backfill: Set initial payment_status from advance ──────
-- For existing lots: net_payable = computed value, status from advance

DO $$
DECLARE
    v_lot RECORD;
    v_net NUMERIC;
    v_cleared_advance NUMERIC;
    v_status TEXT;
    v_epsilon CONSTANT NUMERIC := 0.01;
BEGIN
    FOR v_lot IN
        SELECT l.id,
            COALESCE(l.advance, 0) AS advance,
            COALESCE(l.advance_payment_mode, 'cash') AS advance_payment_mode,
            COALESCE(l.advance_cheque_status, FALSE) AS advance_cheque_status,
            COALESCE(l.supplier_rate, 0) AS supplier_rate
        FROM mandi.lots l
        WHERE l.status != 'void'
    LOOP
        -- Compute current net payable
        v_net := mandi.compute_lot_net_payable(v_lot.id);

        -- Advance cleared?
        v_cleared_advance := CASE
            WHEN v_lot.advance_payment_mode IN ('cash', 'bank', 'upi')
              OR v_lot.advance_cheque_status = TRUE
            THEN v_lot.advance
            ELSE 0
        END;

        -- Determine initial status
        v_status := CASE
            WHEN v_net <= v_epsilon                                    THEN 'pending'
            WHEN ABS(v_net - v_cleared_advance) < v_epsilon           THEN 'paid'
            WHEN v_cleared_advance > v_epsilon AND v_cleared_advance < v_net THEN 'partial'
            ELSE 'pending'
        END;

        UPDATE mandi.lots
        SET net_payable    = v_net,
            payment_status = v_status,
            paid_amount    = 0   -- allocations from FIFO only (advance tracked separately)
        WHERE id = v_lot.id;
    END LOOP;
END;
$$;
