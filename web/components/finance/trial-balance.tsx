"use client";

import { useEffect, useState } from "react";
import { Loader2, Download, RefreshCw, Scale, Hash, Tag, Activity, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { formatCurrency, roundTo2 } from "@/lib/accounting-logic";

export default function TrialBalance() {
    const { profile } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (profile?.organization_id) {
            fetchReport();
        }
    }, [profile]);

    const fetchReport = async () => {
        setLoading(true);
        const { data: rows, error } = await supabase
            .schema('mandi')
            .from('view_trial_balance')
            .select('*')
            .eq('organization_id', profile?.organization_id)
            .order('account_code', { ascending: true });

        if (rows) setData(rows);
        setLoading(false);
    };

    // Calculate Grand Totals
    const totalDebit = roundTo2(data.reduce((sum, r) => sum + (r.total_debit || 0), 0));
    const totalCredit = roundTo2(data.reduce((sum, r) => sum + (r.total_credit || 0), 0));
    const netDiff = totalDebit - totalCredit;
    const isBalanced = Math.abs(netDiff) < 0.01;

    return (
        <div className="space-y-8 p-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-40"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-4xl font-[1000] text-slate-800 tracking-tighter uppercase">
                            Trial Balance
                        </h1>
                        <span className={cn(
                            "text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border shadow-sm",
                            isBalanced ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600 animate-pulse'
                        )}>
                            {isBalanced ? 'Matched' : 'Unbalanced'}
                        </span>
                    </div>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <Scale className="w-5 h-5 text-indigo-600" />
                        Consolidated Statement of All Ledgers
                    </p>
                </div>

                <div className="flex gap-3 relative z-10">
                    <Button
                        variant="outline"
                        onClick={fetchReport}
                        className="border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 h-14 w-14 p-0 rounded-2xl shadow-sm transition-all active:scale-95"
                    >
                        <RefreshCw className={cn("w-6 h-6", loading && "animate-spin")} />
                    </Button>
                    <Button
                        variant="outline"
                        className="bg-black text-white hover:bg-slate-800 h-14 px-8 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all active:scale-95 flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" /> Export Report
                    </Button>
                </div>
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-[32px] shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-2">Total Debits</p>
                    <div className="text-3xl font-black text-indigo-900 tracking-tighter">{formatCurrency(totalDebit)}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-8 rounded-[32px] shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Total Credits</p>
                    <div className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(totalCredit)}</div>
                </div>
                <div className={cn(
                    "p-8 rounded-[32px] shadow-sm border",
                    isBalanced ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                )}>
                    <p className={cn("text-[10px] font-black uppercase tracking-[0.2em] mb-2", isBalanced ? 'text-emerald-400' : 'text-red-400')}>Net Difference</p>
                    <div className={cn("text-3xl font-black tracking-tighter", isBalanced ? 'text-emerald-900' : 'text-red-900')}>
                        {formatCurrency(Math.abs(netDiff))}
                        {netDiff !== 0 && <span className="text-sm ml-2 opacity-50">{netDiff > 0 ? 'DR' : 'CR'}</span>}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64 bg-white/50 backdrop-blur-sm rounded-[32px] border border-slate-100">
                    <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
                </div>
            ) : (
                <div className="overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-xl">
                    <table className="w-full text-left">
                        <thead className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400 bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="p-6 pl-8"><Hash className="w-3 h-3 inline mr-1" /> Code</th>
                                <th className="p-6">Account Name</th>
                                <th className="p-6"><Tag className="w-3 h-3 inline mr-1" /> Type</th>
                                <th className="p-6 text-right">Debit</th>
                                <th className="p-6 text-right">Credit</th>
                                <th className="p-6 text-right pr-8">Net Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-24 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-300">
                                            <Scale className="w-16 h-16 opacity-20" />
                                            <p className="font-black uppercase tracking-[0.3em] text-sm">No accounting data found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : data.map((row) => (
                                <tr key={row.account_id} className="hover:bg-indigo-50/30 transition-all group">
                                    <td className="p-6 pl-8 text-slate-400 font-mono text-xs font-black">{row.account_code}</td>
                                    <td className="p-6">
                                        <span className="font-black text-slate-800 text-lg tracking-tight group-hover:text-indigo-700 transition-colors">
                                            {row.account_name}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-100 text-slate-500 uppercase tracking-widest border border-slate-200">
                                            {row.account_type}
                                        </span>
                                    </td>
                                    <td className="p-6 text-right font-mono font-bold text-slate-400">
                                        {row.total_debit > 0 ? formatCurrency(row.total_debit) : '-'}
                                    </td>
                                    <td className="p-6 text-right font-mono font-bold text-slate-400">
                                        {row.total_credit > 0 ? formatCurrency(row.total_credit) : '-'}
                                    </td>
                                    <td className={cn(
                                        "p-6 text-right font-mono font-black text-xl tracking-tighter pr-8",
                                        row.net_balance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                    )}>
                                        <div className="flex flex-col items-end">
                                            <span>{formatCurrency(Math.abs(row.net_balance))}</span>
                                            <span className="text-[9px] opacity-40 -mt-1">{row.net_balance >= 0 ? 'DEBIT' : 'CREDIT'}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                            <tr className="font-black uppercase tracking-widest text-xs text-slate-700">
                                <td colSpan={3} className="p-8 pl-8 text-slate-400">Account Summary Totals</td>
                                <td className="p-8 text-right font-mono text-2xl text-slate-900 tracking-tighter">{formatCurrency(totalDebit)}</td>
                                <td className="p-8 text-right font-mono text-2xl text-slate-900 tracking-tighter">{formatCurrency(totalCredit)}</td>
                                <td className="p-8 text-right">
                                    <div className={cn(
                                        "inline-block px-4 py-2 rounded-2xl border font-black text-[10px] tracking-[0.2em]",
                                        isBalanced ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'
                                    )}>
                                        {isBalanced ? 'BALANCED' : 'DIFF: ' + netDiff.toLocaleString()}
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
