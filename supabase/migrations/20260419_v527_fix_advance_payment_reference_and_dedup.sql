-- =============================================================================
-- Migration v5.27-v5.29: Fix advance_payment reference_id + dedup
-- =============================================================================
-- ROOT CAUSE (confirmed from live DB forensic, April 19 2026):
--
-- 1. post_arrival_ledger was inserting advance_payment entries WITHOUT
--    reference_id = p_arrival_id. The goods_arrival entry had reference_id set,
--    but the advance_payment did not. This caused the Day Book grouping to
--    split them into two separate display rows per arrival.
--
-- 2. An older lot-based code path wrote "Advance - LOT--xxxx (cash)" entries
--    without bill_number or reference_id, causing mubarak's data to be invisible.
--
-- 3. Both code paths ran for the same arrivals, creating duplicate entries.
--
-- FIXES:
--   v5.27: Fix post_arrival_ledger RPC + backfill via bill_number match
--   v5.28: Backfill via lot_code suffix in description for LOT-based entries
--   v5.29: Remove duplicate advance_payment entries (keep oldest)
-- =============================================================================

-- ─── v5.27 STEP 1: Backfill via bill_number ──────────────────────────────────
UPDATE mandi.ledger_entries adv
SET reference_id = ga.reference_id
FROM mandi.ledger_entries ga
WHERE adv.transaction_type = 'advance_payment'
  AND adv.reference_id IS NULL
  AND ga.transaction_type = 'goods_arrival'
  AND ga.organization_id = adv.organization_id
  AND ga.contact_id = adv.contact_id
  AND ga.bill_number = adv.bill_number
  AND ga.reference_id IS NOT NULL
  AND (adv.reference_no LIKE 'ADV-%' OR adv.description LIKE 'Advance Paid%');

-- ─── v5.27 STEP 2: Fix post_arrival_ledger RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION mandi.post_arrival_ledger(p_arrival_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'mandi', 'public'
AS $function$
DECLARE
    v_arrival        RECORD;
    v_net_payable    NUMERIC := 0;
    v_advance        NUMERIC := 0;
    v_balance        NUMERIC := 0;
    v_status         TEXT;
    v_lot            RECORD;
    v_epsilon        CONSTANT NUMERIC := 0.01;
    v_lot_list       TEXT[] := '{}';
    v_lot_products   JSONB  := '[]'::JSONB;
    v_narration      TEXT;
    v_bill_label     TEXT;
    v_cleared_mode   TEXT;
    v_is_cleared     BOOLEAN;
    v_lot_net        NUMERIC;
    v_commission_amt NUMERIC;
    v_gross_amt      NUMERIC;
BEGIN
    SELECT * INTO v_arrival FROM mandi.arrivals WHERE id = p_arrival_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Arrival not found'); 
    END IF;

    IF v_arrival.party_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No party_id on arrival');
    END IF;

    v_bill_label := 'Bill #' || COALESCE(v_arrival.bill_no::text, 'N/A');

    FOR v_lot IN
        SELECT 
            l.id, l.lot_code, l.initial_qty, l.less_units, l.less_percent,
            l.unit, l.supplier_rate, l.commission_percent, l.farmer_charges,
            l.packing_cost, l.loading_cost,
            COALESCE(l.arrival_type, v_arrival.arrival_type, 'commission') AS arrival_type,
            c.name as item_name,
            COALESCE(
                (SELECT SUM(si.amount) FROM mandi.sale_items si WHERE si.lot_id = l.id), 
                0
            ) AS sales_sum
        FROM mandi.lots l
        LEFT JOIN mandi.commodities c ON c.id = l.item_id
        WHERE l.arrival_id = p_arrival_id
    LOOP
        DECLARE
            v_adj_qty    NUMERIC;
            v_base_value NUMERIC;
            v_expenses   NUMERIC;
            v_goods_val  NUMERIC;
        BEGIN
            v_adj_qty    := COALESCE(v_lot.initial_qty, 0)
                          - COALESCE(v_lot.less_units, 0)
                          - (COALESCE(v_lot.initial_qty, 0) * COALESCE(v_lot.less_percent, 0) / 100.0);
            v_base_value := v_adj_qty * COALESCE(v_lot.supplier_rate, 0);
            v_expenses   := COALESCE(v_lot.packing_cost, 0) + COALESCE(v_lot.loading_cost, 0);

            IF v_lot.arrival_type = 'direct' THEN
                v_gross_amt      := v_base_value;
                v_commission_amt := 0;
                v_lot_net        := GREATEST(0, v_base_value - COALESCE(v_lot.farmer_charges, 0));
            ELSE
                v_goods_val      := CASE WHEN COALESCE(v_lot.sales_sum,0) > 0 THEN v_lot.sales_sum ELSE v_base_value END;
                v_gross_amt      := v_goods_val;
                v_commission_amt := v_goods_val * COALESCE(v_lot.commission_percent, 0) / 100.0;
                v_lot_net        := GREATEST(0, v_goods_val - v_commission_amt - COALESCE(v_lot.farmer_charges, 0) - v_expenses);
            END IF;
        END;

        v_net_payable := v_net_payable + v_lot_net;
        v_lot_list := array_append(v_lot_list,
            COALESCE(v_lot.item_name, 'Item')
            || ' ' || COALESCE(v_lot.initial_qty, 0)::text
            || ' ' || COALESCE(v_lot.unit, 'Units')
            || ' @ ₹' || COALESCE(v_lot.supplier_rate, 0)::text
        );
        v_lot_products := v_lot_products || jsonb_build_object(
            'name',              COALESCE(v_lot.item_name, 'Item'),
            'lot_code',          v_lot.lot_code,
            'qty',               COALESCE(v_lot.initial_qty, 0),
            'unit',              COALESCE(v_lot.unit, 'Units'),
            'rate',              COALESCE(v_lot.supplier_rate, 0),
            'gross_amount',      ROUND(v_gross_amt::NUMERIC, 2),
            'commission_pct',    COALESCE(v_lot.commission_percent, 0),
            'commission_amount', ROUND(v_commission_amt::NUMERIC, 2),
            'net_amount',        ROUND(v_lot_net::NUMERIC, 2),
            'amount',            ROUND(v_lot_net::NUMERIC, 2)
        );
    END LOOP;

    v_net_payable := GREATEST(0, v_net_payable
        - COALESCE(v_arrival.hire_charges, 0)
        - COALESCE(v_arrival.hamali_expenses, 0)
        - COALESCE(v_arrival.other_expenses, 0)
    );

    v_narration    := 'Inward Purchase: ' || COALESCE(array_to_string(v_lot_list, ', '), v_bill_label);
    v_advance      := COALESCE(v_arrival.advance_amount, 0);
    v_cleared_mode := COALESCE(v_arrival.advance_payment_mode, 'cash');
    v_is_cleared   := v_cleared_mode IN ('cash', 'bank', 'upi', 'UPI/BANK');
    v_balance      := GREATEST(0, v_net_payable - CASE WHEN v_is_cleared THEN v_advance ELSE 0 END);

    v_status := CASE
        WHEN v_net_payable <= v_epsilon  THEN 'pending'
        WHEN v_balance < v_epsilon       THEN 'paid'
        WHEN v_advance > v_epsilon       THEN 'partial'
        ELSE                                  'pending'
    END;

    UPDATE mandi.arrivals SET status = v_status WHERE id = p_arrival_id;

    IF v_net_payable > v_epsilon THEN
        DELETE FROM mandi.ledger_entries
        WHERE organization_id = v_arrival.organization_id
          AND contact_id      = v_arrival.party_id
          AND reference_id    = p_arrival_id
          AND transaction_type = 'goods_arrival';

        INSERT INTO mandi.ledger_entries (
            organization_id, contact_id, entry_date,
            transaction_type, debit, credit,
            narration, description, status,
            reference_id, reference_no, bill_number, products
        ) VALUES (
            v_arrival.organization_id,
            v_arrival.party_id,
            v_arrival.arrival_date,
            'goods_arrival',
            0,
            v_net_payable,
            v_narration,
            v_narration,
            'posted',
            p_arrival_id,
            v_bill_label,
            v_bill_label,
            v_lot_products
        );

        IF v_advance > v_epsilon AND v_is_cleared THEN
            DELETE FROM mandi.ledger_entries
            WHERE organization_id = v_arrival.organization_id
              AND contact_id      = v_arrival.party_id
              AND reference_no    = 'ADV-' || v_bill_label;

            INSERT INTO mandi.ledger_entries (
                organization_id, contact_id, entry_date,
                transaction_type, debit, credit,
                narration, description, status,
                reference_id,          -- ✓ FIX: was missing!
                reference_no, bill_number
            ) VALUES (
                v_arrival.organization_id,
                v_arrival.party_id,
                v_arrival.arrival_date,
                'advance_payment',
                v_advance,
                0,
                'Advance Paid (' || UPPER(v_cleared_mode) || '): ' || v_bill_label,
                'Advance Paid (' || UPPER(v_cleared_mode) || '): ' || v_bill_label,
                'posted',
                p_arrival_id,          -- ✓ FIX: same arrival UUID as goods_arrival
                'ADV-' || v_bill_label,
                v_bill_label
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success',    true,
        'arrival_id', p_arrival_id,
        'net_payable', v_net_payable,
        'advance',    v_advance,
        'balance',    v_balance,
        'status',     v_status,
        'bill_label', v_bill_label
    );
END;
$function$;

-- ─── v5.28: Backfill via lot_code suffix ─────────────────────────────────────
WITH lot_advance_matches AS (
    SELECT 
        adv.id as adv_le_id,
        a.id as arrival_id,
        a.bill_no,
        a.organization_id
    FROM mandi.ledger_entries adv
    JOIN mandi.lots l ON adv.description LIKE '%' || l.lot_code || '%'
    JOIN mandi.arrivals a ON a.id = l.arrival_id
    WHERE adv.transaction_type = 'advance_payment'
      AND adv.reference_id IS NULL
      AND adv.description LIKE 'Advance - LOT--%'
      AND adv.organization_id = a.organization_id
)
UPDATE mandi.ledger_entries le
SET 
    reference_id  = m.arrival_id,
    reference_no  = COALESCE(le.reference_no, 'ADV-Bill #' || m.bill_no),
    bill_number   = COALESCE(le.bill_number, 'Bill #' || m.bill_no)
FROM lot_advance_matches m
WHERE le.id = m.adv_le_id;

-- ─── v5.29: Remove duplicate advance_payment entries ─────────────────────────
DELETE FROM mandi.ledger_entries
WHERE id IN (
    SELECT le.id
    FROM mandi.ledger_entries le
    WHERE le.transaction_type = 'advance_payment'
      AND le.reference_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM mandi.ledger_entries other
          WHERE other.transaction_type = 'advance_payment'
            AND other.organization_id = le.organization_id
            AND other.contact_id = le.contact_id
            AND other.reference_id = le.reference_id
            AND other.id != le.id
            AND other.created_at < le.created_at
      )
);
