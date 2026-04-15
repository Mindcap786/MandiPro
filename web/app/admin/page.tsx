'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    Users, Building2, Activity, DollarSign, Loader2, AlertTriangle, ShieldCheck,
    ArrowUpRight, TrendingUp, TrendingDown, Globe, Zap, RefreshCw, Server,
    BarChart3, Package, Shield, CreditCard, ToggleRight, Stethoscope, Eye,
    Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight, Landmark
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAdminMetrics } from '@/hooks/admin/useAdminDashboard';

const STAT_CARDS = (m: any) => [
    {
        label: 'Total Tenants', value: m.total_mandis, icon: Building2,
        color: 'text-indigo-600', sub: `${m.active_mandis} active`, trend: 'up'
    },
    {
        label: 'Platform MRR', value: `₹${(m.mrr || 0).toLocaleString('en-IN')}`,
        icon: DollarSign, color: 'text-emerald-400', sub: `ARR ₹${(m.arr || 0).toLocaleString('en-IN')}`, trend: 'up'
    },
    {
        label: 'Churn Risk', value: m.churn_risk_count || 0, icon: TrendingDown,
        color: m.churn_risk_count > 0 ? 'text-orange-400' : 'text-slate-500',
        sub: 'inactive > 7 days', trend: m.churn_risk_count > 0 ? 'warn' : 'ok'
    },
    {
        label: 'Ledger Alerts', value: m.negative_ledger_count || 0, icon: AlertTriangle,
        color: m.negative_ledger_count > 0 ? 'text-red-400' : 'text-slate-500',
        sub: 'negative balance entries', trend: m.negative_ledger_count > 0 ? 'danger' : 'ok'
    },
    {
        label: 'Stock Errors', value: m.negative_stock_count || 0, icon: Package,
        color: m.negative_stock_count > 0 ? 'text-red-400' : 'text-slate-500',
        sub: 'negative stock lots', trend: m.negative_stock_count > 0 ? 'danger' : 'ok'
    },
    {
        label: 'Platform Health', value: `${m.health_score ?? 100}%`, icon: ShieldCheck,
        color: (m.health_score ?? 100) > 85 ? 'text-emerald-400' : 'text-orange-400',
        sub: `${m.critical_alerts_count || 0} alerts active`, trend: (m.health_score ?? 100) > 85 ? 'ok' : 'warn'
    },
    {
        label: 'Audit Pulse', value: m.recent_audit_count || 0, icon: Shield,
        color: 'text-indigo-400', sub: 'actions in 24h', trend: 'ok'
    },
];

const NAV_TILES = [
    { href: '/admin/tenants', icon: Building2, label: 'Tenants', desc: 'Manage all Mandi orgs', color: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:border-blue-500/40' },
    { href: '/admin/billing', icon: CreditCard, label: 'Billing Engine', desc: 'Revenue & subscriptions', color: 'from-emerald-500/10 to-green-500/10 border-emerald-500/20 hover:border-emerald-500/40' },
    { href: '/admin/billing/gateways', icon: Landmark, label: 'Gateways', desc: 'Stripe & Razorpay config', color: 'from-amber-500/10 to-indigo-500/10 border-amber-500/20 hover:border-amber-500/40' },
    { href: '/admin/features', icon: ToggleRight, label: 'Feature Flags', desc: 'Module & flag control', color: 'from-purple-500/10 to-violet-500/10 border-purple-500/20 hover:border-purple-500/40' },
    { href: '/admin/support', icon: Stethoscope, label: 'Support Ops', desc: 'Diagnostics & repair', color: 'from-yellow-500/10 to-orange-500/10 border-yellow-500/20 hover:border-yellow-500/40' },
    { href: '/admin/audit', icon: Shield, label: 'Audit Vault', desc: 'Immutable action logs', color: 'from-red-500/10 to-pink-500/10 border-red-500/20 hover:border-red-500/40' },
    { href: '/admin/settings', icon: Server, label: 'Settings', desc: 'Platform configuration', color: 'from-gray-500/10 to-slate-500/10 border-gray-500/20 hover:border-gray-500/40' },
];

export default function AdminDashboard() {
    // ✅ REFACTORED: typed hook replaces 50+ lines of raw Supabase state + fetchAll
    const { metrics, loading, lastUpdated, error: metricsError, refetch } = useAdminMetrics(30_000);
    const [recentTenants, setRecentTenants] = useState<Array<{ id: string; name: string; status: string; trial_ends_at: string | null; [key: string]: unknown }>>([]);
    const [monitoring, setMonitoring] = useState<{ platform_status: string; critical_alerts: Array<{ message: string }>; warning_alerts: unknown[] }>({ platform_status: 'checking', critical_alerts: [], warning_alerts: [] });

    const fetchAll = useCallback(async () => {
        // Trigger lifecycle sync + fetch ancillary data
        await Promise.resolve(supabase.rpc('sync_platform_lifecycle')).catch(() => {});

        const { data: { session } } = await supabase.auth.getSession();
        const authHeaders = session?.access_token
            ? { 'Authorization': `Bearer ${session.access_token}` }
            : {} as Record<string, string>;

        const [tenantsRes, monitoringRes] = await Promise.allSettled([
            fetch('/api/admin/tenants', { headers: authHeaders }).then(r => r.ok ? r.json() : []),
            fetch('/api/admin/monitoring').then(r => r.json()),
        ]);

        if (tenantsRes.status === 'fulfilled' && Array.isArray(tenantsRes.value)) {
            setRecentTenants(tenantsRes.value.slice(0, 8));
        }
        if (monitoringRes.status === 'fulfilled') {
            setMonitoring(monitoringRes.value);
        }

        // Sync status from metrics hook into local monitoring state
        setMonitoring(prev => ({
            ...prev,
            platform_status: metrics.system_status,
        }));

        refetch();
    }, [metrics.system_status, refetch]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30_000);
        return () => clearInterval(interval);
    }, []);

    const statCards = STAT_CARDS(metrics);

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* ── HEADER ── */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="relative flex h-2 w-2">
                            <span className={cn(
                                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                monitoring.platform_status === 'critical' ? 'bg-red-500' :
                                monitoring.platform_status === 'degraded' ? 'bg-orange-500' : 'bg-emerald-400'
                            )} />
                            <span className={cn(
                                "relative inline-flex rounded-full h-2 w-2",
                                monitoring.platform_status === 'critical' ? 'bg-red-500' :
                                monitoring.platform_status === 'degraded' ? 'bg-orange-500' : 'bg-emerald-500'
                            )} />
                        </span>
                        <span className={cn(
                            "text-xs font-bold uppercase tracking-widest",
                            monitoring.platform_status === 'critical' ? 'text-red-500' :
                            monitoring.platform_status === 'degraded' ? 'text-orange-400' : 'text-emerald-500'
                        )}>
                            {monitoring.platform_status === 'critical' ? 'Platform Incident' :
                             monitoring.platform_status === 'degraded' ? 'Performance Degraded' :
                             'All Systems Operational'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">· Updated {lastUpdated.toLocaleTimeString()}</span>
                    </div>
                    <h1 className="text-5xl font-black text-slate-900 tracking-[0.15em] uppercase mb-1">Command Center</h1>
                    <p className="text-slate-500 font-medium">
                        Global pulse of <span className="text-indigo-600 font-black">{metrics.total_mandis}</span> connected mandis.
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="border-slate-200 text-slate-900 hover:bg-white/5 gap-2"
                    onClick={fetchAll}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh Pulse
                </Button>
            </div>

            {/* ── INCIDENT BANNER ── */}
            {monitoring.platform_status === 'critical' && monitoring.critical_alerts.length > 0 && (
                <div className="p-4 rounded-2xl border border-red-500/40 bg-red-50 flex items-center gap-4">
                    <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-black text-red-400">Active Platform Incident</p>
                        <p className="text-xs text-red-400/60">{monitoring.critical_alerts[0]?.message}</p>
                    </div>
                    <Link href="/admin/support">
                        <Button size="sm" className="bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30">
                            View Alerts
                        </Button>
                    </Link>
                </div>
            )}
            {monitoring.platform_status === 'degraded' && monitoring.warning_alerts.length > 0 && (
                <div className="p-4 rounded-2xl border border-orange-500/30 bg-orange-50 flex items-center gap-4">
                    <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-black text-orange-400">{monitoring.warning_alerts.length} Warning(s) Active</p>
                        <p className="text-xs text-orange-400/60">{monitoring.warning_alerts[0]?.message}</p>
                    </div>
                    <Link href="/admin/support">
                        <Button size="sm" className="bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20">
                            View Details
                        </Button>
                    </Link>
                </div>
            )}

            {/* ── KPI STAT GRID ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {statCards.map((card) => (
                    <Card key={card.label} className={cn(
                        "bg-white shadow-sm border-slate-200 relative overflow-hidden transition-all hover:border-slate-300",
                        card.trend === 'danger' && 'border-red-500/30 bg-red-50',
                        card.trend === 'warn' && 'border-orange-500/20 bg-orange-50',
                    )}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
                                <card.icon className={cn("w-4 h-4", card.color)} />
                            </div>
                            <p className={cn("text-2xl font-black", card.color)}>{card.value}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">{card.sub}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── MAIN GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Navigation Tiles */}
                <div className="lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Control Sections</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {NAV_TILES.map((tile) => (
                            <Link key={tile.href} href={tile.href}>
                                <div className={cn(
                                    "group p-5 rounded-2xl border bg-gradient-to-br cursor-pointer transition-all duration-200 hover:scale-[1.02]",
                                    tile.color
                                )}>
                                    <tile.icon className="w-7 h-7 text-slate-900/70 group-hover:text-slate-900 mb-3 transition-colors" />
                                    <p className="text-sm font-black text-slate-900">{tile.label}</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{tile.desc}</p>
                                    <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-slate-900 transition-colors mt-2" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Risk Alerts Panel */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Risk Monitor</p>
                    <Card className="bg-white shadow-sm border-slate-200 h-[calc(100%-1.5rem)]">
                        <CardContent className="p-5 space-y-3">
                            <RiskItem
                                ok={metrics.negative_ledger_count === 0}
                                label="Ledger Integrity"
                                detail={metrics.negative_ledger_count === 0 ? 'All balances clear' : `${metrics.negative_ledger_count} negative entries`}
                                href="/admin/support"
                            />
                            <RiskItem
                                ok={metrics.negative_stock_count === 0}
                                label="Stock Consistency"
                                detail={metrics.negative_stock_count === 0 ? 'No negative stock' : `${metrics.negative_stock_count} lots below zero`}
                                href="/admin/support"
                            />
                            <RiskItem
                                ok={metrics.churn_risk_count === 0}
                                label="Churn Risk"
                                detail={metrics.churn_risk_count === 0 ? 'All tenants active' : `${metrics.churn_risk_count} inactive mandis`}
                                href="/admin/tenants"
                            />
                            <RiskItem
                                ok={(metrics.health_score ?? 100) > 85}
                                label="Platform Health"
                                detail={`Score ${metrics.health_score ?? 100}/100`}
                                href="/admin/support"
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── RECENT TENANTS ── */}
            <div>
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Tenants</p>
                    <Link href="/admin/tenants">
                        <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-600/80 text-xs font-bold">
                            View All <ArrowUpRight className="w-3 h-3 ml-1" />
                        </Button>
                    </Link>
                </div>
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
                    <div className="divide-y divide-white/5">
                        {loading ? (
                            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>
                        ) : recentTenants.map((t) => (
                            <Link key={t.id} href={`/admin/tenants/${t.id}`}>
                                <div className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-slate-200 flex items-center justify-center text-slate-900 font-black text-sm group-hover:scale-110 transition-transform flex-shrink-0">
                                        {t.name?.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{t.name}</p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">
                                            {t.subscription_tier?.toUpperCase()}
                                        </Badge>
                                        <span className={cn(
                                            "w-2 h-2 rounded-full",
                                            (t.is_active || t.status === 'trial' || t.status === 'trialing') ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                                        )} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function RiskItem({ ok, label, detail, href }: { ok: boolean; label: string; detail: string; href: string }) {
    return (
        <Link href={href}>
            <div className={cn(
                "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer hover:border-slate-300",
                ok ? "border-slate-200 bg-slate-50" : "border-red-500/20 bg-red-50"
            )}>
                <div className="flex items-center gap-2">
                    {ok
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-red-400 animate-pulse flex-shrink-0" />
                    }
                    <div>
                        <p className="text-xs font-bold text-slate-900">{label}</p>
                        <p className="text-[10px] text-slate-500">{detail}</p>
                    </div>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400" />
            </div>
        </Link>
    );
}
