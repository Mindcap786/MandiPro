'use client'

import * as React from 'react'
import { useState, useEffect, useMemo, memo } from 'react'
import { LayoutDashboard, Truck, Gavel, Calculator, Settings, Menu, FileText, Users, Package, ShieldCheck, LogOut, TrendingUp, BookOpen, Wallet, Receipt, Scale, CreditCard, Sliders, MessageCircle, BarChart3, Palette, Shield, ClipboardList, FileInput, FileSignature, Warehouse, Tags, PieChart, ChevronDown, ChevronRight, Store, RotateCcw, ClipboardCheck, Briefcase, Database, Tag, QrCode } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth/auth-provider'

import { hasPermission, Permission } from '@/lib/rbac/definitions'
import { LanguageSwitcher } from '../i18n/language-switcher'
import { useLanguage } from '../i18n/language-provider'
import { usePermission } from '@/hooks/use-permission'

import { supabase } from '@/lib/supabaseClient'
import { NAV_ITEMS, ADMIN_NAV_ITEMS, MenuItem } from '@/lib/rbac/menus'

interface SidebarProps {
    onCollapseChange?: (collapsed: boolean) => void;
}

export const Sidebar = memo(function Sidebar({ onCollapseChange }: SidebarProps = {}) {
    const pathname = usePathname()
    const { profile, user, signOut, loading, isComplianceVisible: globalComplianceVisible } = useAuth()
    const [collapsed, setCollapsed] = useState(false)
    const { can, isImpersonating } = usePermission()
    const isSuperAdmin = profile?.role === 'super_admin' && !isImpersonating
    const { t, dir } = useLanguage()

    const handleCollapseToggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        onCollapseChange?.(next);
    };

    // High-Performance Visibility
    const isComplianceVisible = isSuperAdmin || globalComplianceVisible;

    if (pathname === '/login') return null

    const filterCompliance = (items: MenuItem[]) => {
        return items.map(item => {
            if (item.items) {
                return { ...item, items: item.items.filter(sub => {
                    if (sub.href === '/settings/compliance' && !isComplianceVisible && !isSuperAdmin) return false
                    return true
                })}
            }
            if (item.href === '/settings/compliance' && !isComplianceVisible && !isSuperAdmin) return null
            return item
        }).filter(Boolean) as MenuItem[]
    }

    const dashboardItems = useMemo(() => filterCompliance(NAV_ITEMS), [isComplianceVisible, isSuperAdmin])
    const adminItems = useMemo(() => filterCompliance(ADMIN_NAV_ITEMS), [isComplianceVisible, isSuperAdmin])

    const currentNavItems = pathname.startsWith('/admin') ? adminItems : dashboardItems

    return (
        <div 
            dir={dir}
            className={cn(
                "h-full w-full flex flex-col transition-all duration-300",
            )}
            style={{ backgroundColor: "#E9F5D1" }}
        >
            {/* Header */}
            <div className="p-6 flex items-center justify-between">
                {!collapsed && (
                    <div className="flex flex-col">
                        <span
                            suppressHydrationWarning
                            className="text-2xl font-black tracking-tighter uppercase leading-none"
                            style={{ color: profile?.organization?.brand_color || "black" }}
                        >
                            {profile?.organization?.name || (user?.email ? user.email.split('@')[0].replace(/[0-9]/g, ' $&').trim() : 'MandiGrow')}
                        </span>
                        
                        {/* User Email ID */}
                        <span className="text-[9px] text-slate-500 lowercase font-medium mt-1 truncate max-w-[180px]">
                            {user?.email}
                        </span>

                        <Link href="/settings/billing" className="hover:opacity-80 transition-opacity">
                            <span
                                suppressHydrationWarning
                                className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1 block"
                            >
                                {(() => {
                                    const tier = profile?.organization?.subscription_tier?.toLowerCase();
                                    const orgStatus = profile?.organization?.status;
                                    // Trial state
                                    if (!tier || orgStatus === 'trial' || (orgStatus as string) === 'trialing') {
                                        return `Free Trial ${t('nav.edition')}`;
                                    }
                                    // Admin-assigned custom/VIP plan — show "Custom Plan Edition"
                                    if (tier === 'vip_plan' || tier === 'vip') {
                                        return `Custom Plan ${t('nav.edition')}`;
                                    }
                                    // Standard plan name
                                    const planKey = `auth.plan_${tier}_name`;
                                    const planLabel = t(planKey);
                                    // If translation missing, format tier name cleanly
                                    const displayTier = (planLabel && planLabel !== planKey)
                                        ? planLabel
                                        : tier.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                                    return `${displayTier} ${t('nav.edition')}`;
                                })()}
                            </span>
                        </Link>
                    </div>
                )}
                <button
                    onClick={handleCollapseToggle}
                    className="p-2 hover:bg-black/5 rounded-lg text-slate-400 transition-colors"
                >
                    <Menu className="w-5 h-5 text-black" />
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                {/* HQ Portal shortcut - only shown if super_admin AND NOT impersonating */}
                {isSuperAdmin && (
                    <Link prefetch={true} scroll={false}
                        href="/admin"
                        className={cn(
                            "flex items-center px-4 py-3 rounded-xl transition-all group relative overflow-hidden mb-4 border border-indigo-100 bg-indigo-50 text-indigo-700",
                            pathname === '/admin' ? "bg-indigo-100/50 text-indigo-800 font-bold ring-1 ring-indigo-200" : "hover:bg-indigo-50"
                        )}
                    >
                        <ShieldCheck className={cn("w-5 h-5 relative z-10", collapsed ? "mx-auto" : (dir === 'rtl' ? "ml-3" : "mr-3") + " text-indigo-600")} />
                        {!collapsed && <span className="text-sm font-black tracking-widest relative z-10 uppercase">{t('nav.hq_portal')}</span>}
                    </Link>
                )}

                {/* Nav items */}
                {(profile?.role !== 'super_admin' || isImpersonating || pathname.startsWith('/admin')) && 
                    currentNavItems
                    .filter(i => !i.sidebarHidden)
                    .filter(can)
                    .map((item) => {
                    const isGroup = !!item.items
                    const isActive = pathname === item.href

                    if (isGroup) {
                        return (
                            <NavGroup
                                key={item.tKey}
                                item={item}
                                pathname={pathname}
                                collapsed={collapsed}
                                profile={profile}
                                can={can}
                                t={t}
                                dir={dir}
                            />
                        )
                    }

                    // Dashboard item (standalone)
                    return (
                        <Link prefetch={true} scroll={false}
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center px-4 py-4 rounded-xl transition-all group relative overflow-hidden",
                                isActive
                                    ? "text-white shadow-lg"
                                    : "text-slate-700 hover:bg-white/50 hover:text-black font-bold"
                            )}
                            style={isActive ? { backgroundColor: profile?.organization?.brand_color || "#4f46e5" } : {}}
                        >
                            <item.icon className={cn("w-4 h-4 relative z-10", collapsed ? "mx-auto" : (dir === 'rtl' ? "ml-3" : "mr-3"))} />
                            {!collapsed && <span className={cn("text-sm tracking-wide relative z-10 uppercase font-black")}>{t(item.tKey)}</span>}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-white/50">
                <div className="flex items-center justify-between mb-4">
                    {!collapsed && (
                        <div className="text-xs text-slate-400 font-mono font-medium">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm"></div>
                                {t('nav.system_online')}
                            </div>
                            {t('common.version')} {t('common.copyright_short')}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                    <button
                        onClick={() => signOut({ confirm: true })}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-all font-bold text-xs uppercase tracking-wider border border-transparent hover:border-red-100",
                            collapsed && "px-0"
                        )}
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                        {!collapsed && <span>{t('common.logout')}</span>}
                    </button>
                </div>
            </div>
        </div>
    )
})

const NavGroup = React.memo(function NavGroup({ item, pathname, collapsed, profile, can, t, dir }: { item: any, pathname: string, collapsed: boolean, profile: any, can: (i: any) => boolean, t: any, dir: string }) {
    const isGroupActive = item.items ? item.items.filter((i: any) => !i.sidebarHidden).filter(can).some((sub: any) => pathname === sub.href) : false;
    const [expanded, setExpanded] = useState(isGroupActive)

    useEffect(() => {
        if (isGroupActive) setExpanded(true)
    }, [isGroupActive])

    const visibleItems = item.items ? item.items.filter((i: any) => !i.sidebarHidden).filter(can) : []
    if (visibleItems.length === 0) return null

    return (
        <div className="space-y-2">
            <button
                onClick={() => !collapsed && setExpanded(!expanded)}
                className={cn(
                    "w-full flex items-center px-4 py-4 rounded-xl transition-all group relative overflow-hidden",
                    isGroupActive ? "bg-white/50 shadow-sm" : "hover:bg-white"
                )}
                style={{
                    color: isGroupActive ? (profile?.organization?.brand_color || "#4f46e5") : undefined,
                }}
            >
                <item.icon className={cn("w-4 h-4 relative z-10", collapsed ? "mx-auto" : (dir === 'rtl' ? "ml-3" : "mr-3"), isGroupActive ? "opacity-100" : "opacity-60")} style={isGroupActive ? { color: profile?.organization?.brand_color || "#4f46e5" } : {}} />
                {!collapsed && (
                    <>
                        <span className={cn("text-xs font-black tracking-widest relative z-10 uppercase flex-1", dir === 'rtl' ? "text-right" : "text-left")} style={isGroupActive ? { color: profile?.organization?.brand_color || "#4f46e5" } : {}}>{t(item.tKey)}</span>
                        {expanded ? <ChevronDown className="w-3 h-3" style={isGroupActive ? { color: profile?.organization?.brand_color || "#4f46e5" } : {}} /> : (dir === 'rtl' ? <ChevronRight className="w-3 h-3 rotate-180" style={isGroupActive ? { color: profile?.organization?.brand_color || "#4f46e5" } : {}} /> : <ChevronRight className="w-3 h-3" style={isGroupActive ? { color: profile?.organization?.brand_color || "#4f46e5" } : {}} />)}
                    </>
                )}
            </button>

            {expanded && !collapsed && (
                <div className={cn(
                    "space-y-1.5 my-2",
                    dir === 'rtl' ? "mr-6 pr-3 border-r-2 border-slate-100" : "ml-6 pl-3 border-l-2 border-slate-100"
                )}>
                    {visibleItems.map((sub: any) => {
                        const isActive = pathname === sub.href
                        return (
                            <Link prefetch={true} scroll={false}
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                    "flex items-center px-4 py-2 rounded-lg transition-all text-sm group",
                                    isActive ? "text-white font-bold shadow-md" : "text-slate-600 hover:text-slate-900 font-medium"
                                )}
                                style={isActive ? { backgroundColor: profile?.organization?.brand_color || "#10b981" } : {}}
                            >
                                <sub.icon className={cn("w-3 h-3", dir === 'rtl' ? "ml-3" : "mr-3", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
                                <span>{t(sub.tKey)}</span>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
})
