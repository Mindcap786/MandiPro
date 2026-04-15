"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, IndianRupee, Truck, Wallet, LayoutGrid } from "lucide-react";
import { useLanguage } from "../i18n/language-provider";
import { cn } from "@/lib/utils";

export function MobileNav() {
    const pathname = usePathname();
    const { t } = useLanguage();

    if (pathname === '/login') return null;

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

    const NAV_ITEMS = [
        { href: "/dashboard", icon: Home, label: t('nav.home') || 'Home' },
        { href: "/sales", icon: IndianRupee, label: t('nav.sales') || 'Sales' },
        { href: "/arrivals", icon: Truck, label: t('nav.inward') || 'Inward' },
        { href: "/finance", icon: Wallet, label: t('nav.money') || 'Finance' },
        { href: "/menu", icon: LayoutGrid, label: t('nav.menu') || 'Menu' },
    ];

    return (
        <nav className="mobile-nav-bar md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#050510]/90 backdrop-blur-2xl border-t border-white/5 pb-safe px-2 flex justify-around items-center h-20 print:hidden">
            {NAV_ITEMS.map((item) => (
                <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(item.href)}
                />
            ))}
        </nav>
    );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
    return (
        <Link
            prefetch={true}
            scroll={false}
            href={href}
            className={cn(
                "flex flex-col items-center justify-center h-full min-w-0 flex-1 relative transition-all duration-300",
                active ? "text-blue-400" : "text-gray-500 active:scale-95"
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
        >
            {/* Active Indicator Bar */}
            {active && (
                <div className="absolute top-0 w-8 h-1 bg-blue-500 rounded-b-full shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-in fade-in zoom-in duration-300" />
            )}

            <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center mb-1 transition-all duration-300",
                active ? "bg-blue-500/10 scale-110" : "bg-transparent"
            )}>
                <Icon
                    className={cn(
                        "w-6 h-6 transition-all duration-300",
                        active ? "text-blue-400" : "text-gray-500"
                    )}
                    strokeWidth={active ? 2.5 : 1.8}
                />
            </div>
            <span className={cn(
                "text-[10px] font-black uppercase tracking-[0.05em] transition-all duration-300",
                active ? "text-blue-400 opacity-100" : "text-gray-600 opacity-80"
            )}>
                {label}
            </span>
        </Link>
    );
}
