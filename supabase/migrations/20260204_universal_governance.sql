-- Migration: Universal Field Governance Seeding
-- Date: 2026-02-04

CREATE OR REPLACE FUNCTION seed_default_field_configs(p_org_id UUID)
RETURNS void AS $$
BEGIN
  -- Insert all default fields for the specific organization
  INSERT INTO field_configs (organization_id, module_id, field_key, label, field_type, default_value, is_visible, is_mandatory, display_order)
  VALUES
    -- 1. GATE ENTRY
    (p_org_id, 'gate_entry', 'vehicle_no', 'Vehicle Number', 'text', NULL, true, true, 1),
    (p_org_id, 'gate_entry', 'driver_name', 'Driver Name', 'text', NULL, true, false, 2),
    (p_org_id, 'gate_entry', 'driver_phone', 'Driver Phone', 'text', NULL, true, false, 3),
    (p_org_id, 'gate_entry', 'commodity', 'Commodity', 'text', NULL, true, true, 4),
    (p_org_id, 'gate_entry', 'source', 'Source / City', 'text', NULL, true, false, 5),

    -- 2. ARRIVALS (Direct Purchase)
    (p_org_id, 'arrivals_direct', 'entry_date', 'Entry Date', 'date', NULL, true, true, 1),
    (p_org_id, 'arrivals_direct', 'reference_no', 'Ref / Bill No', 'text', NULL, true, false, 2),
    (p_org_id, 'arrivals_direct', 'lot_prefix', 'Lot Prefix', 'text', 'LOT', true, true, 3),
    (p_org_id, 'arrivals_direct', 'contact_id', 'Supplier', 'select', NULL, true, true, 4),
    (p_org_id, 'arrivals_direct', 'storage_location', 'Storage Destination', 'toggle', 'Mandi', true, true, 6),
    (p_org_id, 'arrivals_direct', 'vehicle_number', 'Vehicle Number', 'text', NULL, true, false, 10),
    (p_org_id, 'arrivals_direct', 'vehicle_type', 'Vehicle Type', 'select', 'Pickup', true, false, 11),
    (p_org_id, 'arrivals_direct', 'guarantor', 'Guarantor', 'text', NULL, true, false, 12),
    (p_org_id, 'arrivals_direct', 'driver_name', 'Driver Name', 'text', NULL, true, false, 13),
    (p_org_id, 'arrivals_direct', 'driver_phone', 'Driver Mobile', 'text', NULL, true, false, 14),
    (p_org_id, 'arrivals_direct', 'hamali_expenses', 'Hamali Expenses', 'number', '0', true, false, 20),
    (p_org_id, 'arrivals_direct', 'hire_charges', 'Hire Charges', 'number', '0', true, false, 21),
    (p_org_id, 'arrivals_direct', 'other_expenses', 'Other Deductions', 'number', '0', true, false, 22),
    (p_org_id, 'arrivals_direct', 'item_id', 'Commodity', 'select', NULL, true, true, 30),
    (p_org_id, 'arrivals_direct', 'variety', 'Variety', 'text', NULL, true, false, 31),
    (p_org_id, 'arrivals_direct', 'grade', 'Grade', 'text', 'A', true, true, 32),
    (p_org_id, 'arrivals_direct', 'qty', 'Quantity / Nugs', 'number', '0', true, true, 33),
    (p_org_id, 'arrivals_direct', 'unit', 'Packaging Unit', 'text', 'Box', true, true, 34),
    (p_org_id, 'arrivals_direct', 'unit_weight', 'Unit Weight', 'number', '0', true, false, 35),
    (p_org_id, 'arrivals_direct', 'supplier_rate', 'Purchase Rate ($)', 'number', '0', true, true, 36),
    (p_org_id, 'arrivals_direct', 'less_percent', 'Less %', 'number', '0', true, false, 37),
    (p_org_id, 'arrivals_direct', 'packing_cost', 'Packing Cost', 'number', '0', true, false, 38),
    (p_org_id, 'arrivals_direct', 'loading_cost', 'Loading Cost', 'number', '0', true, false, 39),
    (p_org_id, 'arrivals_direct', 'advance', 'Advance', 'number', '0', true, false, 40),

    -- 2.1 ARRIVALS (Farmer Commission)
    (p_org_id, 'arrivals_farmer', 'entry_date', 'Entry Date', 'date', NULL, true, true, 1),
    (p_org_id, 'arrivals_farmer', 'reference_no', 'Ref / Bill No', 'text', NULL, true, false, 2),
    (p_org_id, 'arrivals_farmer', 'lot_prefix', 'Lot Prefix', 'text', 'LOT', true, true, 3),
    (p_org_id, 'arrivals_farmer', 'contact_id', 'Farmer', 'select', NULL, true, true, 4),
    (p_org_id, 'arrivals_farmer', 'storage_location', 'Storage Destination', 'toggle', 'Mandi', true, true, 6),
    (p_org_id, 'arrivals_farmer', 'vehicle_number', 'Vehicle Number', 'text', NULL, true, false, 10),
    (p_org_id, 'arrivals_farmer', 'vehicle_type', 'Vehicle Type', 'select', 'Pickup', true, false, 11),
    (p_org_id, 'arrivals_farmer', 'guarantor', 'Guarantor', 'text', NULL, true, false, 12),
    (p_org_id, 'arrivals_farmer', 'driver_name', 'Driver Name', 'text', NULL, true, false, 13),
    (p_org_id, 'arrivals_farmer', 'driver_phone', 'Driver Mobile', 'text', NULL, true, false, 14),
    (p_org_id, 'arrivals_farmer', 'hamali_expenses', 'Hamali Expenses', 'number', '0', true, false, 20),
    (p_org_id, 'arrivals_farmer', 'hire_charges', 'Hire Charges', 'number', '0', true, false, 21),
    (p_org_id, 'arrivals_farmer', 'other_expenses', 'Other Deductions', 'number', '0', true, false, 22),
    (p_org_id, 'arrivals_farmer', 'item_id', 'Commodity', 'select', NULL, true, true, 30),
    (p_org_id, 'arrivals_farmer', 'variety', 'Variety', 'text', NULL, true, false, 31),
    (p_org_id, 'arrivals_farmer', 'grade', 'Grade', 'text', 'A', true, true, 32),
    (p_org_id, 'arrivals_farmer', 'qty', 'Quantity / Nugs', 'number', '0', true, true, 33),
    (p_org_id, 'arrivals_farmer', 'unit', 'Packaging Unit', 'text', 'Box', true, true, 34),
    (p_org_id, 'arrivals_farmer', 'unit_weight', 'Unit Weight', 'number', '0', true, false, 35),
    (p_org_id, 'arrivals_farmer', 'supplier_rate', 'Purchase Rate ($)', 'number', '0', true, false, 36),
    (p_org_id, 'arrivals_farmer', 'less_percent', 'Less %', 'number', '0', true, false, 37),
    (p_org_id, 'arrivals_farmer', 'packing_cost', 'Packing Cost', 'number', '0', true, false, 38),
    (p_org_id, 'arrivals_farmer', 'loading_cost', 'Loading Cost', 'number', '0', true, false, 39),
    (p_org_id, 'arrivals_farmer', 'advance', 'Advance', 'number', '0', true, false, 40),

    -- 2.2 ARRIVALS (Supplier Commission)
    (p_org_id, 'arrivals_supplier', 'entry_date', 'Entry Date', 'date', NULL, true, true, 1),
    (p_org_id, 'arrivals_supplier', 'reference_no', 'Ref / Bill No', 'text', NULL, true, false, 2),
    (p_org_id, 'arrivals_supplier', 'lot_prefix', 'Lot Prefix', 'text', 'LOT', true, true, 3),
    (p_org_id, 'arrivals_supplier', 'contact_id', 'Supplier', 'select', NULL, true, true, 4),
    (p_org_id, 'arrivals_supplier', 'storage_location', 'Storage Destination', 'toggle', 'Mandi', true, true, 6),
    (p_org_id, 'arrivals_supplier', 'vehicle_number', 'Vehicle Number', 'text', NULL, true, false, 10),
    (p_org_id, 'arrivals_supplier', 'vehicle_type', 'Vehicle Type', 'select', 'Pickup', true, false, 11),
    (p_org_id, 'arrivals_supplier', 'guarantor', 'Guarantor', 'text', NULL, true, false, 12),
    (p_org_id, 'arrivals_supplier', 'driver_name', 'Driver Name', 'text', NULL, true, false, 13),
    (p_org_id, 'arrivals_supplier', 'driver_phone', 'Driver Mobile', 'text', NULL, true, false, 14),
    (p_org_id, 'arrivals_supplier', 'hamali_expenses', 'Hamali Expenses', 'number', '0', true, false, 20),
    (p_org_id, 'arrivals_supplier', 'hire_charges', 'Hire Charges', 'number', '0', true, false, 21),
    (p_org_id, 'arrivals_supplier', 'other_expenses', 'Other Deductions', 'number', '0', true, false, 22),
    (p_org_id, 'arrivals_supplier', 'item_id', 'Commodity', 'select', NULL, true, true, 30),
    (p_org_id, 'arrivals_supplier', 'variety', 'Variety', 'text', NULL, true, false, 31),
    (p_org_id, 'arrivals_supplier', 'grade', 'Grade', 'text', 'A', true, true, 32),
    (p_org_id, 'arrivals_supplier', 'qty', 'Quantity / Nugs', 'number', '0', true, true, 33),
    (p_org_id, 'arrivals_supplier', 'unit', 'Packaging Unit', 'text', 'Box', true, true, 34),
    (p_org_id, 'arrivals_supplier', 'unit_weight', 'Unit Weight', 'number', '0', true, false, 35),
    (p_org_id, 'arrivals_supplier', 'supplier_rate', 'Purchase Rate ($)', 'number', '0', true, false, 36),
    (p_org_id, 'arrivals_supplier', 'less_percent', 'Less %', 'number', '0', true, false, 37),
    (p_org_id, 'arrivals_supplier', 'packing_cost', 'Packing Cost', 'number', '0', true, false, 38),
    (p_org_id, 'arrivals_supplier', 'loading_cost', 'Loading Cost', 'number', '0', true, false, 39),
    (p_org_id, 'arrivals_supplier', 'advance', 'Advance', 'number', '0', true, false, 40),

    -- 3. SALES & BILLING
    (p_org_id, 'sales', 'sale_date', 'Sale Date', 'date', NULL, true, true, 1),
    (p_org_id, 'sales', 'buyer_id', 'Buyer / Party', 'select', NULL, true, true, 2),
    (p_org_id, 'sales', 'payment_mode', 'Payment Mode', 'select', 'credit', true, true, 3),
    (p_org_id, 'sales', 'item_id', 'Sale Item', 'select', NULL, true, true, 10),
    (p_org_id, 'sales', 'lot_id', 'Stock Lot', 'select', NULL, true, true, 11),
    (p_org_id, 'sales', 'qty', 'Sales Quantity', 'number', '0', true, true, 12),
    (p_org_id, 'sales', 'rate', 'Sale Rate', 'number', '0', true, true, 13),
    (p_org_id, 'sales', 'amount', 'Calculated Amount', 'number', '0', true, false, 14),

    -- 4. CONTACTS
    (p_org_id, 'contacts', 'type', 'Relationship Type', 'select', 'farmer', true, true, 1),
    (p_org_id, 'contacts', 'name', 'Partner Name', 'text', NULL, true, true, 2),
    (p_org_id, 'contacts', 'phone', 'Mobile Number', 'text', NULL, true, false, 3),
    (p_org_id, 'contacts', 'city', 'City / Village', 'text', NULL, true, false, 4),
    (p_org_id, 'contacts', 'address', 'Detailed Address', 'text', NULL, true, false, 5),

    -- 5. INVENTORY (Items)
    (p_org_id, 'inventory', 'name', 'Commodity Name', 'text', NULL, true, true, 1),
    (p_org_id, 'inventory', 'default_unit', 'Standard Unit', 'select', 'Box', true, true, 2),
    (p_org_id, 'inventory', 'category', 'Item Category', 'text', NULL, true, false, 3),
    (p_org_id, 'inventory', 'hsn_code', 'HSN / Tax Code', 'text', NULL, true, false, 4),

    -- 6. EXPENSES
    (p_org_id, 'expenses', 'expense_date', 'Expense Date', 'date', NULL, true, true, 1),
    (p_org_id, 'expenses', 'category', 'Expense Category', 'select', 'General', true, true, 2),
    (p_org_id, 'expenses', 'amount', 'Total Amount', 'number', '0', true, true, 3),
    (p_org_id, 'expenses', 'narration', 'Narration / Notes', 'text', NULL, true, false, 4),

    -- 7. VOUCHER PAYMENTS
    (p_org_id, 'payments', 'payment_date', 'Payment Date', 'date', NULL, true, true, 1),
    (p_org_id, 'payments', 'contact_id', 'Payee / Party', 'select', NULL, true, true, 2),
    (p_org_id, 'payments', 'amount', 'Amount Paid', 'number', '0', true, true, 3),
    (p_org_id, 'payments', 'payment_mode', 'Payment Mode', 'select', 'cash', true, true, 4),
    (p_org_id, 'payments', 'remarks', 'Remarks / Narration', 'text', NULL, true, false, 5),

    -- 8. ACCOUNTS & BALANCES
    (p_org_id, 'accounts', 'amount', 'Opening Balance', 'number', '0', true, true, 1),
    (p_org_id, 'accounts', 'type', 'Balance Type (Dr/Cr)', 'select', 'debit', true, true, 2)

  ON CONFLICT (organization_id, module_id, field_key) DO UPDATE
  SET 
    label = EXCLUDED.label,
    field_type = EXCLUDED.field_type,
    display_order = EXCLUDED.display_order;
END;
$$ LANGUAGE plpgsql;
