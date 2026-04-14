"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Loader2, TrendingUp, TrendingDown, Wallet, ArrowRight, Activity, Zap, PieChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatCurrency, roundTo2 } from "@/lib/accounting-logic";

export default function ProfitLoss() {
    const { profile } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile?.organization_id) fetchPL();
    }, [profile]);

    const fetchPL = async () => {
        setLoading(true);
        const { data } = await supabase
            .schema('mandi')
            .from('view_trial_balance')
            .select('*')
            .eq('organization_id', profile?.organization_id)
            .in('account_type', ['income', 'expense']);
        // FIX 7: Use account_type for filtering (not name-matching)
        // Income/Expense types are correctly classified in the view.
        if (data) setData(data);
        setLoading(false);
    };

    if (loading) return (
        <div className="flex justify-center items-center h-96 p-12">
            <Loader2 className="animate-spin text-emerald-600 w-12 h-12" />
        </div>
    );

    const incomes = data.filter(a => a.account_type === 'income');
    // FIX 8: Split expenses into Direct (COGS, code 5xxx) vs Indirect (Operating)
    const directExpenses = data.filter(a => a.account_type === 'expense' && a.account_code?.startsWith('5'));
    const indirectExpenses = data.filter(a => a.account_type === 'expense' && !a.account_code?.startsWith('5'));
    const expenses = data.filter(a => a.account_type === 'expense');

    const totalIncome = roundTo2(incomes.reduce((sum, a) => sum + (Number(a.total_credit) - Number(a.total_debit)), 0));
    const totalDirectExpense = roundTo2(directExpenses.reduce((sum, a) => sum + (Number(a.total_debit) - Number(a.total_credit)), 0));
    const totalIndirectExpense = roundTo2(indirectExpenses.reduce((sum, a) => sum + (Number(a.total_debit) - Number(a.total_credit)), 0));
    const totalExpense = roundTo2(totalDirectExpense + totalIndirectExpense);
    // FIX 8: Two-stage P&L
    const grossProfit = roundTo2(totalIncome - totalDirectExpense);
    const netProfit = roundTo2(grossProfit - totalIndirectExpense);

    return (
        <div className="space-y-10 p-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-40"></div>
                <div className="relative z-10">
                    <h1 className="text-4xl font-[1000] text-slate-800 tracking-tighter uppercase mb-2">
                        Trading P&L
                    </h1>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-emerald-600" />
                        Income & Expenditure Statement
                    </p>
                </div>

                <div className="flex items-center gap-4 relative z-10 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fiscal Status</p>
                        <p className={cn(
                            "text-sm font-black px-3 py-1 rounded-lg uppercase tracking-wider",
                            netProfit >= 0 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                        )}>
                            {netProfit >= 0 ? 'Surplus' : 'Deficit'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Top KPI Summary — Three Stage */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-[40px] shadow-sm group hover:translate-y-[-4px] transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Total Revenue</p>
                        <TrendingUp className="w-6 h-6 text-emerald-400 opacity-50" />
                    </div>
                    <div className="text-3xl font-black text-emerald-950 tracking-tighter">
                        {formatCurrency(totalIncome)}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600">
                        <Zap className="w-4 h-4" /> Sales Income
                    </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-8 rounded-[40px] shadow-sm group hover:translate-y-[-4px] transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Gross Profit</p>
                        <ArrowRight className="w-6 h-6 text-slate-300 opacity-70" />
                    </div>
                    <div className={cn("text-3xl font-black tracking-tighter", grossProfit >= 0 ? "text-slate-900" : "text-rose-700")}>
                        {formatCurrency(Math.abs(grossProfit))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
                        <Activity className="w-4 h-4" /> Revenue − Purchases
                    </div>
                </div>

                <div className="bg-rose-50 border border-rose-100 p-8 rounded-[40px] shadow-sm group hover:translate-y-[-4px] transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">Total Expenses</p>
                        <TrendingDown className="w-6 h-6 text-rose-400 opacity-50" />
                    </div>
                    <div className="text-3xl font-black text-rose-950 tracking-tighter">
                        {formatCurrency(totalExpense)}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-rose-600">
                        <Activity className="w-4 h-4" /> All Expenditures
                    </div>
                </div>

                <div className={cn(
                    "p-8 rounded-[40px] shadow-xl transition-all border group hover:translate-y-[-4px]",
                    netProfit >= 0 ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-100' : 'bg-rose-600 border-rose-500 text-white shadow-rose-100'
                )}>
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">Net Profit</p>
                        {netProfit >= 0 ? <TrendingUp className="w-8 h-8 opacity-40" /> : <TrendingDown className="w-8 h-8 opacity-40" />}
                    </div>
                    <div className="text-4xl font-black tracking-tighter">
                        {formatCurrency(Math.abs(netProfit))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-80">
                        Realized Earnings
                    </div>
                </div>
            </div>

            {/* Comparison Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Expenses Side */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-2 h-10 bg-rose-500 rounded-full" />
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Operating Expenses</h3>
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Debit Side Accounts</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[40px] overflow-hidden border border-slate-200 shadow-xl divide-y divide-slate-50">
                        {expenses.length === 0 && (
                            <div className="p-20 text-center flex flex-col items-center gap-4 text-slate-300">
                                <Wallet className="w-12 h-12 opacity-20" />
                                <p className="font-black uppercase tracking-[0.2em] text-xs">No active expense heads</p>
                            </div>
                        )}
                        {expenses.map(account => (
                            <div key={account.account_id} className="flex justify-between items-center p-6 hover:bg-rose-50/30 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-rose-400 font-bold group-hover:bg-white group-hover:text-rose-600 transition-colors shadow-sm">
                                        {account.account_name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800 group-hover:text-rose-700 transition-colors text-lg tracking-tight">{account.account_name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{account.account_code}</p>
                                    </div>
                                </div>
                                <span className="font-mono text-2xl font-black text-rose-600 tracking-tighter">
                                    {formatCurrency(Number(account.total_debit) - Number(account.total_credit))}
                                </span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center p-8 bg-slate-50/50 border-t border-slate-100">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Total Operating Cost</span>
                            <span className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(totalExpense)}</span>
                        </div>
                    </div>
                </div>

                {/* Income Side */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-2 h-10 bg-emerald-500 rounded-full" />
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Business Income</h3>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Credit Side Accounts</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-[40px] overflow-hidden border border-slate-200 shadow-xl divide-y divide-slate-50">
                        {incomes.length === 0 && (
                            <div className="p-20 text-center flex flex-col items-center gap-4 text-slate-300">
                                <TrendingUp className="w-12 h-12 opacity-20" />
                                <p className="font-black uppercase tracking-[0.2em] text-xs">No active income heads</p>
                            </div>
                        )}
                        {incomes.map(account => (
                            <div key={account.account_id} className="flex justify-between items-center p-6 hover:bg-emerald-50/30 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-emerald-400 font-bold group-hover:bg-white group-hover:text-emerald-600 transition-colors shadow-sm">
                                        {account.account_name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800 group-hover:text-emerald-700 transition-colors text-lg tracking-tight">{account.account_name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{account.account_code}</p>
                                    </div>
                                </div>
                                <span className="font-mono text-2xl font-black text-emerald-600 tracking-tighter">
                                    {formatCurrency(Number(account.total_credit) - Number(account.total_debit))}
                                </span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center p-8 bg-slate-50/50 border-t border-slate-100">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Total Business Revenue</span>
                            <span className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(totalIncome)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Final Net Result Banner */}
            <div className={cn(
                "p-10 rounded-[40px] border shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6",
                netProfit >= 0 ? "bg-emerald-50 border-emerald-100 text-emerald-900" : "bg-rose-50 border-rose-100 text-rose-900"
            )}>
                <div className="flex items-center gap-6">
                    <div className={cn(
                        "w-20 h-20 rounded-full flex items-center justify-center shadow-lg",
                        netProfit >= 0 ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                    )}>
                        {netProfit >= 0 ? <TrendingUp className="w-10 h-10" /> : <TrendingDown className="w-10 h-10" />}
                    </div>
                    <div>
                        <h2 className="text-3xl font-[1000] tracking-tighter leading-none mb-2">
                            {netProfit >= 0 ? "Net Trading Profit" : "Net Business Deficit"}
                        </h2>
                        <p className="text-sm font-black uppercase tracking-widest opacity-60">
                            Fiscal Performance Summary
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-6xl font-[1000] tracking-tighter mb-1">
                        {formatCurrency(Math.abs(netProfit))}
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest opacity-40">
                        {netProfit >= 0 ? "Credited to Equity" : "Debited from Reserves"}
                    </p>
                </div>
            </div>
        </div>
    );
}
