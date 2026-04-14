"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import BalanceSheet from "@/components/finance/balance-sheet";
import { ProtectedRoute } from "@/components/protected-route";
import Link from "next/link";
import { Scale, TrendingUp, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BalanceSheetPage() {
    return (
        <ProtectedRoute requiredPermission="view_financials">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                {/* Nav breadcrumb */}
                <div className="hidden md:flex bg-white border-b border-slate-200 px-8 py-4 items-center gap-4 shadow-sm">
                    <h1 className="text-sm font-black uppercase tracking-widest text-slate-400">Reports</h1>
                    <span className="text-slate-200">/</span>
                    <Scale className="w-4 h-4 text-blue-600" />
                    <h1 className="text-sm font-black uppercase tracking-widest text-slate-800">Balance Sheet</h1>

                    <div className="ml-auto flex gap-3">
                        <Button asChild variant="outline" size="sm"
                            className="border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-bold gap-2">
                            <Link href="/reports/pl">
                                <TrendingUp className="w-4 h-4 text-emerald-600" /> P&L
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm"
                            className="border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-bold gap-2">
                            <Link href="/reports/daybook">
                                <BookOpen className="w-4 h-4 text-indigo-600" /> Day Book
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm"
                            className="border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl font-bold gap-2">
                            <Link href="/finance">
                                <Scale className="w-4 h-4 text-blue-600" /> Ledgers
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6">
                    <BalanceSheet />
                </div>
            </div>
        </ProtectedRoute>
    );
}
