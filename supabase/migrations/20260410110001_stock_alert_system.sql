-- =================================================================================
-- LAYER 1 & 2: STOCK ALERT SYSTEM ENGINE
-- Tables, Triggers, Functions, RLS
-- =================================================================================

-- 1. ALERT CONFIGURATION TABLE
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    
    -- Notification Preferences
    notify_whatsapp BOOLEAN DEFAULT false,
    notify_push BOOLEAN DEFAULT true,
    notify_sms BOOLEAN DEFAULT false,
    notify_email BOOLEAN DEFAULT false,
    phone_number TEXT,
    
    -- Global Default Thresholds
    global_low_stock_threshold NUMERIC DEFAULT 500,
    global_critical_stock_threshold NUMERIC DEFAULT 100,
    global_aging_warning_days INTEGER DEFAULT 3,
    global_aging_critical_days INTEGER DEFAULT 5,
    
    -- Specific override JSON: { "commodity_id": { low_val, critical_val } }
    commodity_overrides JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(organization_id)
);

ALTER TABLE public.alert_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own org alert config" ON public.alert_config
    FOR ALL USING (organization_id IN (
        SELECT organization_id FROM core.profiles WHERE id = auth.uid()
    ));

-- 2. STOCK ALERTS LOG & REALTIME HUB
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    
    alert_type TEXT NOT NULL CHECK (alert_type IN ('AGING_WARNING', 'AGING_CRITICAL', 'LOW_STOCK', 'CRITICAL_STOCK', 'OUT_OF_STOCK', 'VALUE_AT_RISK')),
    severity TEXT NOT NULL CHECK (severity IN ('medium', 'high', 'critical', 'emergency')),
    
    commodity_id UUID REFERENCES mandi.commodities(id) ON DELETE CASCADE,
    commodity_name TEXT NOT NULL,
    associated_lot_id UUID REFERENCES mandi.lots(id) ON DELETE SET NULL,
    location_name TEXT,
    
    current_value NUMERIC NOT NULL,
    threshold_value NUMERIC NOT NULL,
    unit TEXT,
    
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    
    -- Edge function tracks which channels were successfully fired
    notified_channels TEXT[] DEFAULT '{}',
    error_log JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turn on Realtime Broadcast for Stock Alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_alerts;
ALTER TABLE public.stock_alerts REPLICA IDENTITY FULL;

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage their org alerts" ON public.stock_alerts
    FOR ALL USING (organization_id IN (
        SELECT organization_id FROM core.profiles WHERE id = auth.uid()
    ));

-- 3. PUSH NOTIFICATION TOKENS
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    token TEXT NOT NULL UNIQUE,
    platform TEXT, -- 'ios', 'android', 'web'
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users register own tokens" ON public.push_notification_tokens
    FOR ALL USING (user_id = auth.uid());


-- 4. TRIGGER: AGING ALERTS (ON NEW/AGED LOTS)
-- ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_lot_aging_trigger() 
RETURNS TRIGGER AS $$
DECLARE
    org_config public.alert_config%ROWTYPE;
    warn_days INTEGER;
    crit_days INTEGER;
    days_old INTEGER;
BEGIN
    -- Only active lots
    IF NEW.current_qty <= 0 THEN
        RETURN NEW;
    END IF;

    -- Fetch config for org
    SELECT * INTO org_config FROM public.alert_config WHERE organization_id = NEW.organization_id;

    -- Local overrides preferred, global settings fallback
    warn_days := COALESCE(NEW.shelf_life_days, org_config.global_aging_warning_days, 3);
    crit_days := COALESCE(NEW.critical_age_days, org_config.global_aging_critical_days, 5);
    
    -- How old is the lot?
    days_old := EXTRACT(DAY FROM NOW() - NEW.created_at);

    IF days_old >= crit_days THEN
        -- Check if critical alert already exists for this lot that is unresolved
        IF NOT EXISTS (SELECT 1 FROM public.stock_alerts WHERE associated_lot_id = NEW.id AND is_resolved = false AND alert_type = 'AGING_CRITICAL') THEN
            INSERT INTO public.stock_alerts 
                (organization_id, alert_type, severity, commodity_id, commodity_name, associated_lot_id, location_name, current_value, threshold_value, unit)
            VALUES 
                (NEW.organization_id, 'AGING_CRITICAL', 'critical', NEW.commodity_id, COALESCE(NEW.variety, 'Unknown Commodity'), NEW.id, NEW.storage_location, days_old, crit_days, 'days');
        END IF;

    ELSIF days_old >= warn_days THEN
        -- Check if warning alert already exists
        IF NOT EXISTS (SELECT 1 FROM public.stock_alerts WHERE associated_lot_id = NEW.id AND is_resolved = false AND alert_type = 'AGING_WARNING') THEN
            INSERT INTO public.stock_alerts 
                (organization_id, alert_type, severity, commodity_id, commodity_name, associated_lot_id, location_name, current_value, threshold_value, unit)
            VALUES 
                (NEW.organization_id, 'AGING_WARNING', 'medium', NEW.commodity_id, COALESCE(NEW.variety, 'Unknown Commodity'), NEW.id, NEW.storage_location, days_old, warn_days, 'days');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Map to mandi.lots
DROP TRIGGER IF EXISTS trg_check_lot_aging ON mandi.lots;
CREATE TRIGGER trg_check_lot_aging 
AFTER INSERT OR UPDATE OF current_qty ON mandi.lots
FOR EACH ROW EXECUTE FUNCTION public.check_lot_aging_trigger();


-- 5. LOW STOCK SCAN ENGINE
-- ---------------------------------------------------------------------------------
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

    -- Aggregate active stock by commodity for this org
    FOR item_record IN 
        SELECT 
            i.id as commodity_id, 
            i.name as commodity_name, 
            SUM(l.current_qty) as total_qty,
            MAX(l.unit) as unit_measure
        FROM mandi.commodities i
        LEFT JOIN mandi.lots l ON l.commodity_id = i.id AND l.current_qty > 0 AND l.organization_id = target_org_id
        WHERE i.organization_id = target_org_id AND i.is_active = true
        GROUP BY i.id, i.name
    LOOP
        -- Check overrides first, then globals
        DECLARE
            j_crit NUMERIC := (org_config.commodity_overrides->(item_record.commodity_id::text)->>'critical_val')::numeric;
            j_warn NUMERIC := (org_config.commodity_overrides->(item_record.commodity_id::text)->>'low_val')::numeric;
            active_crit NUMERIC := COALESCE(j_crit, org_config.global_critical_stock_threshold, 100);
            active_warn NUMERIC := COALESCE(j_warn, org_config.global_low_stock_threshold, 500);
        BEGIN
            -- Evaluate severity
            IF COALESCE(item_record.total_qty, 0) = 0 THEN
                sys_type := 'OUT_OF_STOCK';
                sys_severity := 'emergency';
                thres := 0;
            ELSIF item_record.total_qty <= active_crit THEN
                sys_type := 'CRITICAL_STOCK';
                sys_severity := 'critical';
                thres := active_crit;
            ELSIF item_record.total_qty <= active_warn THEN
                sys_type := 'LOW_STOCK';
                sys_severity := 'high';
                thres := active_warn;
            ELSE
                CONTINUE; -- No alert needed
            END IF;

            -- Insert if not recently alerted unresolved
            IF NOT EXISTS (
                SELECT 1 FROM public.stock_alerts 
                WHERE organization_id = target_org_id 
                AND commodity_id = item_record.commodity_id 
                AND alert_type = sys_type 
                AND is_resolved = false
            ) THEN
                INSERT INTO public.stock_alerts 
                    (organization_id, alert_type, severity, commodity_id, commodity_name, current_value, threshold_value, unit)
                VALUES 
                    (target_org_id, sys_type, sys_severity, item_record.commodity_id, item_record.commodity_name, COALESCE(item_record.total_qty, 0), thres, COALESCE(item_record.unit_measure, 'unit'));
            END IF;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. PG_CRON BATCH ALERT SCHEDULER
-- ---------------------------------------------------------------------------------
-- Extension required: create extension if not exists pg_cron;
-- Ensure you have privileges to run cron jobs in Supabase SQL Editor
DO $do$
BEGIN
    PERFORM cron.schedule('check-stock-alerts-6am', '0 6 * * *', $$
        SELECT public.calculate_stock_alerts(id) FROM core.organizations WHERE is_active = true;
    $$);
    PERFORM cron.schedule('check-stock-alerts-12pm', '0 12 * * *', $$
        SELECT public.calculate_stock_alerts(id) FROM core.organizations WHERE is_active = true;
    $$);
    PERFORM cron.schedule('check-stock-alerts-6pm', '0 18 * * *', $$
        SELECT public.calculate_stock_alerts(id) FROM core.organizations WHERE is_active = true;
    $$);
EXCEPTION WHEN OTHERS THEN
    -- In local or environments without cron, gracefully skip
END $do$;
