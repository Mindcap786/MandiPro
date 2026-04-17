-- Migration: 20260417_fix_subscriptions_schema.sql
-- Description: Adds missing audit columns to core.subscriptions to prevent provisioning failures

DO $$
BEGIN
    -- Add created_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'subscriptions' AND column_name = 'created_at') THEN
        ALTER TABLE core.subscriptions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'subscriptions' AND column_name = 'updated_at') THEN
        ALTER TABLE core.subscriptions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
