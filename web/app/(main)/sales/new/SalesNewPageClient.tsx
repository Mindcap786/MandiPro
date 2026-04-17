"use client";

import NewSaleForm from "@/components/sales/new-sale-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/i18n/language-provider";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function SalesNewPageClient() {
    const { t } = useLanguage();
    
    // Explicit safety guard for split
    const titleText = t('sales.new_invoice') || "New Invoice";

    return (
        <div className="space-y-4 animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-4">
                <Link href="/sales">
                    <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tighter">
                        {titleText.split(' ')[0]} <span className="text-indigo-600">{titleText.split(' ').slice(1).join(' ')}</span>
                    </h1>
                    <p className="text-slate-400 font-bold tracking-tight uppercase text-[9px] mt-0.5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                        {t('sales.new_invoice_subtitle') || "Create new invoice receipt"}
                    </p>
                </div>
            </div>

            <Suspense fallback={
                <div className="flex items-center justify-center h-64 border-2 border-slate-200 border-dashed rounded-xl bg-white/50">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
            }>
                <NewSaleForm />
            </Suspense>
        </div>
    );
}
