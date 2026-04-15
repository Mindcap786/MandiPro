'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, Users, Settings, LogOut, ShieldAlert, Menu, X,
    CreditCard, ToggleRight, Stethoscope, ShieldCheck, Layers,
    Activity, ChevronRight, Globe, Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { isNativePlatform } from '@/lib/capacitor-utils';

const MENU_SECTIONS = [
    {
        label: 'Platform',
        items: [
            { name: 'Command Center', icon: LayoutDashboard, href: '/admin', exact: true },
            { name: 'Tenants', icon: Users, href: '/admin/tenants', badge: null },
            { name: 'Feature Flags', icon: ToggleRight, href: '/admin/features' },
        ]
    },
    {
        label: 'Revenue',
        items: [
            { name: 'Billing Engine', icon: CreditCard, href: '/admin/billing' },
            { name: 'Subscription Plans', icon: Layers, href: '/admin/billing/plans' },
        ]
    },
    {
        label: 'Operations',
        items: [
            { name: 'Support Ops', icon: Stethoscope, href: '/admin/support' },
            { name: 'Audit Vault', icon: ShieldAlert, href: '/admin/audit' },
            { name: 'Settings', icon: Settings, href: '/admin/settings' },
            { name: 'Contact Info', icon: Phone, href: '/admin/contact-info' },
        ]
    },
    {
        label: 'Security',
        items: [
            { name: 'Admin Roster', icon: ShieldCheck, href: '/admin/admins' },
            { name: 'Session Control', icon: Activity, href: '/admin/sessions' },
        ]
    }
];

function NavItem({ item, pathname, onClick }: { item: any; pathname: string; onClick: () => void }) {
    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            onClick={onClick}
            className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-150",
                isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            )}
        >
            <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-indigo-600")} />
            <span className="flex-1 truncate">{item.name}</span>
            {item.badge && (
                <Badge className="bg-rose-500 text-white text-[9px] px-1.5 h-4 font-black">
                    {item.badge}
                </Badge>
            )}
            {isActive && <ChevronRight className="w-3 h-3 text-white/70 flex-shrink-0" />}
        </Link>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, signOut, loading: authLoading } = useAuth();
    const [isNative, setIsNative] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsNative(isNativePlatform());
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) { router.push('/login'); return; }
        if (profile && profile.role !== 'super_admin') {
            router.push('/dashboard');
        }
    }, [user, profile, authLoading]);

    const handleLogout = async () => {
        await signOut();
        router.replace('/login');
    };

    if (authLoading || !profile) {
        return (
            <div className="h-screen bg-zinc-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-neon-blue animate-spin" />
            </div>
        );
    }

    if (profile.role !== 'super_admin') return null;

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Logo */}
            <div className="p-5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
                        <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <div className="text-sm font-black text-slate-900 tracking-tight">HQ Portal</div>
                        <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Control Tower</div>
                    </div>
                </div>
                {/* Admin identity */}
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0 shadow-sm">
                        {profile?.full_name?.charAt(0) || 'S'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-slate-800 truncate">{profile?.full_name || 'Super Admin'}</p>
                        <p className="text-[9px] text-slate-500 truncate">{profile?.role}</p>
                    </div>
                    <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 text-[8px] font-black uppercase border">
                        SA
                    </Badge>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
                {MENU_SECTIONS.map(section => (
                    <div key={section.label}>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-3 mb-2">
                            {section.label}
                        </p>
                        <div className="space-y-0.5">
                            {section.items.map(item => (
                                <NavItem
                                    key={item.href}
                                    item={item}
                                    pathname={pathname}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            {/* System Status Footer */}
            <div className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/50">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700">All Systems Online</span>
                    <Globe className="w-3 h-3 text-emerald-600/50 ml-auto" />
                </div>
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500 selection:text-white">
            {/* Mobile Header (Hidden in Native - uses internal MobileHeader) */}
            {!isNative && (
                <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 z-50 shadow-sm">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-indigo-600" />
                        <span className="font-black text-sm tracking-tight text-slate-900">
                            HQ <span className="text-indigo-600">Portal</span>
                        </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-slate-600 hover:bg-slate-100">
                        {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </Button>
                </div>
            )}

            {/* Desktop Sidebar (Web Only) */}
            {!isNative && (
                <aside className="hidden md:flex w-60 flex-col bg-white flex-shrink-0 sticky top-0 h-screen">
                    <SidebarContent />
                </aside>
            )}

            {/* Mobile Sidebar Drawer (Web Only) */}
            {!isNative && isMobileMenuOpen && (
                <>
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
                    <aside className="fixed inset-y-0 left-0 z-40 w-72 bg-white flex flex-col md:hidden shadow-2xl">
                        <SidebarContent />
                    </aside>
                </>
            )}

            {/* Main Content with Safe Area Padding for Native */}
            <main className={cn(
                "flex-1 overflow-x-hidden min-h-screen",
                isNative ? "pt-[calc(14px+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]" : "pt-14 md:pt-0"
            )}>
                {children}
            </main>
        </div>
    );
}
