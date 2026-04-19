"use client";

import { Sidebar } from '@/components/layout/sidebar'
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'
import { CommandPalette } from '@/components/layout/command-palette'
import { TopNav } from '@/components/layout/top-nav'
import { SystemAlerts } from '@/components/layout/system-alerts'
import { PlatformPrintBranding } from '@/components/layout/platform-print-branding'
import { SubscriptionExpiryWarning } from '@/components/layout/subscription-expiry-warning'
import { SubscriptionStatusBanner } from '@/components/subscription/SubscriptionStatusBanner'
import { SupportHelpdeskWidget } from '@/components/layout/support-helpdesk-widget'
import { NativeTopBar } from '@/components/mobile/NativeTopBar'
import { FAB } from '@/components/mobile/FAB'
import { SnackbarProvider } from '@/components/mobile/Snackbar'
import { StockAlertsProvider } from '@/components/alerts/StockAlertsProvider'
import { NetworkStatus } from '@/components/capacitor/network-status'
import { PullToRefresh } from '@/components/capacitor/pull-to-refresh'
import { isNativePlatform } from '@/lib/capacitor-utils'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export default function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Default to desktop (web) layout. If we're actually on a native shell,
    // the effect below flips isNative before paint completes. This avoids
    // the bare-slate flash that made every navigation feel like a hard refresh.
    const [isNative, setIsNative] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState<number>(288);

    useEffect(() => {
        // Initial detection
        setIsNative(isNativePlatform());

        // Listen for window resize to toggle UI between Desktop/Native modes
        const handleResize = () => setIsNative(isNativePlatform());
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Listen to sidebar collapse state via a custom event
    useEffect(() => {
        const handler = (e: any) => setSidebarWidth(e.detail?.collapsed ? 80 : 288);
        window.addEventListener('sidebar-collapse', handler);
        return () => window.removeEventListener('sidebar-collapse', handler);
    }, []);

    // ── NATIVE MOBILE LAYOUT ───────────────────────────────────────────────────
    if (isNative) {
        return (
            <StockAlertsProvider>
                <div
                    className={cn(
                        "fixed inset-0 flex flex-col bg-[#EFEFEF] select-none touch-manipulation",
                        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
                        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
                    )}
                >
                    {/* Fixed top bar */}
                    <NativeTopBar />

                    {/* Subscription Status Banner — shows for trial, past_due, grace, locked, cancelled */}
                    <SubscriptionStatusBanner />

                    {/* System-level alerts (subscription expired, etc.) */}
                    <SystemAlerts />

                    {/* Scrollable main content — offset for fixed top bar + bottom nav */}
                    <main
                        className={cn(
                            "flex-1 overflow-y-auto overscroll-y-contain",
                            "[-webkit-overflow-scrolling:touch] custom-scrollbar",
                            "pt-14",
                            // Force flex child to respect parent height for scrolling
                            "min-h-0",
                            // Bottom padding: 60px BottomNav + padding
                            "pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+20px)]",
                        )}
                    >
                        {children}
                    </main>

                    {/* Bottom Navigation */}
                    <MobileBottomNav />

                    {/* Floating Action Button — sits above bottom nav */}
                    <FAB />

                    {/* Global Overlays */}
                    <NetworkStatus />
                    <PullToRefresh />
                    <PlatformPrintBranding />

                    {/* Snackbar provider — replaces top toasts */}
                    <SnackbarProvider />
                </div>
            </StockAlertsProvider>
        );
    }

    // ── WEB / DESKTOP LAYOUT (UNCHANGED) ──────────────────────────────────────
    return (
        <StockAlertsProvider>
            <div className="min-h-screen bg-slate-50 print:block">

                {/* ── FIXED Left Sidebar — never scrolls ─────────────────────── */}
                <aside
                    className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-slate-200 print:hidden overflow-hidden transition-all duration-300"
                    style={{ width: sidebarWidth }}
                >
                    <Sidebar onCollapseChange={(collapsed) =>
                        window.dispatchEvent(new CustomEvent('sidebar-collapse', { detail: { collapsed } }))
                    } />
                </aside>

                {/* ── Main Content — offset by sidebar width ──────────────────── */}
                <main
                    className={cn(
                        "flex flex-col min-h-screen bg-slate-50 transition-all duration-300",
                        "print:block print:min-h-0 print:overflow-visible print:bg-white print:h-auto print:ml-0",
                        "md:ml-[288px]"
                    )}
                    style={{ marginLeft: sidebarWidth }}
                >
                    <SubscriptionStatusBanner />

                    <SystemAlerts />

                    {/* Top Nav (sticky) */}
                    <div className="web-only sticky top-0 z-30">
                        <TopNav />
                    </div>

                    {/* Page Content */}
                    <div className="flex-1 print:block print:pb-0">
                        {children}
                    </div>
                </main>

                {/* Mobile Bottom Nav (visible on mobile web) */}
                <div className="md:hidden">
                    <MobileBottomNav />
                </div>

                {/* Mobile FAB overlay support */}
                <FAB />

                <div className="print:hidden">
                    <CommandPalette />
                </div>

                {/* Global Overlays */}
                <NetworkStatus />
                <PullToRefresh />
                <SubscriptionExpiryWarning />
                {!isNative && <SupportHelpdeskWidget />}
                <PlatformPrintBranding />
            </div>
        </StockAlertsProvider>
    );
}
