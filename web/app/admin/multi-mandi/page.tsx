"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Loader2, Building2, TrendingUp, Package, Users, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";

type OrgStats = {
    org_id: string;
    org_name: string;
    subscription_tier: string;
    total_lots: number;
    active_lots: number;
    total_sales: number;
    active_users: number;
    receivables: number;
    payables: number;
    net_balance: number;
};

export default function MultiMandiDashboard() {
    const { profile } = useAuth();
    const [orgs, setOrgs] = useState<OrgStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<"sales" | "lots" | "net_balance">("sales");

    const isSuperAdmin = profile?.role === "super_admin";

    useEffect(() => {
        if (isSuperAdmin) fetchAllOrgs();
    }, [isSuperAdmin]);

    const fetchAllOrgs = async () => {
        setLoading(true);
        const { data: orgList } = await supabase
            .from("organizations")
            .select("id, name, subscription_tier")
            .limit(100);

        if (!orgList) { setLoading(false); return; }

        const stats = await Promise.all(orgList.map(async (org) => {
            const [lots, sales, summary] = await Promise.all([
                supabase.schema('mandi').from("lots").select("id", { count: "exact" }).eq("organization_id", org.id),
                supabase.schema('mandi').from("sales").select("id", { count: "exact" }).eq("organization_id", org.id),
                supabase.rpc("get_financial_summary", { p_org_id: org.id }),
            ]);

            const s = summary.data || {};
            return {
                org_id: org.id,
                org_name: org.name,
                subscription_tier: org.subscription_tier || "starter",
                total_lots: lots.count || 0,
                active_lots: 0,
                total_sales: sales.count || 0,
                active_users: 0,
                receivables: Number(s.receivables || 0),
                payables: Math.abs(Number(s.farmer_payables || 0)) + Math.abs(Number(s.supplier_payables || 0)),
                net_balance: Number(s.receivables || 0) - Math.abs(Number(s.farmer_payables || 0)) - Math.abs(Number(s.supplier_payables || 0)),
            };
        }));

        setOrgs(stats.sort((a, b) => b[sortBy] - a[sortBy]));
        setLoading(false);
    };

    const TIER_COLORS: Record<string, string> = {
        unlimited: "text-amber-600 bg-amber-50 border-amber-100",
        enterprise: "text-purple-600 bg-purple-50 border-purple-100",
        growth: "text-blue-600 bg-blue-50 border-blue-100",
        starter: "text-slate-600 bg-slate-50 border-slate-100",
        trial: "text-emerald-600 bg-emerald-50 border-emerald-100",
    };

    const totals = orgs.reduce((acc, o) => ({
        orgs: acc.orgs + 1,
        lots: acc.lots + o.total_lots,
        sales: acc.sales + o.total_sales,
        receivables: acc.receivables + o.receivables,
        payables: acc.payables + o.payables,
    }), { orgs: 0, lots: 0, sales: 0, receivables: 0, payables: 0 });

    if (!isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <Building2 className="w-16 h-16 text-slate-200" />
                <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Super Admin Only</p>
                <p className="text-slate-300 text-xs font-bold">Multi-Mandi view requires Super Admin access</p>
            </div>
        );
    }

    return (
        <ProtectedRoute requiredPermission="view_financials">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                                <Building2 className="w-7 h-7 text-indigo-600" /> Multi-Mandi Dashboard
                            </h1>
                            <p className="text-slate-400 font-bold text-sm mt-0.5">Consolidated view across all organizations</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                {(["sales", "lots", "net_balance"] as const).map(s => (
                                    <button key={s} onClick={() => {
                                        setSortBy(s);
                                        setOrgs(prev => [...prev].sort((a, b) => b[s] - a[s]));
                                    }} className={cn(
                                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        sortBy === s ? "bg-white text-indigo-700 shadow-sm" : "text-slate-400"
                                    )}>
                                        {s.replace("_", " ")}
                                    </button>
                                ))}
                            </div>
                            <Button onClick={fetchAllOrgs} variant="outline" size="icon" className="rounded-xl">
                                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
                    {/* Network Totals */}
                    <div className="grid grid-cols-5 gap-5">
                        {[
                            { label: "Total Mandis", val: totals.orgs, icon: Building2, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
                            { label: "Total Lots", val: totals.lots, icon: Package, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
                            { label: "Total Sales", val: totals.sales, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
                            { label: "Network Receivables", val: `₹${(totals.receivables / 100000).toFixed(1)}L`, icon: ArrowDownRight, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
                            { label: "Network Payables", val: `₹${(totals.payables / 100000).toFixed(1)}L`, icon: ArrowUpRight, color: "text-rose-600", bg: "bg-rose-50 border-rose-100" },
                        ].map(({ label, val, icon: Icon, color, bg }) => (
                            <div key={label} className={`${bg} rounded-[24px] border p-5 shadow-sm`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon className={`w-4 h-4 ${color}`} />
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                </div>
                                <div className={`text-3xl font-[1000] tracking-tighter ${color}`}>{val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Org Table */}
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                    <tr>
                                        <th className="p-5">Organization</th>
                                        <th className="p-5">Plan</th>
                                        <th className="p-5 text-right">Lots</th>
                                        <th className="p-5 text-right">Sales</th>
                                        <th className="p-5 text-right">Receivables</th>
                                        <th className="p-5 text-right">Payables</th>
                                        <th className="p-5 text-right">Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {orgs.map((org, i) => (
                                        <tr key={org.org_id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-sm">
                                                        {i + 1}
                                                    </div>
                                                    <span className="font-black text-slate-800">{org.org_name}</span>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border",
                                                    TIER_COLORS[org.subscription_tier] || TIER_COLORS.starter
                                                )}>
                                                    {org.subscription_tier}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right font-mono font-bold text-slate-600">{org.total_lots}</td>
                                            <td className="p-5 text-right font-mono font-bold text-slate-600">{org.total_sales}</td>
                                            <td className="p-5 text-right font-mono font-bold text-emerald-600">
                                                ₹{org.receivables.toLocaleString("en-IN")}
                                            </td>
                                            <td className="p-5 text-right font-mono font-bold text-rose-600">
                                                ₹{org.payables.toLocaleString("en-IN")}
                                            </td>
                                            <td className={cn("p-5 text-right font-mono font-black text-lg",
                                                org.net_balance >= 0 ? "text-emerald-700" : "text-rose-700"
                                            )}>
                                                {org.net_balance >= 0 ? "+" : ""}₹{org.net_balance.toLocaleString("en-IN")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
