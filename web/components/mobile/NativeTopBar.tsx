"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertBell } from "@/components/alerts/AlertBell";

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

// Route → display title mapping  
const ROUTE_TITLES: Record<string, string> = {
    "/dashboard":               "Home",
    "/gate":                    "Gate Entry",
    "/gate-logs":               "Gate Logs",
    "/gate/[id]":               "Gate Detail",
    "/arrivals":                "Inward Entry",
    "/purchase/bills":          "Purchase Bills",
    "/purchase/invoices":       "Purchase Invoices",
    "/stock/quick-entry":       "Quick Consignment",
    "/sales":                   "Sales",
    "/sales/new":               "New Sale",
    "/sales/new-invoice":       "Bulk Lot Sale",
    "/sales/pos":               "Point of Sale",
    "/sales/returns":           "Sales Returns",
    "/sales/return/new":        "New Return",
    "/stock":                   "Stock",
    "/inventory/items":         "Commodities",
    "/inventory/storage-map":   "Storage Map",
    "/finance":                 "Finance",
    "/finance/payments":        "Payments",
    "/finance/reconciliation":  "Cheque Mgmt",
    "/finance/purchase-bills":  "Payable Bills",
    "/finance/buyer-settlements":  "Buyer Settlements",
    "/finance/daily-rate-fixer": "Rate Fixer",
    "/finance/reminders":       "Reminders",
    "/finance/patti/new":       "Patti Voucher",
    "/receipts":                "Receipts",
    "/reports/pl":              "P&L Report",
    "/reports/daybook":         "Day Book",
    "/reports/gst":             "GST Report",
    "/reports/balance-sheet":   "Balance Sheet",
    "/reports/ledger":          "Ledger",
    "/reports/margins":         "Margin Report",
    "/reports/stock":           "Stock Report",
    "/reports/price-forecast":  "Price Forecast",
    "/contacts":                "Contacts",
    "/buyers":                  "Buyers",
    "/employees":               "Employees",
    "/ledgers":                 "Ledgers",
    "/warehouse":               "Warehouse",
    "/field-manager":           "Field Manager",
    "/accounting":              "Accounting",
    "/settings":                "Settings",
    "/settings/billing":        "Subscription",
    "/settings/branding":       "Branding",
    "/settings/banks":          "Bank Accounts",
    "/settings/bank-details":   "Bank Details",
    "/settings/team":           "Team Access",
    "/settings/fields":         "Field Governance",
    "/settings/compliance":     "Compliance",
    "/settings/feature-flags":  "Feature Flags",
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

    const resolvedTitle = title || ROUTE_TITLES[pathname] || "MandiGrow";
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
