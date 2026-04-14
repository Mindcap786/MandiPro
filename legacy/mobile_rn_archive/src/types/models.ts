/**
 * Core domain types — mirrors the web app's interfaces exactly.
 */

// ─── Auth & Profile ──────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  subscription_tier: string;
  status: 'trial' | 'active' | 'grace_period' | 'suspended' | 'expired';
  trial_ends_at: string | null;
  is_active?: boolean;
  enabled_modules?: string[];
  brand_color?: string;
  brand_color_secondary?: string;
  logo_url?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  phone?: string;
  settings?: Record<string, unknown>;
  max_web_users?: number;
  max_mobile_users?: number;
  currency_code?: string;
  locale?: string;
  timezone?: string;
  market_fee_percent?: number;
  nirashrit_percent?: number;
  misc_fee_percent?: number;
  rbac_matrix?: Record<string, unknown>;
}

export interface Profile {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  username?: string | null;
  business_domain: 'mandi' | 'wholesaler';
  rbac_matrix?: Record<string, unknown>;
  session_version?: number;
  is_active?: boolean;
  admin_status?: 'active' | 'suspended' | 'locked';
  organization: Organization;
}

export type UserRole =
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'operator'
  | 'viewer'
  | 'admin'
  | 'super_admin'
  | 'tenant_admin'
  | 'member'
  | 'company_admin';

// ─── Mandi Domain ────────────────────────────────────────────

export interface Commodity {
  id: string;
  organization_id: string;
  name: string;
  local_name?: string;
  default_unit: string;
  shelf_life_days?: number;
  critical_age_days?: number;
}

export interface Contact {
  id: string;
  organization_id: string;
  name: string;
  contact_type: 'farmer' | 'buyer' | 'supplier' | 'transporter';
  phone?: string;
  email?: string;
  mandi_license_no?: string;
  bank_details?: Record<string, unknown>;
  is_active?: boolean;
}

export interface Lot {
  id: string;
  organization_id: string;
  lot_code: string;
  arrival_id?: string;
  item_id: string;
  contact_id?: string;
  initial_qty: number;
  current_qty: number;
  unit: string;
  unit_weight?: number;
  variety?: string;
  grade?: string;
  supplier_rate?: number;
  sale_price?: number;
  wholesale_price?: number;
  less_percent?: number;
  commission_percent?: number;
  status: 'active' | 'sold' | 'damaged';
  storage_location?: string;
  barcode?: string;
}

export interface Sale {
  id: string;
  organization_id: string;
  sale_date: string;
  buyer_id: string;
  payment_mode: 'cash' | 'credit' | 'cheque';
  total_qty: number;
  total_amount: number;
  discount_amount?: number;
  total_amount_inc_tax?: number;
  gst_amount?: number;
  notes?: string;
  status: 'draft' | 'confirmed' | 'invoiced';
}

export interface SaleItem {
  id: string;
  sale_id: string;
  lot_id: string;
  quantity: number;
  rate: number;
  total_price: number;
}

export interface Arrival {
  id: string;
  organization_id: string;
  arrival_date: string;
  bill_no?: number;
  arrival_type: 'direct' | 'farmer' | 'supplier';
  party_id?: string;
  reference_no?: string;
  vehicle_number?: string;
  status: 'draft' | 'confirmed' | 'completed';
}

// ─── Finance ─────────────────────────────────────────────────

export interface Account {
  id: string;
  organization_id: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  account_sub_type?: string;
  code?: string;
  opening_balance?: number;
  is_system: boolean;
  is_active: boolean;
}

export interface Voucher {
  id: string;
  organization_id: string;
  type: 'debit' | 'credit' | 'journal' | 'payment' | 'receipt';
  date: string;
  voucher_no: number;
  amount: number;
  discount_amount?: number;
  narration?: string;
  invoice_id?: string;
  is_locked: boolean;
}

export interface LedgerEntry {
  id: string;
  organization_id: string;
  account_id: string;
  contact_id?: string;
  debit: number;
  credit: number;
  entry_date: string;
  voucher_id?: string;
  transaction_type?: string;
  reference_no?: string;
  narration?: string;
}

// ─── Billing ─────────────────────────────────────────────────

export interface AppPlan {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  price_monthly: number;
  price_yearly: number;
  max_total_users: number;
  max_web_users: number;
  max_mobile_users: number;
  enabled_modules?: string[];
  is_active: boolean;
  sort_order: number;
}
