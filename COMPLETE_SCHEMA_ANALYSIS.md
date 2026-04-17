# Complete Schema Analysis for Mandi Tables
## Comprehensive Column List from All Migrations

**Date Generated**: 15 April 2026  
**Scope**: All ALTER TABLE and CREATE TABLE statements found across `/Users/shauddin/Desktop/MandiPro/supabase/migrations/` directory

---

## 1. TABLE: `mandi.arrivals`

### Base Schema (from 20260228_init_dual_schemas.sql in web/supabase/migrations/)
- `id` - UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `organization_id` - UUID REFERENCES core.organizations(id) ON DELETE CASCADE
- `supplier_id` - UUID REFERENCES mandi.contacts(id)
- `arrival_type` - TEXT (e.g. 'commission', 'direct')
- `entry_date` - DATE NOT NULL
- `status` - TEXT

### Columns Added in Main Migrations

**20260402000000_finance_numbering_and_cheque_cleanup.sql**
- `contact_bill_no` - bigint (via ALTER TABLE mandi.arrivals ADD COLUMN IF NOT EXISTS contact_bill_no bigint;)
- `party_id` - uuid REFERENCES mandi.contacts(id) (added to mandi.vouchers, but not directly to arrivals)
- `account_id` - uuid REFERENCES mandi.accounts(id) (added to mandi.vouchers)
- `payment_mode` - text (added to mandi.vouchers)
- `bank_account_id` - uuid REFERENCES mandi.accounts(id) (added to mandi.vouchers)
- `reference_id` - uuid (added to mandi.vouchers)
- `cheque_status` - text (added to mandi.vouchers)
- `cleared_at` - timestamptz (added to mandi.vouchers)

**FROM 20260129_add_storage_location.sql (non-mandi schema but similar table)**
- `storage_location` - TEXT DEFAULT 'Mandi' (added to arrivals table)

### Complete Current Column List for mandi.arrivals:
1. `id` - UUID PK
2. `organization_id` - UUID
3. `supplier_id` - UUID
4. `arrival_type` - TEXT
5. `entry_date` - DATE
6. `status` - TEXT
7. `contact_bill_no` - bigint (NEW)
8. `storage_location` - TEXT (NEW, if applied)

---

## 2. TABLE: `mandi.lots`

### Base Schema
- `id` - UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `organization_id` - UUID REFERENCES core.organizations(id) ON DELETE CASCADE
- `arrival_id` - UUID REFERENCES mandi.arrivals(id)
- `commodity_id` - UUID REFERENCES mandi.commodities(id)
- `lot_code` - TEXT NOT NULL
- `gross_quantity` - NUMERIC
- `unit` - TEXT
- `supplier_rate` - NUMERIC
- `commission_percent` - NUMERIC
- `less_percent` - NUMERIC
- `status` - TEXT

### Columns Added in Main Migrations

**20260406130000_add_expense_tracking_to_lots.sql**
- `expense_paid_by_mandi` - NUMERIC DEFAULT 0
  - Comment: "Total expenses (transport, labor, packing, etc.) that mandi paid on behalf of farmer/supplier for this lot. Used in P&L calculation as deduction from profit."

**20260412_payment_modes_unified_logic.sql**
- `advance_cheque_status` - BOOLEAN DEFAULT false
- `recording_status` - TEXT DEFAULT 'recorded' CHECK (recording_status IN ('draft', 'recorded', 'settled'))

**FROM 20260129_add_storage_location.sql (historical ref)**
- `storage_location` - TEXT DEFAULT 'Mandi' (added to lots table)

### Complete Current Column List for mandi.lots:
1. `id` - UUID PK
2. `organization_id` - UUID
3. `arrival_id` - UUID
4. `commodity_id` - UUID
5. `lot_code` - TEXT
6. `gross_quantity` - NUMERIC
7. `unit` - TEXT
8. `supplier_rate` - NUMERIC
9. `commission_percent` - NUMERIC
10. `less_percent` - NUMERIC
11. `status` - TEXT
12. `storage_location` - TEXT (NEW)
13. `expense_paid_by_mandi` - NUMERIC (NEW)
14. `advance_cheque_status` - BOOLEAN (NEW)
15. `recording_status` - TEXT (NEW)

---

## 3. TABLE: `mandi.sales`

### Base Schema
- `id` - UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `organization_id` - UUID REFERENCES core.organizations(id) ON DELETE CASCADE
- `buyer_id` - UUID REFERENCES mandi.contacts(id)
- `sale_date` - DATE NOT NULL
- `payment_mode` - TEXT
- `total_amount` - NUMERIC
- `bill_no` - BIGINT
- `market_fee` - NUMERIC DEFAULT 0
- `nirashrit` - NUMERIC DEFAULT 0
- `misc_fee` - NUMERIC DEFAULT 0
- `loading_charges` - NUMERIC DEFAULT 0
- `unloading_charges` - NUMERIC DEFAULT 0
- `other_expenses` - NUMERIC DEFAULT 0
- `status` - TEXT
- `payment_status` - TEXT
- `created_at` - TIMESTAMP WITH TIME ZONE DEFAULT now()
- `idempotency_key` - UUID
- `due_date` - DATE

### Columns Added in Main Migrations

**20260317_update_confirm_sale_transaction.sql**
- `cheque_no` - TEXT
- `cheque_date` - DATE
- `is_cheque_cleared` - BOOLEAN DEFAULT false

**20260318_add_sales_schema_compatibility_columns.sql**
- `total_amount_inc_tax` - NUMERIC DEFAULT 0
- `buyer_gstin` - TEXT
- `cgst_amount` - NUMERIC DEFAULT 0
- `sgst_amount` - NUMERIC DEFAULT 0
- `igst_amount` - NUMERIC DEFAULT 0
- `gst_total` - NUMERIC DEFAULT 0
- `is_igst` - BOOLEAN DEFAULT false
- `place_of_supply` - TEXT
- `workflow_status` - TEXT

**20260402000000_finance_numbering_and_cheque_cleanup.sql**
- `contact_bill_no` - bigint

**20260405120000_add_discount_options.sql**
- `discount_percent` - numeric DEFAULT 0
- `discount_amount` - numeric DEFAULT 0

**20260412200000_add_amount_received_to_sales.sql**
- `amount_received` - NUMERIC DEFAULT 0

### Complete Current Column List for mandi.sales:
1. `id` - UUID PK
2. `organization_id` - UUID
3. `buyer_id` - UUID
4. `sale_date` - DATE
5. `payment_mode` - TEXT
6. `total_amount` - NUMERIC
7. `bill_no` - BIGINT
8. `market_fee` - NUMERIC
9. `nirashrit` - NUMERIC
10. `misc_fee` - NUMERIC
11. `loading_charges` - NUMERIC
12. `unloading_charges` - NUMERIC
13. `other_expenses` - NUMERIC
14. `status` - TEXT
15. `payment_status` - TEXT
16. `created_at` - TIMESTAMP WITH TIME ZONE
17. `idempotency_key` - UUID
18. `due_date` - DATE
19. `cheque_no` - TEXT (NEW)
20. `cheque_date` - DATE (NEW)
21. `is_cheque_cleared` - BOOLEAN (NEW)
22. `total_amount_inc_tax` - NUMERIC (NEW)
23. `buyer_gstin` - TEXT (NEW)
24. `cgst_amount` - NUMERIC (NEW)
25. `sgst_amount` - NUMERIC (NEW)
26. `igst_amount` - NUMERIC (NEW)
27. `gst_total` - NUMERIC (NEW)
28. `is_igst` - BOOLEAN (NEW)
29. `place_of_supply` - TEXT (NEW)
30. `workflow_status` - TEXT (NEW)
31. `contact_bill_no` - bigint (NEW)
32. `discount_percent` - numeric (NEW)
33. `discount_amount` - numeric (NEW)
34. `amount_received` - NUMERIC (NEW)

---

## 4. TABLE: `mandi.sale_items`

### Base Schema
- `id` - UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `organization_id` - UUID REFERENCES core.organizations(id) ON DELETE CASCADE
- `sale_id` - UUID REFERENCES mandi.sales(id) ON DELETE CASCADE
- `lot_id` - UUID REFERENCES mandi.lots(id)
- `quantity` - NUMERIC NOT NULL
- `rate` - NUMERIC NOT NULL
- `total_price` - NUMERIC NOT NULL

### Columns Added in Main Migrations

**20260318_add_sales_schema_compatibility_columns.sql**
- `qty` - NUMERIC
- `amount` - NUMERIC
- `unit` - TEXT
- `item_id` - UUID REFERENCES mandi.commodities(id)
- `gst_rate` - NUMERIC DEFAULT 0
- `tax_amount` - NUMERIC DEFAULT 0
- `hsn_code` - TEXT

**20260425_fix_lot_quantity_decrement.sql**
- `organization_id` - uuid (possibly redundant with base schema, but explicitly added)

### Complete Current Column List for mandi.sale_items:
1. `id` - UUID PK
2. `organization_id` - UUID
3. `sale_id` - UUID
4. `lot_id` - UUID
5. `quantity` - NUMERIC
6. `rate` - NUMERIC
7. `total_price` - NUMERIC
8. `qty` - NUMERIC (NEW - compatibility field)
9. `amount` - NUMERIC (NEW - compatibility field)
10. `unit` - TEXT (NEW)
11. `item_id` - UUID (NEW)
12. `gst_rate` - NUMERIC (NEW)
13. `tax_amount` - NUMERIC (NEW)
14. `hsn_code` - TEXT (NEW)

---

## 5. TABLE: `mandi.purchase_bills`

### Base Schema
- Created implicitly (not found in explicit CREATE TABLE statement in web/supabase/migrations/)
- Likely has: id, organization_id, and typical purchase fields

### Columns Added in Main Migrations

**20260406130000_add_expense_tracking_to_lots.sql**
- `commission_amount` - NUMERIC DEFAULT 0
  - Comment: "Commission kept by mandi (deducted from farmer payment). This is income to mandi, not a cost. Used in P&L as addition to profit."

### Complete Current Column List for mandi.purchase_bills:
1. `id` - (UUID, likely)
2. `organization_id` - (UUID, likely)
3. `commission_amount` - NUMERIC (NEW)
4. (Other fields unknown - table likely created elsewhere or via inheritance)

---

## Summary: Migration Files Affecting These Tables

| File | Tables Modified | Key Changes |
|------|-----------------|--------------|
| 20260317_update_confirm_sale_transaction.sql | mandi.sales, mandi.vouchers | Added cheque_no, cheque_date, is_cheque_cleared |
| 20260318_add_sales_schema_compatibility_columns.sql | mandi.sales, mandi.sale_items | Added GST, tax, and compatibility fields |
| 20260402000000_finance_numbering_and_cheque_cleanup.sql | mandi.sales, mandi.arrivals | Added contact_bill_no |
| 20260405120000_add_discount_options.sql | mandi.sales | Added discount_percent, discount_amount |
| 20260406130000_add_expense_tracking_to_lots.sql | mandi.lots, mandi.purchase_bills | Added expense tracking and commission columns |
| 20260412_payment_modes_unified_logic.sql | mandi.lots | Added advance_cheque_status, recording_status |
| 20260412200000_add_amount_received_to_sales.sql | mandi.sales | Added amount_received for payment tracking |
| 20260425_fix_lot_quantity_decrement.sql | mandi.sale_items | Added organization_id column |
| 20260129_add_storage_location.sql | arrivals, lots (non-mandi schema) | Added storage_location (may apply to mandi schema) |

---

## Notes

1. **Base Schema Source**: The CREATE TABLE statements for mandi.arrivals, mandi.lots, mandi.sales, and mandi.sale_items come from `/Users/shauddin/Desktop/MandiPro/web/supabase/migrations/20260228_init_dual_schemas.sql`

2. **mandi.purchase_bills**: The CREATE TABLE statement for this table was not found in the main migrations search. It likely exists in a different migration file or is created elsewhere.

3. **Column Proliferation**: The schema has grown significantly with numerous columns added across different migrations, particularly for:
   - GST/Tax tracking (cgst_amount, sgst_amount, igst_amount, gst_total, is_igst)
   - Cheque/Payment status (cheque_no, cheque_date, is_cheque_cleared, advance_cheque_status)
   - Financial tracking (amount_received, expense_paid_by_mandi, commission_amount)
   - Compatibility fields in sale_items (qty, amount for backward compatibility)

4. **Current Schema Status**: The tables currently have all columns from base schema PLUS all new columns added via migrations (if migrations have been applied to the database).

---

## Important: Column Name Inconsistencies

- **cheque_cleared vs is_cheque_cleared**: 
  - mandi.vouchers: `is_cleared` BOOLEAN DEFAULT false
  - mandi.sales: `is_cheque_cleared` BOOLEAN DEFAULT false
  
- **Redundant organization_id**:
  - Appears in base schema for all tables
  - Explicitly added again in 20260425_fix_lot_quantity_decrement.sql for sale_items (harmless with IF NOT EXISTS)

- **Quantity Fields in sale_items**:
  - `quantity` (base schema)
  - `qty` (added in 20260318, for compatibility)
  - Both exist and used interchangeably
