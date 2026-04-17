-- Migration: Add Playstore Link to Site Contact Settings
-- Description: Adds a new column to store the Android app Playstore URL.

ALTER TABLE core.site_contact_settings 
ADD COLUMN IF NOT EXISTS playstore_app_link TEXT NOT NULL DEFAULT '';
