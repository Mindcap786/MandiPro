"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, Package, BarChart3, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { useLanguage } from "../../components/i18n/language-provider";

/**
 * MobileBottomNav — Vyapar-inspired native green bottom navigation.
 * 
 * Design tokens:
 *   Active:   text-[#1A6B3C] + 2px top green indicator
 *   Inactive: text-gray-400
 *   BG:       white #FFFFFF
 *   Shadow:   shadow-[0_-1px_0_rgba(0,0,0,0.08)]
 * 
 * Tabs: Home | Stock | [FAB placeholder] | Finance | More
 */
export function MobileBottomNav() {
    const pathname = usePathname();
    const { t } = useLanguage();
    const [moreOpen, setMoreOpen] = useState(false);

    if (pathname === "/login") return null;

    const isActive = (path: string) =>
        pathname === path || pathname.startsWith(path + "/");

    const NAV_ITEMS = [
        { href: "/dashboard", icon: Home,      label: t("nav.home") !== "nav.home" ? t("nav.home") : "Home" },
        { href: "/stock",     icon: Package,   label: t("nav.stock") !== "nav.stock" ? t("nav.stock") : "Stock" },
        { href: "/finance",   icon: BarChart3, label: t("nav.finance") !== "nav.finance" ? t("nav.finance") : "Finance" },
    ];

    return (
        <nav
            className={cn(
                "mobile-bottom-nav",
                "fixed bottom-0 left-0 right-0 z-[100]",
                "bg-white border-t border-[#E5E7EB]",
                "shadow-[0_-1px_0_rgba(0,0,0,0.08)]",
                "pb-[env(safe-area-inset-bottom)]",
                "flex items-stretch print:hidden"
            )}
            style={{ height: "calc(60px + env(safe-area-inset-bottom))" }}
        >
            {/* Left 2 tabs */}
            {NAV_ITEMS.slice(0, 2).map((item) => (
                <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(item.href)}
                />
            ))}

            {/* Center FAB placeholder spacer — the actual FAB is rendered in layout.tsx */}
            <div className="flex-1 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full border-4 border-[#EFEFEF] bg-[#EFEFEF]" />
            </div>

            {/* Right: Finance tab */}
            <NavItem
                href={NAV_ITEMS[2].href}
                icon={NAV_ITEMS[2].icon}
                label={NAV_ITEMS[2].label}
                active={isActive(NAV_ITEMS[2].href)}
            />

            {/* More — opens full Sidebar as a side sheet */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                    <button
                        type="button"
                        data-active={moreOpen ? "true" : "false"}
                        className={cn(
                            "mobile-nav-item flex-1 flex flex-col items-center justify-center",
                            "relative transition-all duration-200 min-h-[44px]",
                            "active:scale-95",
                            moreOpen ? "text-[#1A6B3C]" : "text-gray-400"
                        )}
                        style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                        {moreOpen && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[#1A6B3C] rounded-b-full" />
                        )}
                        <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
                            moreOpen ? "bg-[#1A6B3C]/10" : "bg-transparent"
                        )}>
                            <MoreHorizontal
                                className="w-6 h-6"
                                strokeWidth={moreOpen ? 2.5 : 1.7}
                            />
                        </div>
                        <span className="text-[10px] font-medium leading-tight mt-0.5">More</span>
                    </button>
                </SheetTrigger>
                <SheetContent
                    side="right"
                    className="!z-[200] p-0 w-[85vw] max-w-[340px] border-l-0 overflow-y-auto bg-[#E9F5D1]"
                    onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("a")) setMoreOpen(false);
                    }}
                >
                    <Sidebar />
                </SheetContent>
            </Sheet>
        </nav>
    );
}

// ── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
    href,
    icon: Icon,
    label,
    active,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            prefetch={true}
            scroll={false}
            href={href}
            data-active={active ? "true" : "false"}
            className={cn(
                "mobile-nav-item flex-1 flex flex-col items-center justify-center",
                "relative transition-all duration-200 min-h-[44px]",
                "active:scale-95",
                active ? "text-[#1A6B3C]" : "text-gray-400"
            )}
            style={{ WebkitTapHighlightColor: "transparent" }}
        >
            {/* Top indicator */}
            {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[#1A6B3C] rounded-b-full" />
            )}

            {/* Icon container */}
            <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
                active ? "bg-[#1A6B3C]/10" : "bg-transparent"
            )}>
                <Icon
                    className="w-6 h-6 transition-all duration-200"
                    strokeWidth={active ? 2.5 : 1.7}
                />
            </div>

            {/* Label */}
            <span className={cn(
                "text-[10px] font-medium leading-tight mt-0.5 transition-all duration-200",
                active ? "font-semibold" : ""
            )}>
                {label}
            </span>
        </Link>
    );
}
