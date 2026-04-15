-- Migration: Add web and mobile users to subscription plans and organizations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS max_web_users integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_mobile_users integer DEFAULT 0;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS max_web_users integer,
ADD COLUMN IF NOT EXISTS max_mobile_users integer;

-- Update existing plans to be inactive to favor the new structure
UPDATE public.subscription_plans SET is_active = false;

INSERT INTO public.subscription_plans 
(id, name, display_name, price_monthly, price_yearly, max_web_users, max_mobile_users, is_active)
VALUES
(uuid_generate_v4(), 'Basic Web', 'Basic (Web Only)', 500, 5000, 1, 0, true),
(uuid_generate_v4(), 'Basic Mobile', 'Basic (Mobile Only)', 300, 3000, 0, 1, true),
(uuid_generate_v4(), 'Basic Dual', 'Basic (Web & Mobile)', 700, 7000, 1, 1, true),
(uuid_generate_v4(), 'Silver', 'Silver Plan', 1500, 15000, 2, 3, true),
(uuid_generate_v4(), 'Gold', 'Gold Plan', 3000, 30000, 3, 12, true);
