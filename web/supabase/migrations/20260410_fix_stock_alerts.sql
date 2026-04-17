-- MANDIGROW: Fix Stock Alerts Table
-- This script creates the stock_alerts table in public schema and enables realtime/RLS.

DO $$ 
BEGIN
    -- 1. Create the table
    CREATE TABLE IF NOT EXISTS public.stock_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        commodity_id UUID,
        commodity_name TEXT,
        associated_lot_id UUID,
        location_name TEXT,
        current_value NUMERIC,
        threshold_value NUMERIC,
        unit TEXT,
        is_seen BOOLEAN DEFAULT false,
        seen_at TIMESTAMPTZ,
        is_resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    -- 2. Enable Row Level Security
    ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

    -- 3. Create simple dev policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'stock_alerts' AND policyname = 'Allow all for authenticated'
    ) THEN
        CREATE POLICY "Allow all for authenticated" ON public.stock_alerts FOR ALL TO authenticated USING (true);
    END IF;

    -- 4. Enable Realtime Replication
    -- Check if table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stock_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_alerts;
    END IF;

END $$;
