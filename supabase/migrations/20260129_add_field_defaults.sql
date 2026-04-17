-- Add default value support to field_configs table
ALTER TABLE field_configs 
ADD COLUMN IF NOT EXISTS default_value TEXT,
ADD COLUMN IF NOT EXISTS field_type VARCHAR(20) DEFAULT 'text';

-- Create function to seed arrivals fields for all organizations
CREATE OR REPLACE FUNCTION seed_arrivals_field_configs()
RETURNS void AS $$
BEGIN
  INSERT INTO field_configs (organization_id, module_id, field_key, label, field_type, default_value, is_visible, is_mandatory, display_order)
  SELECT 
    org.id,
    'arrivals',
    field_key,
    label,
    field_type,
    default_value,
    true,
    is_mandatory,
    display_order
  FROM organizations org
  CROSS JOIN (VALUES
    -- Header Fields
    ('entry_date', 'Entry Date', 'date', NULL, false, 1),
    ('reference_no', 'Reference No', 'text', NULL, false, 2),
    ('lot_prefix', 'Lot Prefix', 'text', NULL, true, 3),
    ('contact_id', 'Farmer/Supplier', 'select', NULL, true, 4),
    ('arrival_type', 'Arrival Type', 'select', 'commission', false, 5),
    
    -- Transport Details
    ('vehicle_number', 'Vehicle Number', 'text', NULL, false, 10),
    ('vehicle_type', 'Vehicle Type', 'text', NULL, false, 11),
    ('driver_name', 'Driver Name', 'text', NULL, false, 12),
    ('driver_mobile', 'Driver Mobile', 'text', NULL, false, 13),
    
    -- Business Fields
    ('guarantor', 'Guarantor', 'text', NULL, false, 20),
    
    -- Trip Expenses
    ('loaders_count', 'Loaders Count', 'number', '0', false, 30),
    ('hire_charges', 'Hire Charges', 'number', '0', false, 31),
    ('hamali_expenses', 'Hamali Expenses', 'number', '0', false, 32),
    ('other_expenses', 'Other Expenses', 'number', '0', false, 33),
    
    -- Item Fields
    ('item_id', 'Commodity', 'select', NULL, true, 40),
    ('variety', 'Variety', 'text', NULL, false, 41),
    ('grade', 'Grade', 'select', 'A', false, 42),
    ('qty', 'Quantity', 'number', '10', false, 43),
    ('unit', 'Unit', 'select', 'Box', false, 44),
    ('unit_weight', 'Unit Weight', 'number', '10', false, 45),
    ('supplier_rate', 'Rate', 'number', '0', false, 46),
    ('commission_percent', 'Commission %', 'number', '6', false, 47),
    ('less_percent', 'Less %', 'number', '0', false, 48),
    ('packing_cost', 'Packing Cost', 'number', '0', false, 49),
    ('loading_cost', 'Loading Cost', 'number', '0', false, 50),
    ('advance', 'Advance', 'number', '0', false, 51),
    ('farmer_charges', 'Other Cut', 'number', '0', false, 52)
  ) AS fields(field_key, label, field_type, default_value, is_mandatory, display_order)
  ON CONFLICT (organization_id, module_id, field_key) DO UPDATE
  SET 
    label = EXCLUDED.label,
    field_type = EXCLUDED.field_type,
    display_order = EXCLUDED.display_order;
END;
$$ LANGUAGE plpgsql;

-- Execute the seeding function
SELECT seed_arrivals_field_configs();
