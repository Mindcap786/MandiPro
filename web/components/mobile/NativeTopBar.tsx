"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import { ChevronLeft, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertBell } from "@/components/alerts/AlertBell";
import { usePathname, useRouter } from "next/navigation";

/**
 * NativeTopBar
 * 
 * Fixed h-14 top bar — pure white, native-feeling.
 * - Root screens: shows hamburger (handled by BottomNav "More" tab)
 * - Nested screens: shows back chevron
 * - Center: screen title (single line, truncated)
 * - Right: up to 2 icon slots passed as children
 */
interface NativeTopBarProps {
    title?: string;
    showBack?: boolean;
    onBack?: () => void;
    rightActions?: React.ReactNode;
    className?: string;
    /** Override the background — e.g. transparent over a hero card */
    transparent?: boolean;
}

// Route → translation key mapping  
const ROUTE_TITLES: Record<string, string> = {
    "/dashboard":               "nav.dashboard",
    "/gate":                    "nav.gate_entry",
    "/gate-logs":               "nav.gate_logs",
    "/gate/[id]":               "nav.gate_detail",
    "/arrivals":                "nav.arrivals",
    "/purchase/bills":          "nav.purchase_bills",
    "/purchase/invoices":       "nav.purchase_invoices",
    "/stock/quick-entry":       "nav.quick_purchase",
    "/sales":                   "nav.sales",
    "/sales/new":               "actions.new_sale",
    "/sales/new-invoice":       "nav.new_invoice",
    "/sales/pos":               "nav.pos",
    "/sales/returns":           "nav.returns",
    "/sales/return/new":        "nav.returns",
    "/stock":                   "nav.inventory",
    "/inventory/items":         "nav.commodity_master",
    "/inventory/storage-map":   "nav.storage_map",
    "/finance":                 "nav.finance",
    "/finance/payments":        "nav.payments",
    "/finance/reconciliation":  "nav.cheque_mgmt",
    "/finance/purchase-bills":  "nav.purchase_bills",
    "/finance/buyer-settlements":  "nav.buyer_settlements",
    "/finance/daily-rate-fixer": "nav.rate_fixer",
    "/finance/reminders":       "nav.reminders",
    "/finance/patti/new":       "nav.patti_voucher",
    "/receipts":                "nav.receipts",
    "/reports/pl":              "nav.trading_pl",
    "/reports/daybook":         "nav.day_book",
    "/reports/gst":             "nav.gst_compliance",
    "/reports/balance-sheet":   "nav.balance_sheet",
    "/reports/ledger":          "nav.ledger",
    "/reports/margins":         "nav.margin_report",
    "/reports/stock":           "nav.stock_status",
    "/reports/price-forecast":  "nav.price_forecast",
    "/contacts":                "nav.contacts",
    "/buyers":                  "nav.customers_vendors",
    "/employees":               "nav.employees",
    "/ledgers":                 "nav.ledgers",
    "/warehouse":               "nav.warehouse",
    "/field-manager":           "nav.field_manager",
    "/accounting":              "nav.financials",
    "/settings":                "nav.settings",
    "/settings/billing":        "nav.subscription_billing",
    "/settings/branding":       "nav.branding",
    "/settings/banks":          "nav.banks",
    "/settings/bank-details":   "nav.bank_details",
    "/settings/team":           "nav.team_access",
    "/settings/fields":         "nav.field_governance",
    "/settings/compliance":     "nav.compliance",
    "/settings/feature-flags":  "nav.feature_flags",
};

// Root screens that get "Home" icon treatment (no back chevron)
const ROOT_SCREENS = ["/dashboard", "/stock", "/finance", "/sales"];

export function NativeTopBar({
    title,
    showBack,
    onBack,
    rightActions,
    className,
    transparent = false,
}: NativeTopBarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { t } = useLanguage();

    const tKey = title || ROUTE_TITLES[pathname];
    const resolvedTitle = tKey ? t(tKey) : "MandiGrow";

    const isRoot = ROOT_SCREENS.includes(pathname);
    const shouldShowBack = showBack !== undefined ? showBack : !isRoot;

    const handleBack = onBack || (() => router.back());

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-2",
                "pt-[env(safe-area-inset-top)]",
                transparent
                    ? "bg-transparent"
                    : "bg-white border-b border-[#E5E7EB]",
                className
            )}
            style={{ height: "calc(56px + env(safe-area-inset-top))" }}
        >
            {/* Left Action */}
            <div className="w-11 flex items-center justify-center">
                {shouldShowBack ? (
                    <button
                        onClick={handleBack}
                        className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors duration-100"
                        aria-label="Go back"
                    >
                        <ChevronLeft className="w-6 h-6 text-[#1A1A2E]" strokeWidth={2.5} />
                    </button>
                ) : (
                    <div className="w-11 h-11 flex items-center justify-center rounded-full">
                        <div className="w-6 h-6 rounded-full bg-[#1A6B3C] flex items-center justify-center">
                            <span className="text-white text-[9px] font-black">MG</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Center Title */}
            <h1 className="flex-1 text-center text-lg font-bold tracking-tight text-[#1A1A2E] truncate px-2">
                {resolvedTitle}
            </h1>

            {/* Right Actions */}
            <div className="w-11 flex items-center justify-end gap-1">
                {rightActions || <AlertBell />}
            </div>
        </header>
    );
}
