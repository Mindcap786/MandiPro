-- ============================================================
-- PATCH: Fix 'relation "items" does not exist' Error
-- Migration: 20260412_fix_items_relation_error.sql
--
-- ROOT CAUSE: The stock alert trigger fires when mandi.lots
-- current_qty is updated (which happens during every sale).
-- The trigger function incorrectly referenced mandi.items
-- instead of mandi.commodities, crashing every sale attempt.
-- ============================================================

-- 1. Drop the broken trigger first so sales stop failing immediately
DROP TRIGGER IF EXISTS trg_check_lot_aging ON mandi.lots;

-- 2. Replace the trigger function with the corrected version
--    mandi.lots uses item_id (not commodity_id) to reference mandi.commodities
CREATE OR REPLACE FUNCTION public.check_lot_aging_trigger() 
RETURNS TRIGGER AS $$
DECLARE
    org_config public.alert_config%ROWTYPE;
    v_commodity_name TEXT;
    warn_days INTEGER;
    crit_days INTEGER;
    days_old INTEGER;
BEGIN
    -- Only check active lots with stock
    IF NEW.current_qty <= 0 THEN
        RETURN NEW;
    END IF;

    -- Fetch alert config for this org (may not exist)
    SELECT * INTO org_config 
    FROM public.alert_config 
    WHERE organization_id = NEW.organization_id;

    -- If no config, skip alerting
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    warn_days := COALESCE(org_config.global_aging_warning_days, 3);
    crit_days := COALESCE(org_config.global_aging_critical_days, 5);
    
    -- How old is the lot?
    days_old := EXTRACT(DAY FROM NOW() - NEW.created_at)::INTEGER;

    -- Lookup commodity name via mandi.commodities (item_id is the FK column on mandi.lots)
    SELECT name INTO v_commodity_name
    FROM mandi.commodities
    WHERE id = NEW.item_id;

    IF days_old >= crit_days THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.stock_alerts 
            WHERE associated_lot_id = NEW.id 
              AND is_resolved = false 
              AND alert_type = 'AGING_CRITICAL'
        ) THEN
            INSERT INTO public.stock_alerts 
                (organization_id, alert_type, severity, commodity_id, commodity_name, 
                 associated_lot_id, location_name, current_value, threshold_value, unit)
            VALUES 
                (NEW.organization_id, 'AGING_CRITICAL', 'critical', 
                 NEW.item_id, COALESCE(v_commodity_name, NEW.variety, 'Unknown Commodity'),
                 NEW.id, NEW.storage_location, days_old, crit_days, 'days');
        END IF;

    ELSIF days_old >= warn_days THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.stock_alerts 
            WHERE associated_lot_id = NEW.id 
              AND is_resolved = false 
              AND alert_type = 'AGING_WARNING'
        ) THEN
            INSERT INTO public.stock_alerts 
                (organization_id, alert_type, severity, commodity_id, commodity_name, 
                 associated_lot_id, location_name, current_value, threshold_value, unit)
            VALUES 
                (NEW.organization_id, 'AGING_WARNING', 'medium', 
                 NEW.item_id, COALESCE(v_commodity_name, NEW.variety, 'Unknown Commodity'),
                 NEW.id, NEW.storage_location, days_old, warn_days, 'days');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger (only if public.alert_config and public.stock_alerts exist)
DO $do$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'stock_alerts'
    ) THEN
        DROP TRIGGER IF EXISTS trg_check_lot_aging ON mandi.lots;
        CREATE TRIGGER trg_check_lot_aging 
        AFTER INSERT OR UPDATE OF current_qty ON mandi.lots
        FOR EACH ROW EXECUTE FUNCTION public.check_lot_aging_trigger();
    END IF;
END $do$;

-- 4. Fix the batch stock alert engine to use correct column names
CREATE OR REPLACE FUNCTION public.calculate_stock_alerts(target_org_id UUID)
RETURNS VOID AS $$
DECLARE
    org_config public.alert_config%ROWTYPE;
    item_record RECORD;
    sys_severity TEXT;
    sys_type TEXT;
    thres NUMERIC;
BEGIN
    SELECT * INTO org_config FROM public.alert_config WHERE organization_id = target_org_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Use item_id (the actual FK column in mandi.lots)
    FOR item_record IN 
        SELECT 
            c.id AS commodity_id, 
            c.name AS commodity_name, 
            SUM(l.current_qty) AS total_qty,
            MAX(l.unit) AS unit_measure
        FROM mandi.commodities c
        LEFT JOIN mandi.lots l 
            ON l.item_id = c.id 
            AND l.current_qty > 0 
            AND l.organization_id = target_org_id
        WHERE c.organization_id = target_org_id
        GROUP BY c.id, c.name
    LOOP
        DECLARE
            j_crit NUMERIC := (org_config.commodity_overrides->(item_record.commodity_id::text)->>'critical_val')::numeric;
            j_warn NUMERIC := (org_config.commodity_overrides->(item_record.commodity_id::text)->>'low_val')::numeric;
            active_crit NUMERIC := COALESCE(j_crit, org_config.global_critical_stock_threshold, 100);
            active_warn NUMERIC := COALESCE(j_warn, org_config.global_low_stock_threshold, 500);
        BEGIN
            IF COALESCE(item_record.total_qty, 0) = 0 THEN
                sys_type := 'OUT_OF_STOCK'; sys_severity := 'emergency'; thres := 0;
            ELSIF item_record.total_qty <= active_crit THEN
                sys_type := 'CRITICAL_STOCK'; sys_severity := 'critical'; thres := active_crit;
            ELSIF item_record.total_qty <= active_warn THEN
                sys_type := 'LOW_STOCK'; sys_severity := 'high'; thres := active_warn;
            ELSE
                CONTINUE;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.stock_alerts 
                WHERE organization_id = target_org_id 
                  AND commodity_id = item_record.commodity_id 
                  AND alert_type = sys_type 
                  AND is_resolved = false
            ) THEN
                INSERT INTO public.stock_alerts 
                    (organization_id, alert_type, severity, commodity_id, commodity_name, 
                     current_value, threshold_value, unit)
                VALUES 
                    (target_org_id, sys_type, sys_severity, 
                     item_record.commodity_id, item_record.commodity_name, 
                     COALESCE(item_record.total_qty, 0), thres, 
                     COALESCE(item_record.unit_measure, 'unit'));
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
