-- ============================================================================
-- Phase 1: Comprehensive Performance Indexes
-- Zero-risk additive migration — no data changes, no schema changes
-- Targets: All organization_id FK columns, hot query paths, composite filters
-- ============================================================================

-- ────────────────────────────────────────
-- CORE SCHEMA INDEXES
-- ────────────────────────────────────────

-- core.profiles — login, auth, permission lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_org_id
    ON core.profiles (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role
    ON core.profiles (organization_id, role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_active
    ON core.profiles (organization_id, is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email
    ON core.profiles (email);

-- core.ledger — financial queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_core_ledger_org_date
    ON core.ledger (organization_id, entry_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_core_ledger_org_account
    ON core.ledger (organization_id, account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_core_ledger_org_contact
    ON core.ledger (organization_id, contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_core_ledger_org_domain
    ON core.ledger (organization_id, domain);

-- core.accounts — chart of accounts lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_core_accounts_org
    ON core.accounts (organization_id);

-- core.subscriptions — subscription lifecycle queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_org
    ON core.subscriptions (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_status
    ON core.subscriptions (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_org_status
    ON core.subscriptions (organization_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_next_invoice
    ON core.subscriptions (next_invoice_date)
    WHERE status IN ('active', 'trial');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_period_end
    ON core.subscriptions (current_period_end)
    WHERE status IN ('active', 'trial', 'grace_period');

-- core.system_alerts — alert queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_alerts_org
    ON core.system_alerts (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_alerts_org_resolved
    ON core.system_alerts (organization_id, resolved_at)
    WHERE resolved_at IS NULL;

-- core.billing_events — billing audit trail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_events_org
    ON core.billing_events (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_events_org_type
    ON core.billing_events (organization_id, event_type);

-- core.payment_attempts — payment history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_attempts_org
    ON core.payment_attempts (organization_id);

-- core.saas_invoices — invoice queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saas_invoices_org
    ON core.saas_invoices (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saas_invoices_org_status
    ON core.saas_invoices (organization_id, status);

-- core.app_plans — plan lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_plans_active
    ON core.app_plans (is_active, sort_order);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_plans_name
    ON core.app_plans (name);

-- core.admin_permissions — RBAC lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_permissions_profile
    ON core.admin_permissions (profile_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_permissions_resource
    ON core.admin_permissions (profile_id, resource);

-- core.admin_audit_logs — audit queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_logs_admin
    ON core.admin_audit_logs (admin_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_logs_created
    ON core.admin_audit_logs (created_at DESC);

-- core.support_tickets — helpdesk queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_org
    ON core.support_tickets (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_status
    ON core.support_tickets (status);

-- core.subscription_coupons — coupon validation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coupons_code
    ON core.subscription_coupons (code)
    WHERE is_active = true;

-- ────────────────────────────────────────
-- MANDI SCHEMA INDEXES
-- ────────────────────────────────────────

-- mandi.commodities — item catalog
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_commodities_org
    ON mandi.commodities (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_commodities_org_name
    ON mandi.commodities (organization_id, name);

-- mandi.contacts — farmer/buyer/agent lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_contacts_org
    ON mandi.contacts (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_contacts_org_type
    ON mandi.contacts (organization_id, contact_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_contacts_org_name
    ON mandi.contacts (organization_id, name);

-- mandi.arrivals — gate entry, arrival tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_arrivals_org
    ON mandi.arrivals (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_arrivals_org_date
    ON mandi.arrivals (organization_id, entry_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_arrivals_org_status
    ON mandi.arrivals (organization_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_arrivals_supplier
    ON mandi.arrivals (organization_id, supplier_id);

-- mandi.lots — stock management (heaviest table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_lots_org
    ON mandi.lots (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_lots_org_status
    ON mandi.lots (organization_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_lots_arrival
    ON mandi.lots (arrival_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_lots_commodity
    ON mandi.lots (organization_id, commodity_id);

-- mandi.sales — transaction hub
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_org
    ON mandi.sales (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_org_date
    ON mandi.sales (organization_id, sale_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_org_status
    ON mandi.sales (organization_id, payment_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_buyer
    ON mandi.sales (organization_id, buyer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_billno
    ON mandi.sales (organization_id, bill_no);

-- mandi.sale_items — line items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sale_items_sale
    ON mandi.sale_items (sale_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sale_items_org
    ON mandi.sale_items (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sale_items_lot
    ON mandi.sale_items (lot_id);

-- mandi.employees — team management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_employees_org
    ON mandi.employees (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_employees_org_status
    ON mandi.employees (organization_id, status);

-- mandi.ledger_entries — financial core
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_org
    ON mandi.ledger_entries (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_org_date
    ON mandi.ledger_entries (organization_id, entry_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_org_account
    ON mandi.ledger_entries (organization_id, account_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_org_contact
    ON mandi.ledger_entries (organization_id, contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_org_status
    ON mandi.ledger_entries (organization_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_ref
    ON mandi.ledger_entries (reference_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_ledger_entries_voucher
    ON mandi.ledger_entries (voucher_id);

-- mandi.vouchers — accounting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_vouchers_org
    ON mandi.vouchers (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_vouchers_org_date
    ON mandi.vouchers (organization_id, voucher_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_vouchers_org_type
    ON mandi.vouchers (organization_id, voucher_type);

-- mandi.sale_returns — return tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sale_returns_org
    ON mandi.sale_returns (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sale_returns_sale
    ON mandi.sale_returns (sale_id);

-- mandi.sales_orders — order management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_orders_org
    ON mandi.sales_orders (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_sales_orders_org_status
    ON mandi.sales_orders (organization_id, status);

-- mandi.delivery_challans — delivery tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_delivery_challans_org
    ON mandi.delivery_challans (organization_id);

-- mandi.account_daily_balances — dashboard rollups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_adb_org_date
    ON mandi.account_daily_balances (organization_id, summary_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_adb_account_date
    ON mandi.account_daily_balances (account_id, summary_date DESC);

-- mandi.party_daily_balances — party balance rollups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_pdb_org_date
    ON mandi.party_daily_balances (organization_id, summary_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_pdb_contact_date
    ON mandi.party_daily_balances (contact_id, summary_date DESC);

-- mandi.stock_ledger — inventory movements
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_stock_ledger_org
    ON mandi.stock_ledger (organization_id);

-- mandi.contact_bill_sequences — bill numbering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mandi_bill_seq_org_contact
    ON mandi.contact_bill_sequences (organization_id, contact_id);

-- ────────────────────────────────────────
-- PUBLIC SCHEMA INDEXES (legacy tables still in use)
-- ────────────────────────────────────────

-- public.organizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_organizations_status
    ON public.organizations (status);

-- public.profiles
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_profiles_org
    ON public.profiles (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_profiles_email
    ON public.profiles (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_profiles_username
    ON public.profiles (username);

-- public.contacts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_contacts_org
    ON public.contacts (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_contacts_org_type
    ON public.contacts (organization_id, type);

-- public.items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_items_org
    ON public.items (organization_id);

-- public.lots
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_lots_org
    ON public.lots (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_lots_org_status
    ON public.lots (organization_id, status);

-- public.sales
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_sales_org
    ON public.sales (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_sales_org_date
    ON public.sales (organization_id, sale_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_sales_org_payment
    ON public.sales (organization_id, payment_status);

-- public.sale_items
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_sale_items_sale
    ON public.sale_items (sale_id);

-- public.arrivals
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_arrivals_org
    ON public.arrivals (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_arrivals_org_date
    ON public.arrivals (organization_id, entry_date DESC);

-- public.ledger_entries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_ledger_entries_org
    ON public.ledger_entries (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_ledger_entries_org_date
    ON public.ledger_entries (organization_id, entry_date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_ledger_entries_ref
    ON public.ledger_entries (reference_id);

-- public.vouchers
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_vouchers_org
    ON public.vouchers (organization_id);

-- public.quotations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_quotations_org
    ON public.quotations (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_quotations_org_status
    ON public.quotations (organization_id, status);

-- public.purchase_orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_po_org
    ON public.purchase_orders (organization_id);

-- public.purchase_invoices
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_pi_org
    ON public.purchase_invoices (organization_id);

-- public.damages
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_damages_org
    ON public.damages (organization_id);

-- public.purchase_returns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_purchase_returns_org
    ON public.purchase_returns (organization_id);

-- public.purchase_adjustments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_purchase_adjustments_org
    ON public.purchase_adjustments (organization_id);

-- public.accounts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pub_accounts_org
    ON public.accounts (organization_id);

-- ────────────────────────────────────────
-- WHOLESALE SCHEMA INDEXES
-- ────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_sku_master_org
    ON wholesale.sku_master (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_contacts_org
    ON wholesale.contacts (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_po_org
    ON wholesale.purchase_orders (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_inventory_org
    ON wholesale.inventory (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_invoices_org
    ON wholesale.invoices (organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ws_invoice_items_invoice
    ON wholesale.invoice_items (invoice_id);

-- ============================================================================
-- END OF PHASE 1: ~95 targeted indexes across all schemas
-- All using IF NOT EXISTS — completely safe to re-run
-- CONCURRENTLY — non-blocking, won't lock tables during creation
-- ============================================================================
