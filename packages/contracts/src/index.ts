/**
 * packages/contracts/src/index.ts
 *
 * Domain DTOs — the single source of truth for data shapes
 * shared between web (Next.js) and mobile (React Native).
 * 
 * Rule: NO runtime code here. Only TypeScript interfaces and type aliases.
 * Business logic lives in packages/domain.
 */

// ── Auth / Identity ──────────────────────────────────────────────────────────

export interface UserProfile {
    id: string
    organization_id: string
    role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer' | 'super_admin'
    full_name: string | null
    business_domain: 'mandi' | 'wholesaler'
    organization: Organization
}

export interface Organization {
    id: string
    name: string
    subscription_tier: string
    status: 'trial' | 'active' | 'grace_period' | 'suspended' | 'expired'
    trial_ends_at: string | null
    brand_color?: string | null
    logo_url?: string | null
    gstin?: string | null
    address?: string | null
    phone?: string | null
}

// ── Arrivals ─────────────────────────────────────────────────────────────────

export type ArrivalType = 'commission_farmer' | 'commission_supplier' | 'direct_purchase'

export interface Arrival {
    id: string
    organization_id: string
    arrival_date: string           // ISO date YYYY-MM-DD
    party_id: string
    commodity_id: string
    arrival_type: ArrivalType
    lot_prefix: string
    num_lots: number
    bags_per_lot: number
    gross_qty: number
    less_percent: number
    less_units: number
    net_qty: number
    grade: string | null
    commission_percent: number
    transport_amount: number
    loading_amount: number
    packing_amount: number
    advance_amount: number
    misc_expenses: MiscExpense[]
    status: 'draft' | 'active' | 'partial' | 'completed' | 'cancelled'
    gate_entry_id: string | null
    notes: string | null
    created_at: string
    // Joined
    party?: Contact
    commodity?: Commodity
    lots?: Lot[]
}

export interface CreateArrivalDTO {
    arrival_date: string
    party_id: string
    commodity_id: string
    arrival_type: ArrivalType
    lot_prefix: string
    num_lots: number
    bags_per_lot: number
    gross_qty: number
    less_percent?: number
    less_units?: number
    grade?: string | null
    commission_percent?: number
    transport_amount?: number
    loading_amount?: number
    packing_amount?: number
    advance_amount?: number
    misc_expenses?: MiscExpense[]
    gate_entry_id?: string | null
    notes?: string | null
}

export interface ArrivalListResponse {
    data: Arrival[]
    total: number
    page: number
    limit: number
}

export interface MiscExpense {
    label: string
    amount: number
}

// ── Lots ─────────────────────────────────────────────────────────────────────

export type LotStatus = 'available' | 'partial' | 'sold' | 'damaged' | 'cancelled'

export interface Lot {
    id: string
    arrival_id: string
    lot_code: string
    initial_qty: number
    current_qty: number
    unit: string
    grade: string | null
    status: LotStatus
    created_at: string
    commodity?: Commodity
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export type SaleStatus = 'draft' | 'confirmed' | 'invoiced' | 'paid' | 'cancelled'
export type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'udhaar'

export interface Sale {
    id: string
    organization_id: string
    sale_date: string
    invoice_no: string
    buyer_id: string
    status: SaleStatus
    subtotal: number
    discount_amount: number
    gst_amount: number
    total_amount: number
    paid_amount: number
    balance_due: number
    payment_mode: PaymentMode
    payment_status: 'unpaid' | 'partial' | 'paid'
    narration: string | null
    created_at: string
    // Joined
    buyer?: Contact
    items?: SaleItem[]
}

export interface SaleItem {
    id: string
    sale_id: string
    lot_id: string
    commodity_id: string
    quantity: number
    unit: string
    rate_per_unit: number
    gross_amount: number
    lot?: Lot
    commodity?: Commodity
}

// ── Payments ─────────────────────────────────────────────────────────────────

export type PaymentType = 'payment' | 'receipt'

export interface Payment {
    id: string
    organization_id: string
    payment_date: string
    payment_type: PaymentType
    party_id: string
    account_id: string
    amount: number
    payment_mode: Exclude<PaymentMode, 'udhaar'>
    reference_number: string | null
    cheque_id: string | null
    sale_id: string | null
    arrival_id: string | null
    narration: string | null
    idempotency_key: string
    created_at: string
    // Joined
    party?: Contact
    account?: Account
}

export interface CreatePaymentDTO {
    payment_date: string
    payment_type: PaymentType
    party_id: string
    account_id: string
    amount: number
    payment_mode: Exclude<PaymentMode, 'udhaar'>
    reference_number?: string
    cheque_id?: string
    sale_id?: string
    arrival_id?: string
    narration?: string
    idempotency_key: string          // REQUIRED — UUID v4 from client
}

// ── Cheques ───────────────────────────────────────────────────────────────────

export type ChequeStatus = 'pending' | 'presented' | 'cleared' | 'bounced' | 'cancelled'
export type ChequeType = 'issued' | 'received'

export interface Cheque {
    id: string
    organization_id: string
    cheque_number: string
    bank_name: string
    amount: number
    cheque_date: string
    cheque_type: ChequeType
    status: ChequeStatus
    cleared_date: string | null
    bounce_reason: string | null
    party_id: string
    payment_id: string | null
    created_at: string
    // Joined
    party?: Contact
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export type ContactType = 'buyer' | 'seller' | 'farmer' | 'supplier' | 'broker' | 'other'

export interface Contact {
    id: string
    organization_id: string
    name: string
    contact_type: ContactType
    phone: string | null
    address: string | null
    gstin: string | null
    opening_balance: number
    created_at: string
}

// ── Commodities ───────────────────────────────────────────────────────────────

export interface Commodity {
    id: string
    name: string
    default_unit: string
    shelf_life_days: number | null
    critical_age_days: number | null
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export interface Account {
    id: string
    name: string
    type: 'asset' | 'liability' | 'income' | 'expense' | 'equity'
    subtype: string | null
}

// ── Ledger ────────────────────────────────────────────────────────────────────

export interface LedgerEntry {
    id: string
    entry_date: string
    debit: number | null
    credit: number | null
    narration: string | null
    reference_type: string | null
    reference_id: string | null
    running_balance?: number         // computed by reports/ledger API
    account?: Account
}

export interface LedgerReportResponse {
    party: Contact | null
    date_from: string
    date_to: string
    opening_balance: number
    closing_balance: number
    entries: LedgerEntry[]
    count: number
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export interface StockSummary {
    commodity_id: string
    commodity_name: string
    total_lots: number
    available_lots: number
    total_qty: number
    aging_lots: number
    critical_lots: number
}

export interface StockResponse {
    lots: Lot[]
    summary: StockSummary[]
}

// ── Day Book ──────────────────────────────────────────────────────────────────

export interface DayBookTotals {
    total_debit: number
    total_credit: number
    net: number
}

export interface DayBookResponse {
    entries: LedgerEntry[]
    totals: DayBookTotals
    date_from: string
    date_to: string
    mode: 'cash' | 'bank' | 'all'
    count: number
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface OrgSettings {
    id: string
    name: string
    gstin: string | null
    address_line1: string | null
    address_line2: string | null
    settings: { mandi_license?: string } | null
    period_lock_enabled: boolean
    period_locked_until: string | null
    // mandi settings
    commission_rate_default: number
    market_fee_percent: number
    nirashrit_percent: number
    misc_fee_percent: number
    default_credit_days: number
    max_invoice_amount: number
    gst_enabled: boolean
    gst_type: 'intra' | 'inter'
    cgst_percent: number
    sgst_percent: number
    igst_percent: number
}

// ── TanStack Query Cache Keys ─────────────────────────────────────────────────
// Canonical query keys for consistent cache management across web and mobile.

export const QUERY_KEYS = {
    arrivals: {
        all: ['arrivals'] as const,
        list: (filters: Record<string, unknown>) => ['arrivals', 'list', filters] as const,
        detail: (id: string) => ['arrivals', 'detail', id] as const,
    },
    sales: {
        all: ['sales'] as const,
        list: (filters: Record<string, unknown>) => ['sales', 'list', filters] as const,
        detail: (id: string) => ['sales', 'detail', id] as const,
    },
    payments: {
        all: ['payments'] as const,
        list: (filters: Record<string, unknown>) => ['payments', 'list', filters] as const,
    },
    cheques: {
        all: ['cheques'] as const,
        list: (filters: Record<string, unknown>) => ['cheques', 'list', filters] as const,
    },
    stock: {
        all: ['stock'] as const,
        summary: ['stock', 'summary'] as const,
    },
    reports: {
        ledger: (partyId: string, from: string, to: string) => ['reports', 'ledger', partyId, from, to] as const,
        daybook: (date: string, mode: string) => ['reports', 'daybook', date, mode] as const,
        pnl: (from: string, to: string) => ['reports', 'pnl', from, to] as const,
    },
    settings: ['settings'] as const,
    fieldGovernance: (module: string) => ['field-governance', module] as const,
} as const
