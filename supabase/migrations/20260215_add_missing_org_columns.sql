-- Migration: Add is_active and subscription_tier to organizations if they don't exist
-- Date: 2026-02-15

DO $$ 
BEGIN
    -- Add is_active if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='organizations' AND column_name='is_active'
    ) THEN
        ALTER TABLE organizations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;

    -- Add subscription_tier if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='organizations' AND column_name='subscription_tier'
    ) THEN
        ALTER TABLE organizations ADD COLUMN subscription_tier TEXT DEFAULT 'Free';
    END IF;
END $$;
