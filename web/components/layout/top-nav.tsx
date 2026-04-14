'use client'

import { IndianRupee, ShoppingCart, Undo2, PackageCheck, Zap, ShieldCheck, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/use-permission'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { AlertBell } from '@/components/alerts/AlertBell'

const QUICK_LINKS = [
    { tKey: 'nav.quick_purchase', label: 'Quick Purchase', href: '/stock/quick-entry', icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50' },
    { tKey: 'nav.quick_sales', label: 'Sales', href: '/sales', icon: IndianRupee, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { tKey: 'nav.pos', label: 'POS', href: '/sales/pos', icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50' },
    { tKey: 'nav.returns', label: 'Returns', href: '/sales/return/new', icon: Undo2, color: 'text-orange-600', bg: 'bg-orange-50' },
]

export function TopNav() {
    const pathname = usePathname()
    const router = useRouter()
    const { profile, can, isImpersonating } = usePermission()
    const [isImpersonatingState, setIsImpersonatingState] = useState(false)

    useEffect(() => {
        setIsImpersonatingState(localStorage.getItem('mandi_impersonation_mode') === 'true')
    }, [])

    const isSuperAdmin = profile?.role === 'super_admin'
    // Show quick links for: non-admins, OR admins who are impersonating (acting as a tenant owner)
    const showQuickLinks = !isSuperAdmin || isImpersonating

    const handleExitImpersonation = async () => {
        const restoreSession = localStorage.getItem('mandi_admin_restore_session');
        localStorage.removeItem('mandi_impersonation_mode');
        localStorage.removeItem('mandi_admin_restore_session');
        localStorage.removeItem('mandi_profile_cache');

        // Aggressive teardown
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('sb-') && key?.endsWith('-auth-token')) {
                localStorage.removeItem(key);
            }
        }

        if (restoreSession) {
            try {
                const { access_token, refresh_token } = JSON.parse(restoreSession);
                const { error } = await supabase.auth.setSession({ access_token, refresh_token });
                if (error) throw error;
                // Hard reload to completely reset React Auth Context
                window.location.href = '/admin';
            } catch (e) {
                console.error("Failed to restore admin session:", e);
                try { await supabase.auth.signOut(); } catch (err) {}
                window.location.href = '/login';
            }
        } else {
            // No session to restore, fallback to logout
            try { await supabase.auth.signOut(); } catch (err) {}
            window.location.href = '/login';
        }
    }

    return (
        <div className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur-xl border-b border-slate-100 px-4 py-2 print:hidden overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 min-w-max">
                {/* Impersonation Banner */}
                {isImpersonating && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 mr-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                            Admin View: {profile?.organization?.name || 'Tenant'}
                        </span>
                        <button
                            onClick={handleExitImpersonation}
                            className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-800 text-[10px] font-black transition-colors"
                        >
                            <LogOut className="w-3 h-3" />
                            Exit
                        </button>
                    </div>
                )}

                {showQuickLinks && QUICK_LINKS.filter(l => can(l.tKey)).map((link) => {
                    // Exact match OR starts with link.href/ but NOT a child of another link
                    const isActive = pathname === link.href ||
                        (link.href === '/sales' && (pathname.startsWith('/sales/invoice') || pathname.startsWith('/sales/new') || pathname.startsWith('/sales/pos') === false && pathname === '/sales')) ||
                        (link.href !== '/sales' && pathname.startsWith(link.href + '/'))
                    const Icon = link.icon

                    return (
                        <Link prefetch={true} scroll={false}
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 group",
                                isActive
                                    ? "bg-slate-900 text-white shadow-lg shadow-slate-200 font-black"
                                    : "text-slate-500 hover:bg-slate-50 font-bold"
                            )}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                                isActive
                                    ? "bg-white/15"
                                    : cn(link.bg, "group-hover:scale-105")
                            )}>
                                <Icon className={cn(
                                    "w-4 h-4",
                                    isActive ? "text-white" : link.color
                                )} />
                            </div>
                            <span className={cn(
                                "text-xs tracking-wide whitespace-nowrap",
                                isActive ? "text-white" : "text-slate-700"
                            )}>
                                {link.label}
                            </span>
                        </Link>
                    )
                })}

                <div className="ml-auto flex items-center gap-4 pl-4 border-l border-slate-100">
                    <AlertBell />
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.15em]">Live</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
