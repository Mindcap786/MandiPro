"use client"

import { QuickPurchaseForm } from "@/components/inventory/quick-consignment-form"
import { useLanguage } from "@/components/i18n/language-provider"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function QuickPurchaseEntryPage() {
    const { t } = useLanguage()

    return (
        <div className="min-h-screen bg-slate-50 overflow-x-hidden pt-10 px-6 sm:px-12">
            <div className="max-w-[1700px] mx-auto space-y-8">
                {/* Header */}
                <div className="space-y-4">
                    <Link
                        href="/stock"
                        className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors group"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                        Back to Inventory
                    </Link>

                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-purple-600 font-black tracking-widest text-[10px] uppercase">
                            <div className="h-[2px] w-8 bg-purple-600" />
                            Inventory Operations
                        </div>
                        <h1 className="text-5xl font-[1000] text-black tracking-tighter uppercase italic leading-none">
                            Quick <span className="text-purple-600">Purchase</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-sm max-w-2xl">
                            Rapidly enter multiple purchase arrivals from various suppliers.
                            Supports both Direct and Farmer purchases with rate and commission tracking.
                        </p>
                    </div>
                </div>

                {/* Form Component */}
                <QuickPurchaseForm />
            </div>
        </div>
    )
}
