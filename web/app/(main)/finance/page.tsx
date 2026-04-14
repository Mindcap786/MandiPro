"use client"

import FinancialDashboard from "@/components/finance/finance-dashboard"
import { ProtectedRoute } from "@/components/protected-route"
import { isNativePlatform } from "@/lib/capacitor-utils"
import { NativeFinanceHub } from "@/components/mobile/NativeFinanceHub"

export default function FinancePage() {
    return (
        <ProtectedRoute requiredPermission="view_financials">
            {isNativePlatform() ? (
                <NativeFinanceHub />
            ) : (
                <FinancialDashboard />
            )}
        </ProtectedRoute>
    )
}
