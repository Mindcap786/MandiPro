"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import {
    Loader2, RefreshCw, Download, Building2, Scale,
    TrendingUp, Wallet, CreditCard, PiggyBank
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/utils/export-csv";

type AccountRow = {
    account_id: string;
    account_name: string;
    account_code: string;
    account_type: string;
    total_debit: number;
    total_credit: number;
    net_balance: number;
};

// Map account_type to balance sheet section
const ASSET_TYPES = ["asset", "cash", "bank", "receivable", "stock", "inventory"];
const LIABILITY_TYPES = ["liability", "payable", "loan", "creditor"];
// FIX 4: Income/expense are nominal accounts — they must NOT appear as equity.
// The retained profit (Income − Expense) is already added separately as retainedPL.
const EQUITY_TYPES = ["equity", "capital"];

function classifyAccount(type: string): "asset" | "liability" | "equity" {
    const t = type?.toLowerCase() || "";
    if (ASSET_TYPES.some(k => t.includes(k))) return "asset";
    if (LIABILITY_TYPES.some(k => t.includes(k))) return "liability";
    return "equity";
}

function netValue(row: AccountRow, section: "asset" | "liability" | "equity") {
    // Assets are DR-normal; Liabilities and Equity are CR-normal
    if (section === "asset") return row.total_debit - row.total_credit;
    return row.total_credit - row.total_debit;
}

function AccountSection({
    title, icon: Icon, accounts, section, colorClass, emptyLabel
}: {
    title: string;
    icon: any;
    accounts: AccountRow[];
    section: "asset" | "liability" | "equity";
    colorClass: string;
    emptyLabel: string;
}) {
    const total = accounts.reduce((s, r) => s + Math.max(netValue(r, section), 0), 0);
    return (
        <div className="bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            <div className={`px-4 py-3 md:px-8 md:py-5 border-b border-slate-100 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${colorClass} bg-opacity-10`}>
                        <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
                    </div>
                    <h3 className="font-black uppercase tracking-tight text-slate-800 text-sm">{title}</h3>
                </div>
                <span className="font-mono font-black text-sm md:text-lg text-slate-900 tracking-tighter">
                    ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            {accounts.length === 0 ? (
                <div className="py-10 text-center text-slate-300 text-xs font-black uppercase tracking-widest">
                    {emptyLabel}
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {accounts.map(row => {
                        const val = netValue(row, section);
                        return (
                            <div key={row.account_id} className="flex items-center justify-between px-4 py-3 md:px-8 md:py-4 hover:bg-slate-50/50 transition-colors">
                                <div>
                                    <p className="font-black text-slate-700 text-sm">{row.account_name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{row.account_code} · {row.account_type}</p>
                                </div>
                                <span className={`font-mono font-black text-sm md:text-base tracking-tighter ${val >= 0 ? 'text-slate-800' : 'text-rose-500'}`}>
                                    ₹{Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    {val < 0 && <span className="text-[9px] ml-1 opacity-60">CR</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

import { cacheGet, cacheSet } from "@/lib/data-cache";

export default function BalanceSheet() {
    const { profile } = useAuth();
    
    // Pre-load from cache for instant render on re-navigation
    const orgId = profile?.organization_id;
    const cachedData = orgId ? cacheGet<AccountRow[]>('balance_sheet', orgId) : null;
    
    const [data, setData] = useState<AccountRow[]>(cachedData || []);
    const [loading, setLoading] = useState(!cachedData);

    const fetchData = async () => {
        if (data.length === 0) setLoading(true);
        try {
            const { data: rows } = await supabase
                .schema('mandi')
                .from("view_trial_balance")
                .select("*")
                .eq("organization_id", profile?.organization_id);
            if (rows) {
                const results = rows as AccountRow[];
                setData(results);
                if (orgId) cacheSet('balance_sheet', orgId, results);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (profile?.organization_id) fetchData();
    }, [profile?.organization_id]);

    const assets = data.filter(r => classifyAccount(r.account_type) === "asset" && !r.account_name.toLowerCase().includes("tds"));
    const liabilities = data.filter(r => 
        classifyAccount(r.account_type) === "liability" && 
        !r.account_name.toLowerCase().includes("tds")
    );
    // Equity = Capital accounts + net retained P&L from income/expense
    const equityAccounts = data.filter(r => ["equity", "capital"].some(t => r.account_type?.toLowerCase().includes(t)));
    const incomeTotal = data
        .filter(r => ["income", "revenue"].some(t => r.account_type?.toLowerCase().includes(t)))
        .reduce((s, r) => s + (r.total_credit - r.total_debit), 0);
    const expenseTotal = data
        .filter(r => r.account_type?.toLowerCase().includes("expense"))
        .reduce((s, r) => s + (r.total_debit - r.total_credit), 0);
    const retainedPL = incomeTotal - expenseTotal;

    const totalAssets = assets.reduce((s, r) => s + Math.max(netValue(r, "asset"), 0), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + Math.max(netValue(r, "liability"), 0), 0);
    const totalEquity = equityAccounts.reduce((s, r) => s + Math.max(netValue(r, "equity"), 0), 0) + retainedPL;
    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

    const handleExport = () => {
        const exportData: any[] = [];
        
        // Add Assets
        assets.forEach(a => {
            exportData.push({
                Section: 'ASSETS',
                Account: a.account_name,
                Code: a.account_code,
                Type: a.account_type,
                Balance: netValue(a, 'asset')
            });
        });

        // Add Divider
        exportData.push({ Section: '---', Account: '---', Code: '---', Type: '---', Balance: 0 });

        // Add Liabilities
        liabilities.forEach(l => {
            exportData.push({
                Section: 'LIABILITIES',
                Account: l.account_name,
                Code: l.account_code,
                Type: l.account_type,
                Balance: netValue(l, 'liability')
            });
        });

        // Add Divider
        exportData.push({ Section: '---', Account: '---', Code: '---', Type: '---', Balance: 0 });

        // Add Equity
        equityAccounts.forEach(e => {
            exportData.push({
                Section: 'EQUITY',
                Account: e.account_name,
                Code: e.account_code,
                Type: e.account_type,
                Balance: netValue(e, 'equity')
            });
        });

        // Add Retained P&L
        exportData.push({
            Section: 'EQUITY (Retained)',
            Account: 'Net Trading Profit/Loss',
            Code: 'P&L',
            Type: 'Retained Earnings',
            Balance: retainedPL
        });

        const filename = `BalanceSheet_${profile?.organization?.name || 'Organization'}_${new Date().toISOString().split('T')[0]}.csv`;
        exportToCSV(exportData, filename);
    };

    return (
        <div className="space-y-4 md:space-y-8 p-4 md:p-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 bg-white p-5 md:p-8 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none opacity-40" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl md:text-4xl font-[1000] text-slate-800 tracking-tighter uppercase">
                            Balance Sheet
                        </h1>
                        <span className={cn(
                            "text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest border shadow-sm",
                            isBalanced ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-red-50 border-red-100 text-red-600 animate-pulse"
                        )}>
                            {isBalanced ? "Balanced" : "Unbalanced"}
                        </span>
                    </div>
                    <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                        <Scale className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                        Statement of Financial Position
                    </p>
                </div>
                <div className="flex gap-2 md:gap-3 relative z-10 w-full md:w-auto">
                    <Button variant="outline" onClick={fetchData}
                        className="border-slate-200 text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-11 w-11 md:h-14 md:w-14 p-0 rounded-xl md:rounded-2xl shadow-sm transition-all flex-shrink-0">
                        <RefreshCw className={cn("w-5 h-5 md:w-6 md:h-6", loading && "animate-spin")} />
                    </Button>
                    <Button variant="outline" onClick={handleExport}
                        className="flex-1 md:flex-none bg-black text-white hover:bg-slate-800 h-11 md:h-14 px-4 md:px-8 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-lg transition-all flex items-center justify-center gap-2">
                        <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Export
                    </Button>
                </div>
            </div>

            {/* Summary Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50 border border-blue-100 p-5 md:p-8 rounded-2xl md:rounded-[32px] shadow-sm">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-1 md:mb-2">Total Assets</p>
                    <div className="text-xl md:text-3xl font-black text-blue-900 tracking-tighter">₹{totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-5 md:p-8 rounded-2xl md:rounded-[32px] shadow-sm">
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 mb-1 md:mb-2">Total Liabilities</p>
                    <div className="text-xl md:text-3xl font-black text-amber-900 tracking-tighter">₹{totalLiabilities.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className={cn(
                    "p-5 md:p-8 rounded-2xl md:rounded-[32px] shadow-sm border",
                    isBalanced ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
                )}>
                    <p className={cn("text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-1 md:mb-2", isBalanced ? "text-emerald-400" : "text-red-400")}>
                        Equity + Retained P&L
                    </p>
                    <div className={cn("text-xl md:text-3xl font-black tracking-tighter", isBalanced ? "text-emerald-900" : "text-red-900")}>
                        ₹{totalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-48 md:h-64 bg-white/50 rounded-2xl md:rounded-[32px] border border-slate-100">
                    <Loader2 className="animate-spin text-blue-600 w-8 h-8 md:w-10 md:h-10" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                    {/* Left column: Assets */}
                    <div className="space-y-6">
                        <AccountSection
                            title="Assets"
                            icon={Building2}
                            accounts={assets}
                            section="asset"
                            colorClass="bg-blue-500"
                            emptyLabel="No asset accounts"
                        />
                        <AccountSection
                            title="Retained Earnings (P&L)"
                            icon={TrendingUp}
                            accounts={[]}
                            section="equity"
                            colorClass="bg-emerald-500"
                            emptyLabel=""
                        >
                        </AccountSection>
                        {/* Retained P&L pill */}
                        <div className={cn(
                            "bg-white rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm px-4 py-3 md:px-8 md:py-5 flex items-center justify-between",
                        )}>
                            <div>
                                <p className="font-black text-slate-700 text-sm">Net Trading P&L (Retained)</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Income − Expenses</p>
                            </div>
                            <span className={`font-mono font-black text-sm md:text-base tracking-tighter ${retainedPL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {retainedPL >= 0 ? '+' : ''}₹{Math.abs(retainedPL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Right column: Liabilities + Equity */}
                    <div className="space-y-6">
                        <AccountSection
                            title="Liabilities"
                            icon={CreditCard}
                            accounts={liabilities}
                            section="liability"
                            colorClass="bg-amber-500"
                            emptyLabel="No liability accounts"
                        />
                        <AccountSection
                            title="Capital & Equity"
                            icon={PiggyBank}
                            accounts={equityAccounts}
                            section="equity"
                            colorClass="bg-purple-500"
                            emptyLabel="No equity accounts"
                        />
                    </div>
                </div>
            )}

            {/* Balance check footer */}
            <div className={cn(
                "p-4 md:p-6 rounded-xl md:rounded-[24px] border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-0",
                isBalanced ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
            )}>
                <div className="flex items-center gap-2 md:gap-3">
                    <Scale className={`w-5 h-5 md:w-6 md:h-6 ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`} />
                    <p className={`font-black text-[10px] md:text-sm uppercase tracking-widest ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
                        {isBalanced ? "Books are Balanced — Assets = Liabilities + Equity" : `Imbalance detected: Discrepancy Found`}
                    </p>
                </div>
                <Wallet className={`w-4 h-4 md:w-5 md:h-5 opacity-40 ${isBalanced ? 'text-emerald-500' : 'text-red-500'} hidden md:block`} />
            </div>
        </div>
    );
}
