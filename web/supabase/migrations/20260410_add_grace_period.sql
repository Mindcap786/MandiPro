-- Migration: Add grace_period_ends_at to organizations and subscriptions tables
-- This allows Super Admin to set a post-expiry grace window where tenants can still log in

ALTER TABLE core.organizations
    ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz DEFAULT NULL;

ALTER TABLE core.subscriptions
    ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz DEFAULT NULL;

-- Comment documenting the grace period flow:
-- 1. trial_ends_at / current_period_end  → Main expiry. After this, show "Subscription Expiring" warnings.
-- 2. grace_period_ends_at               → Hard lockout. After this, the tenant is fully blocked from logging in.
-- If grace_period_ends_at is NULL, the hard lockout happens at the main expiry.
