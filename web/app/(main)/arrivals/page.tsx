"use client"

import ArrivalsEntryForm from "@/components/arrivals/arrivals-form"
import ArrivalsHistory from "@/components/arrivals/arrivals-history"
import { useAuth } from "@/components/auth/auth-provider"
import { ShieldAlert, RefreshCw, Truck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/i18n/language-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { isNativePlatform } from "@/lib/capacitor-utils"
import { NativeCard } from "@/components/mobile/NativeCard"

export default function ArrivalsPage() {
    const { profile, loading } = useAuth()
    const { t } = useLanguage()

    if (loading) {
        return (
            <div className="flex-1 min-h-screen bg-[#EFEFEF] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-[#1A6B3C]" />
            </div>
        )
    }

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        return (
            <ErrorBoundary>
                <div className="bg-[#EFEFEF] min-h-dvh pb-6">
                    {/* Entry Form card */}
                    <div className="px-4 pt-3">
                        <NativeCard className="overflow-hidden">
                            <ArrivalsEntryForm />
                        </NativeCard>
                    </div>

                    {/* History */}
                    <div className="px-4 mt-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] mb-2 px-0.5">
                            Recent Arrivals
                        </p>
                        <NativeCard className="overflow-hidden">
                            <ArrivalsHistory />
                        </NativeCard>
                    </div>
                </div>
            </ErrorBoundary>
        )
    }

    // ── WEB / DESKTOP RENDER (ORIGINAL — UNCHANGED) ──────────────────────────
    const titleParts = t("arrivals.title")?.split(" ") || ["Arrivals", "Entry"]
    const titleFirst = titleParts[0]
    const titleRest = titleParts.slice(1).join(" ")

    return (
        <ErrorBoundary>
            <div className="flex-1 min-h-screen bg-slate-50 text-slate-900 p-6 space-y-8 pb-40">
                <div className="max-w-7xl mx-auto space-y-8">
                    <div className="bg-[#E8F5E9] p-6 rounded-2xl border border-[#C8E6C9]">
                        <h1 className="text-4xl font-black tracking-tighter text-[#2E7D32] italic mb-2 uppercase flex items-center gap-3">
                            {titleFirst} <span className="text-[#43A047]">{titleRest}</span>
                        </h1>
                        <p className="text-[#2E7D32] font-bold text-lg flex items-center gap-2">
                            <Truck className="w-5 h-5 text-[#43A047]" /> {t("arrivals.subtitle") || "Manage and track inbound inventory"}
                        </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[32px] shadow-xl overflow-hidden">
                        <ArrivalsEntryForm />
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[32px] shadow-xl overflow-hidden mt-8">
                        <ArrivalsHistory />
                    </div>
                </div>
            </div>
        </ErrorBoundary>
    )
}
