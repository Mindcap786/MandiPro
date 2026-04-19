import { 
    LayoutDashboard, Truck, Gavel, Calculator, Settings, Menu, 
    FileText, Users, Package, ShieldCheck, LogOut, TrendingUp, 
    BookOpen, Wallet, Receipt, Scale, CreditCard, Sliders, 
    MessageCircle, BarChart3, Palette, Shield, ClipboardList, 
    FileInput, FileSignature, Warehouse, Tags, PieChart, 
    ChevronDown, ChevronRight, Store, RotateCcw, ClipboardCheck, 
    Briefcase, Database, Tag, QrCode, ShoppingCart, IndianRupee, Zap,
    Key, Ticket, ShieldAlert, Plus 
} from 'lucide-react'

export interface MenuItem {
    tKey: string;
    href?: string;
    icon: any;
    module?: string;
    permission?: string;
    domain?: string;
    sidebarHidden?: boolean;
    items?: MenuItem[];
}

export const NAV_ITEMS: MenuItem[] = [
    { tKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
        tKey: 'nav.purchase',
        icon: Receipt,
        module: 'mandi',
        items: [
            { tKey: 'nav.mandi_commission', href: '/mandi-commission', icon: Scale },
            { tKey: 'nav.gate_entry', href: '/gate', icon: Gavel },
            { tKey: 'nav.arrivals', href: '/arrivals', icon: Truck },
            { tKey: 'nav.purchase_bills', href: '/purchase/bills', icon: Receipt },
        ]
    },
    {
        tKey: 'nav.sales',
        icon: Calculator,
        module: 'mandi',
        items: [
            { tKey: 'nav.sale_invoice', href: '/sales', icon: FileInput },
            { tKey: 'nav.bulk_lot_sale', href: '/sales/new-invoice', icon: Zap },
        ]
    },
    {
        tKey: 'nav.inventory',
        icon: Package,
        module: 'mandi',
        items: [
            { tKey: 'nav.commodity_master', href: '/inventory/items', icon: Tag },
            { tKey: 'nav.stock_status', href: '/stock', icon: Package },
        ]
    },
    { tKey: 'nav.payments_receipts', href: '/finance/payments', icon: Wallet, module: 'finance' },
    { tKey: 'nav.trading_pl', href: '/reports/pl', icon: TrendingUp, module: 'mandi' },
    {
        tKey: 'nav.finance',
        icon: TrendingUp,
        module: 'finance',
        items: [
            { tKey: 'nav.finance_overview', href: '/finance', icon: PieChart },
            { tKey: 'nav.day_book', href: '/reports/daybook', icon: BookOpen },
            { tKey: 'nav.cheque_mgmt', href: '/finance/reconciliation', icon: CreditCard },
            { tKey: 'nav.gst_compliance', href: '/reports/gst', icon: ShieldCheck },
            { tKey: 'nav.balance_sheet', href: '/reports/balance-sheet', icon: Scale },
        ]
    },
    {
        tKey: 'nav.master_data',
        icon: Database,
        items: [
            { tKey: 'nav.customers_vendors', href: '/contacts', icon: Users },
            { tKey: 'nav.banks', href: '/settings/banks', icon: Wallet },
            { tKey: 'nav.employees', href: '/employees', icon: Briefcase },
        ]
    },
    {
        tKey: 'nav.quick_actions',
        icon: Zap,
        sidebarHidden: true,
        items: [
            { tKey: 'nav.quick_purchase', href: '/stock/quick-entry', icon: ShoppingCart },
            { tKey: 'nav.quick_sales', href: '/sales', icon: IndianRupee },
            { tKey: 'nav.pos', href: '/sales/pos', icon: Zap },
            { tKey: 'nav.returns', href: '/sales/return/new', icon: RotateCcw },
        ]
    },
    {
        tKey: 'nav.settings',
        icon: Settings,
        items: [
            { tKey: 'nav.general_settings', href: '/settings', icon: Settings },
            { tKey: 'nav.team_access', href: '/settings/team', icon: ShieldCheck },
            { tKey: 'nav.field_governance', href: '/settings/fields', icon: ShieldCheck },
            { tKey: 'nav.bank_details', href: '/settings/bank-details', icon: QrCode },
            { tKey: 'nav.branding', href: '/settings/branding', icon: Palette },
            { tKey: 'nav.subscription_billing', href: '/settings/billing', icon: CreditCard },
            { tKey: 'nav.compliance', href: '/settings/compliance', icon: Shield },
        ]
    }
]

export const ADMIN_NAV_ITEMS: MenuItem[] = [
    { tKey: 'nav.admin_dashboard', href: '/admin', icon: LayoutDashboard },
    { tKey: 'nav.tenants', href: '/admin/tenants', icon: Store },
    {
        tKey: 'nav.admin_billing',
        icon: CreditCard,
        items: [
            { tKey: 'nav.billing_overview', href: '/admin/billing', icon: PieChart },
            { tKey: 'nav.payment_gateways', href: '/admin/billing/gateways', icon: Key },
            { tKey: 'nav.coupons', href: '/admin/billing/coupons', icon: Ticket },
        ]
    },
    { tKey: 'nav.system_logs', href: '/admin/logs', icon: ClipboardList, sidebarHidden: true },
    { tKey: 'nav.access_control', href: '/admin/rbac', icon: ShieldAlert, sidebarHidden: true },
]

export function getAllMenuKeys(): string[] {
    const keys: string[] = [];
    const traverse = (items: MenuItem[]) => {
        items.forEach(item => {
            keys.push(item.tKey);
            if (item.items) traverse(item.items);
        });
    };
    traverse(NAV_ITEMS);
    return keys;
}
