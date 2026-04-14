"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Building2, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

type TenantHealth = {
    org_id: string;
    org_name: string;
    subscription_tier: string;
    activity_score: number;
    data_quality_score: number;
    overdue_invoices: number;
    open_alerts: number;
    last_lot_at: string | null;
    last_sale_at: string | null;
};

export default function TenantHealthDashboard() {
    const { profile } = useAuth();
    const [tenants, setTenants] = useState<TenantHealth[]>([]);
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [runningAlerts, setRunningAlerts] = useState(false);

    const isSuperAdmin = profile?.role === "super_admin";

    useEffect(() => {
        if (isSuperAdmin) { fetchHealth(); fetchAlerts(); }
    }, [isSuperAdmin]);

    const fetchHealth = async () => {
        setLoading(true);
        const { data } = await supabase.from("view_tenant_health").select("*");
        if (data) setTenants(data.sort((a, b) => (b.activity_score + b.data_quality_score) - (a.activity_score + a.data_quality_score)));
        setLoading(false);
    };

    const fetchAlerts = async () => {
        const { data } = await supabase.schema('core').from("system_alerts")
            .select("*")
            .eq("is_resolved", false)
            .order("created_at", { ascending: false })
            .limit(30);
        if (data) setAlerts(data);
    };

    const runAlertsNow = async () => {
        setRunningAlerts(true);
        await supabase.rpc("sync_platform_lifecycle");
        setRunningAlerts(false);
        fetchAlerts();
    };

    const resolveAlert = async (alertId: string) => {
        await supabase.schema('core').from("system_alerts").update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq("id", alertId);
        fetchAlerts();
    };

    const getHealthScore = (t: TenantHealth) => Math.round((t.activity_score + t.data_quality_score) / 2);

    const getHealthColor = (score: number) => {
        if (score >= 70) return { ring: "ring-emerald-400", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
        if (score >= 40) return { ring: "ring-amber-400", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" };
        return { ring: "ring-red-400", badge: "bg-red-100 text-red-700", bar: "bg-red-500" };
    };

    const TIER_BADGES: Record<string, string> = {
        unlimited: "bg-amber-100 text-amber-700 border-amber-200",
        enterprise: "bg-purple-100 text-purple-700 border-purple-200",
        growth: "bg-blue-100 text-blue-700 border-blue-200",
        starter: "bg-slate-100 text-slate-600 border-slate-200",
    };

    const ALERT_SEVERITY: Record<string, { icon: any; color: string }> = {
        critical: { icon: AlertTriangle, color: "text-red-600 bg-red-50 border-red-200" },
        warning: { icon: AlertTriangle, color: "text-amber-600 bg-amber-50 border-amber-200" },
        info: { icon: CheckCircle2, color: "text-blue-600 bg-blue-50 border-blue-200" },
    };

    if (!isSuperAdmin) return (
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <Shield className="w-16 h-16 text-slate-200" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Super Admin Only</p>
        </div>
    );

    const avgHealth = tenants.length > 0 ? Math.round(tenants.reduce((s, t) => s + getHealthScore(t), 0) / tenants.length) : 0;
    const critical = tenants.filter(t => getHealthScore(t) < 40).length;
    const totalAlerts = alerts.length;

    return (
        <div className="min-h-screen bg-[#F0F2F5] pb-20">
            <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                            <Shield className="w-7 h-7 text-indigo-600" /> Tenant Health Score
                        </h1>
                        <p className="text-slate-400 font-bold text-sm mt-0.5">Engagement, data quality, and risk monitoring</p>
                    </div>
                    <div className="flex gap-3">
                        <Button onClick={runAlertsNow} disabled={runningAlerts} variant="outline"
                            className="h-11 rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 font-bold gap-2">
                            {runningAlerts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Run Alerts Now
                        </Button>
                        <Button onClick={() => { fetchHealth(); fetchAlerts(); }} variant="outline" size="icon" className="rounded-xl">
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Network Health KPIs */}
                <div className="grid grid-cols-4 gap-5">
                    {[
                        { label: "Avg Health Score", val: `${avgHealth}/100`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
                        { label: "Total Tenants", val: tenants.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
                        { label: "At-Risk Tenants", val: critical, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50 border-red-100" },
                        { label: "Open Alerts", val: totalAlerts, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
                    ].map(({ label, val, icon: Icon, color, bg }) => (
                        <div key={label} className={`${bg} rounded-[24px] border p-6 shadow-sm`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className={`w-4 h-4 ${color}`} />
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                            </div>
                            <div className={`text-3xl font-[1000] tracking-tighter ${color}`}>{val}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Tenant Scorecards */}
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tenant Scorecards</h3>
                        {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                            : tenants.map(t => {
                                const score = getHealthScore(t);
                                const { ring, badge, bar } = getHealthColor(score);
                                return (
                                    <div key={t.org_id} className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ring-2", ring)}>
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <p className="font-black text-slate-800 text-sm">{t.org_name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded-full border", TIER_BADGES[t.subscription_tier] || TIER_BADGES.starter)}>
                                                        {t.subscription_tier}
                                                    </span>
                                                    {t.overdue_invoices > 0 && (
                                                        <span className="text-[8px] font-black text-red-500">⚠ {t.overdue_invoices} overdue</span>
                                                    )}
                                                    {t.open_alerts > 0 && (
                                                        <span className="text-[8px] font-black text-amber-500">🔔 {t.open_alerts} alerts</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={cn("text-xs font-black px-3 py-1 rounded-full", badge)}>{score}/100</span>
                                            </div>
                                        </div>

                                        {/* Score bars */}
                                        <div className="space-y-2">
                                            <div>
                                                <div className="flex justify-between text-[9px] font-black uppercase text-slate-400 mb-1">
                                                    <span>Activity</span><span>{t.activity_score}/100</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${t.activity_score}%` }} />
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-[9px] font-black uppercase text-slate-400 mb-1">
                                                    <span>Data Quality</span><span>{t.data_quality_score}/100</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${t.data_quality_score}%` }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Last activity */}
                                        <div className="flex gap-4 mt-3 text-[9px] font-bold text-slate-300">
                                            {t.last_lot_at && <span>Last lot: {formatDistanceToNow(new Date(t.last_lot_at), { addSuffix: true })}</span>}
                                            {t.last_sale_at && <span>Last sale: {formatDistanceToNow(new Date(t.last_sale_at), { addSuffix: true })}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Open Alerts */}
                    <div>
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Open Alerts ({totalAlerts})</h3>
                        {alerts.length === 0 ? (
                            <div className="bg-white rounded-[28px] border border-slate-200 p-10 text-center">
                                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-300 mb-3" />
                                <p className="text-slate-400 font-bold text-xs">No open alerts</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto">
                                {alerts.map(alert => {
                                    const { icon: AlertIcon, color } = ALERT_SEVERITY[alert.severity] || ALERT_SEVERITY.info;
                                    return (
                                        <div key={alert.id} className={cn("rounded-2xl border p-4 shadow-sm", color)}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2">
                                                    <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <p className="font-black text-xs uppercase tracking-wider">{alert.alert_type.replace(/_/g, " ")}</p>
                                                        <p className="text-xs font-bold mt-1 opacity-80">{alert.message}</p>
                                                        <p className="text-[9px] font-mono opacity-50 mt-1">{format(new Date(alert.created_at), "dd MMM HH:mm")}</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => resolveAlert(alert.id)}
                                                    className="flex-shrink-0 text-[9px] font-black uppercase bg-white/50 hover:bg-white px-2 py-1 rounded-lg transition-all">
                                                    Resolve
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
