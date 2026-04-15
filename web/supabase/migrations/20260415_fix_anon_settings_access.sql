-- ================================================================
-- Migration: 20260415_fix_anon_settings_access.sql
-- Goal: Allow login page (unauthenticated users) to fetch global settings
-- ================================================================

-- 1. Grant usage on schema to anon (if not already granted)
GRANT USAGE ON SCHEMA core TO anon;

-- 2. Grant select on app_settings to anon
GRANT SELECT ON core.app_settings TO anon;

-- 3. Ensure global_trial_days row exists with a clean value
INSERT INTO core.app_settings (key, value)
VALUES ('global_trial_days', '14')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value
WHERE core.app_settings.key = 'global_trial_days';

-- 4. Enable RLS on app_settings (if not already enabled)
ALTER TABLE core.app_settings ENABLE ROW LEVEL SECURITY;

-- 5. Add a policy to allow public READ of settings
-- Note: app_settings generally contains non-sensitive public config
DROP POLICY IF EXISTS "app_settings_public_read" ON core.app_settings;
CREATE POLICY "app_settings_public_read"
  ON core.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);
