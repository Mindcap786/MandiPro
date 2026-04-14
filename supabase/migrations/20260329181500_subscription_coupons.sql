-- Migration: Subscription Discount Coupons (Task 10)
-- Description: Establishes the core.subscription_coupons table allowing Super Admins to generate discount codes.

CREATE TABLE IF NOT EXISTS core.subscription_coupons (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    discount_amount NUMERIC NOT NULL CHECK (discount_amount > 0),
    discount_type TEXT NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percentage')),
    description TEXT,
    max_uses INT NULL,
    current_uses INT DEFAULT 0,
    expires_at TIMESTAMPTZ NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES core.profiles(id)
);

-- RLS Policies
ALTER TABLE core.subscription_coupons ENABLE ROW LEVEL SECURITY;

-- Anyone can read active coupons to validate them during checkout
CREATE POLICY "Anyone can read active coupons" ON core.subscription_coupons
    FOR SELECT USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR current_uses < max_uses));

-- Only Super Admins can manage coupons
CREATE POLICY "Super Admins can manage coupons" ON core.subscription_coupons
    FOR ALL USING (
        EXISTS (SELECT 1 FROM core.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM core.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
    );
