-- Add storage_location to arrivals and lots
ALTER TABLE arrivals ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Mandi';
ALTER TABLE lots ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Mandi';

-- Update seed function to include storage_location in field governance
CREATE OR REPLACE FUNCTION seed_storage_field_config()
RETURNS void AS $$
BEGIN
  INSERT INTO field_configs (organization_id, module_id, field_key, label, field_type, default_value, is_visible, is_mandatory, display_order)
  SELECT 
    org.id,
    'arrivals',
    'storage_location',
    'Storage Destination',
    'select',
    'Mandi',
    true,
    true,
    6 -- After arrival_type
  FROM organizations org
  ON CONFLICT (organization_id, module_id, field_key) DO UPDATE
  SET 
    label = EXCLUDED.label,
    field_type = EXCLUDED.field_type,
    display_order = EXCLUDED.display_order;
END;
$$ LANGUAGE plpgsql;

SELECT seed_storage_field_config();
