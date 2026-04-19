"use client"

import { isNativePlatform } from "@/lib/capacitor-utils"
import { cn } from "@/lib/utils"

/**
 * NativePageWrapper
 *
 * Drop-in wrapper for every page that delegates its UI to an existing
 * complex component (e.g. FinancialDashboard, DayBook, LedgerView…).
 *
 * On native it:
 *   - Sets #EFEFEF page background
 *   - Removes web-desktop padding
 *   - Applies correct bottom clearance for FAB + BottomNav
 *
 * On web it is invisible (renders children as-is).
 */
interface NativePageWrapperProps {
    children: React.ReactNode
    /** Extra CSS classes for the native wrapper div */
    className?: string
    /** Header title (optional, might be used by parent/wrapper) */
    title?: string
    /** Override bottom padding on native (e.g. if page has its own FAB) */
    noBottomPad?: boolean
}

export function NativePageWrapper({ children, className, noBottomPad }: NativePageWrapperProps) {
    if (!isNativePlatform()) return <>{children}</>

    return (
        <div
            className={cn(
                "bg-[#EFEFEF] h-full w-full",
                !noBottomPad && "pb-4",
                className
            )}
        >
            {children}
        </div>
    )
}
