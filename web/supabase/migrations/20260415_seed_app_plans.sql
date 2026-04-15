-- ============================================================
-- SEED: App Plans Verification
-- Migration: 20260415_seed_app_plans.sql
--
-- Ensures standard plans (Basic, Standard, Enterprise) and
-- the premium "VIP_PLAN" are correctly seeded and active.
-- ============================================================

INSERT INTO core.app_plans (name, display_name, price_monthly, price_yearly, max_web_users, max_mobile_users, is_active, features)
VALUES 
('basic', 'Basic', 999, 9990, 1, 0, true, '{"show_on_homepage": true, "support_level": "standard"}'),
('standard', 'Standard', 2499, 24990, 5, 2, true, '{"show_on_homepage": true, "support_level": "priority"}'),
('enterprise', 'Enterprise', 9999, 99990, 50, 20, true, '{"show_on_homepage": true, "support_level": "dedicated"}'),
('vip_plan', 'VIP Plan', 15000, 150000, 100, 100, true, '{"show_on_homepage": false, "support_level": "elite", "white_label": true}')
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    max_web_users = EXCLUDED.max_web_users,
    max_mobile_users = EXCLUDED.max_mobile_users,
    is_active = true,
    features = EXCLUDED.features;

-- Ensure the 'core.subscriptions' table has a dummy plan for free trials if needed
-- (Not strictly necessary if logic handles trial status)
