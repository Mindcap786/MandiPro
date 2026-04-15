"use client"

import { useAuth } from "@/components/auth/auth-provider"
import { NativeCard } from "@/components/mobile/NativeCard"
import {
    Gavel, Truck, Receipt as ReceiptIcon, ShoppingCart, IndianRupee,
    Zap, Store, RotateCcw, Users, Tractor, UserCheck, Briefcase, Tag,
    MapPin, Warehouse, Settings, Shield, Landmark, QrCode, Palette,
    CreditCard, ShieldCheck, Sliders, ChevronRight, BookOpen
} from "lucide-react"
import Link from "next/link"


export function NativeMenuApp() {
    const { profile } = useAuth()

    const MENU_SECTIONS = [
        {
            title: "Purchase",
            items: [
                { icon: Gavel,         label: "Gate Entry",          sub: "Record vehicle arrivals",   href: "/gate",                       color: "#7C3AED" },
                { icon: Truck,         label: "Inward / Arrivals",   sub: "Lot creation & weighing",   href: "/arrivals",                   color: "#2563EB" },
                { icon: ReceiptIcon,   label: "Purchase Bills",      sub: "Supplier invoices",          href: "/purchase/bills",             color: "#D97706" },
                { icon: ShoppingCart,  label: "Quick Consignment",   sub: "Fast stock entry",           href: "/stock/quick-entry",          color: "#16A34A" },
            ]
        },
        {
            title: "Sales",
            items: [
                { icon: IndianRupee,   label: "Sales",               sub: "View & create invoices",    href: "/sales",                      color: "#1A6B3C" },
                { icon: Zap,           label: "Bulk Lot Sale",       sub: "Multi-lot bulk entry",      href: "/sales/new-invoice",          color: "#0891B2" },
                { icon: Store,         label: "Point of Sale",       sub: "Quick counter sales",       href: "/sales/pos",                  color: "#7C3AED" },
                { icon: RotateCcw,     label: "Sales Returns",       sub: "Process return requests",   href: "/sales/returns",              color: "#DC2626" },
            ]
        },
        {
            title: "Transactions",
            items: [
                { icon: BookOpen,      label: "Day Book",            sub: "Today's all transactions",  href: "/reports/daybook",            color: "#1A6B3C" },
                { icon: Landmark,      label: "Payments",            sub: "Record & manage payments",  href: "/finance/payments",           color: "#2563EB" },
                { icon: ReceiptIcon,   label: "Receipts",            sub: "Customer collections",      href: "/receipts",                   color: "#7C3AED" },
                { icon: Users,         label: "Party Ledger",        sub: "Account statements",        href: "/reports/ledger",             color: "#0891B2" },
            ]
        },
        {
            title: "Settlements",
            items: [
                { icon: Users,         label: "Buyer Settlements",   sub: "Collect buyer payments",    href: "/finance/buyer-settlements",  color: "#2563EB" },
                { icon: Tag,           label: "Purchase Bills",      sub: "Pay supplier bills",        href: "/purchase/bills",             color: "#D97706" },
                { icon: Gavel,         label: "Cheque Management",   sub: "Track & clear cheques",     href: "/finance/reconciliation",     color: "#DC2626" },
                { icon: RotateCcw,     label: "Daily Rate Fixer",    sub: "Fix commodity rates",       href: "/finance/daily-rate-fixer",   color: "#F97316" },
                { icon: Tag,           label: "Payment Reminders",   sub: "Send outstanding alerts",   href: "/finance/reminders",          color: "#8B5CF6" },
            ]
        },
        {
            title: "Reports",
            items: [
                { icon: Zap,           label: "Finance Overview",    sub: "Balances & ledgers",        href: "/finance",                    color: "#1A6B3C" },
                { icon: ReceiptIcon,   label: "P&L Report",          sub: "Profit & Loss analysis",    href: "/reports/pl",                 color: "#16A34A" },
                { icon: ShoppingCart,  label: "Balance Sheet",       sub: "Assets & liabilities",      href: "/reports/balance-sheet",      color: "#2563EB" },
                { icon: IndianRupee,   label: "GST Report",          sub: "Tax calculations",          href: "/reports/gst",                color: "#DC2626" },
                { icon: Store,         label: "Margin Report",       sub: "Commodity wise margins",    href: "/reports/margins",            color: "#7C3AED" },
                { icon: Truck,         label: "Stock Report",        sub: "Inventory analysis",        href: "/reports/stock",              color: "#D97706" },
                { icon: RotateCcw,     label: "Price Forecast",      sub: "Rate trend prediction",     href: "/reports/price-forecast",     color: "#0891B2" },
                { icon: ReceiptIcon,   label: "Patti Voucher",       sub: "Print commission vouchers", href: "/finance/patti/new",          color: "#6B7280" },
            ]
        },
        {
            title: "Master Data",
            items: [
                { icon: Users,         label: "Contacts",            sub: "All parties & vendors",     href: "/contacts",                   color: "#1A6B3C" },
                { icon: UserCheck,     label: "Buyers",              sub: "Buyer accounts",            href: "/buyers",                     color: "#2563EB" },
                { icon: Briefcase,     label: "Employees",           sub: "Staff management",          href: "/employees",                  color: "#7C3AED" },
                { icon: Tag,           label: "Commodities",         sub: "Item / product master",     href: "/inventory/items",            color: "#D97706" },
                { icon: MapPin,        label: "Storage Map",         sub: "Lot & bin locations",       href: "/inventory/storage-map",      color: "#0891B2" },
                { icon: Warehouse,     label: "Warehouse",           sub: "Warehouse management",      href: "/warehouse",                  color: "#6B7280" },
            ]
        },
        {
            title: "Settings",
            items: [
                { icon: Settings,      label: "General Settings",    sub: "App configuration",         href: "/settings",                   color: "#6B7280" },
                { icon: Shield,        label: "Team Access",         sub: "Roles & permissions",       href: "/settings/team",              color: "#7C3AED" },
                { icon: Landmark,      label: "Bank Accounts",       sub: "Linked banks & UPI",        href: "/settings/banks",             color: "#2563EB" },
                { icon: QrCode,        label: "Bank Details / QR",   sub: "Payment QR codes",          href: "/settings/bank-details",      color: "#16A34A" },
                { icon: Palette,       label: "Branding",            sub: "Logo & brand colors",       href: "/settings/branding",          color: "#D97706" },
                { icon: CreditCard,    label: "Subscription",        sub: "Plan & billing",            href: "/settings/billing",           color: "#DC2626" },
                { icon: ShieldCheck,   label: "Compliance",          sub: "GST & regulatory",          href: "/settings/compliance",        color: "#6B7280" },
                { icon: Sliders,       label: "Field Governance",    sub: "Custom field rules",        href: "/settings/fields",            color: "#0891B2" },
            ]
        },
    ]

    return (
        <div className="bg-[#F2F2F7] min-h-dvh pb-28 pt-4">
            {MENU_SECTIONS.map(section => (
                <div key={section.title} className="px-4 pt-1 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2 px-0.5">
                        {section.title}
                    </p>
                    <NativeCard divided>
                        {section.items.map(item => (
                            <Link key={item.href} href={item.href} className="block">
                                <div className="flex items-center gap-3 px-4 py-3.5 active:bg-[#F2F2F7] transition-colors">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: `${item.color}18` }}
                                    >
                                        <item.icon className="w-5 h-5" style={{ color: item.color }} strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-[#1A1A2E]">{item.label}</p>
                                        <p className="text-xs text-[#9CA3AF] mt-0.5">{item.sub}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-[#D1D5DB] flex-shrink-0" />
                                </div>
                            </Link>
                        ))}
                    </NativeCard>
                </div>
            ))}
        </div>
    )
}
