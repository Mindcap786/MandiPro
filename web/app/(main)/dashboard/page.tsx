'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { ShieldAlert, TrendingUp, Users, Package, Activity, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/components/i18n/language-provider'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { cacheGet, cacheSet, cacheIsStale } from '@/lib/data-cache'
import { SalesChart } from '@/components/dashboard/sales-chart'
import { isNativePlatform } from '@/lib/capacitor-utils'
import { StockAlertSummaryCard } from '@/components/alerts/StockAlertSummaryCard'

// Native Mobile components
import { NativeSummaryCard, StatChip } from '@/components/mobile/NativeSummaryCard'
import { QuickActionRow } from '@/components/mobile/QuickActionRow'
import { NativeCard } from '@/components/mobile/NativeCard'
import { SkeletonDashboard } from '@/components/mobile/ShimmerSkeleton'

// ──────────────────────────────────────────────────────────────────────────────
// ALL BUSINESS LOGIC IS COMPLETELY UNCHANGED BELOW. Only JSX return changes.
// ──────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const { t } = useLanguage()
    const { profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    
    useEffect(() => {
        setMounted(true)
    }, [])

    // Super admins should never see the tenant dashboard — redirect to /admin
    // UNLESS this is an impersonation session (super_admin logged in as a tenant owner)
    useEffect(() => {
        if (typeof window === 'undefined') return
        const isImpersonating = localStorage.getItem('mandi_impersonation_mode') === 'true'
        if (!authLoading && profile?.role === 'super_admin' && !isImpersonating) {
            router.replace('/admin')
        }
    }, [profile?.role, authLoading, router])

    // 2. Pre-load from cache immediately — no spinner on re-navigation
    const [stats, setStats] = useState({ revenue: 0, inventory: 0, collections: 0, network: 0, purchases: 0, payables: 0 });
    const [salesTrend, setSalesTrend] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Get org ID safely
    const orgId = useMemo(() => {
        if (!profile?.organization_id) return null
        return profile.organization_id
    }, [profile?.organization_id])

    // Cache preload
    useEffect(() => {
        if (!orgId) return

        try {
            const cached = cacheGet<any>('dashboard', orgId)
            if (cached) {
                setStats(cached.stats || { revenue: 0, inventory: 0, collections: 0, network: 0, purchases: 0, payables: 0 })
                setSalesTrend(cached.salesTrend || [])
                setRecentActivity(cached.recentActivity || [])
                setLoading(false)
            }
        } catch (err) {
            console.error("Cache load error:", err)
        }
    }, [orgId])

    useEffect(() => {
        // Wait for auth to load
        if (authLoading) return;

        const orgId = profile?.organization_id || (typeof window !== 'undefined' ? localStorage.getItem('mandi_profile_cache_org_id') : null)
        if (!orgId) return

        const fetchData = async () => {
            const schema = 'mandi';

            // If cache is fresh, don't re-fetch at all
            if (!cacheIsStale('dashboard', orgId)) {
                setLoading(false);
                return;
            }

            try {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const [salesRes, unpaidRes, activityRes, trendRes, stockRes, finRes] = await Promise.all([
                    supabase.schema(schema).from('sales').select('total_amount').eq('organization_id', orgId),
                    supabase.schema(schema).from('sales').select('total_amount').eq('organization_id', orgId).eq('payment_status', 'pending'),
                    supabase.schema(schema).from('stock_ledger').select('id, transaction_type, qty_change, created_at, lots(lot_code, item:commodities(name), contact:contacts(name))').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(10),
                    supabase.schema(schema).from('sales').select('sale_date, total_amount').eq('organization_id', orgId).gte('sale_date', sevenDaysAgo.toISOString().split('T')[0]).order('sale_date', { ascending: true }),
                    // Active lots count → real Stock value
                    supabase.schema(schema).from('lots').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
                    // Financial summary → real Payable (farmer + supplier)
                    (supabase.schema(schema).rpc('get_financial_summary', { p_org_id: orgId }) as any),
                ]);

                // Suppress errors by using optional chaining and default values
                const revenue = salesRes.data?.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0) || 0;
                const collectionsAmt = unpaidRes.data?.reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0) || 0;
                const activeLots = stockRes.count || 0;
                const finSummary = finRes.data || {};
                const totalPayable = Math.abs(Number(finSummary.farmer_payables || 0)) + Math.abs(Number(finSummary.supplier_payables || 0));
                const newStats = { revenue, inventory: activeLots, collections: collectionsAmt, payables: totalPayable, network: 0, purchases: 0 };

                const newActivity = (activityRes.data || []).map((a: any) => ({
                    id: a.id,
                    created_at: a.created_at,
                    amount: Math.abs(a.qty_change),
                    type: a.transaction_type,
                    lot: {
                        lot_code: a.lots?.lot_code,
                        item_type: a.lots?.item?.[0]?.name || a.lots?.item?.name || a.lots?.items?.[0]?.name || 'Item'
                    },
                    buyer: a.lots?.contact
                }));

                const trendMap = new Map<string, number>();
                (trendRes.data || []).forEach((s: any) => {
                    const date = new Date(s.sale_date).toLocaleDateString();
                    trendMap.set(date, (trendMap.get(date) || 0) + Number(s.total_amount));
                });
                const newTrend = Array.from(trendMap.entries()).map(([date, total]) => ({ date: date, total: total }));

                // Save to cache
                cacheSet('dashboard', orgId, { stats: newStats, salesTrend: newTrend, recentActivity: newActivity });

                setStats(newStats);
                setRecentActivity(newActivity);
                setSalesTrend(newTrend);

            } catch (err: any) {
                console.error("Dashboard Error:", err)
            } finally {
                setLoading(false)
            }
        }

        fetchData();

        // Real-time Subscriptions — debounced to 3s so rapid writes during
        // peak trading (10+ lots/min) don't fire a full fetchData() per row.
        // The cache TTL (30s) already provides stale-while-revalidate semantics.
        let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedFetch = () => {
            if (realtimeTimer) clearTimeout(realtimeTimer);
            realtimeTimer = setTimeout(() => { fetchData(); }, 3000);
        };

        try {
            const uniqueId = Math.random().toString(36).substring(7);
            const channel = supabase.channel(`dashboard-realtime-${uniqueId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'mandi', table: 'sales', filter: `organization_id=eq.${orgId}` },
                    debouncedFetch
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'mandi', table: 'lots', filter: `organization_id=eq.${orgId}` },
                    debouncedFetch
                )
                .subscribe();

            return () => {
                if (realtimeTimer) clearTimeout(realtimeTimer);
                supabase.removeChannel(channel);
            }
        } catch (err) {
            console.error("Realtime subscription error:", err);
            return () => {
                if (realtimeTimer) clearTimeout(realtimeTimer);
            }
        }

    }, [profile?.organization_id, authLoading])

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        if (!mounted) return null;

        if (loading) {
            return <SkeletonDashboard />;
        }

        return (
            <div className="px-4 py-3 space-y-4">
                {/* Hero Summary Card */}
                <NativeSummaryCard
                    businessName={profile?.organization?.name || 'MandiGrow'}
                    dateLabel="Last 7 Days"
                    totalLabel={t('stats.revenue') || 'Total Revenue'}
                    totalAmount={`₹${stats.revenue.toLocaleString()}`}
                    metrics={[
                        {
                            label: t('stats.collections') || 'Receivable',
                            value: `₹${stats.collections.toLocaleString()}`,
                            trend: stats.collections > 0 ? "up" : "flat"
                        },
                        {
                            label: 'Payable',
                            value: `₹${stats.payables.toLocaleString()}`,
                            trend: stats.payables > 0 ? "down" : "flat"
                        },
                        {
                            label: 'Active Lots',
                            value: stats.inventory.toString(),
                            trend: "flat" as const
                        },
                    ]}
                />

                {/* Stock Alerts Summary */}
                <StockAlertSummaryCard />

                {/* Quick Actions */}
                <QuickActionRow />

                {/* Recent Activity */}
                <div className="pt-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#6B7280] px-4 mb-2">
                        {t('common.live_feed') || 'Recent Activity'}
                    </p>

                    <div className="bg-white border-y border-gray-100 divide-y divide-gray-50">
                        {recentActivity.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-[#9CA3AF]">
                                <Activity className="w-8 h-8 mb-2 opacity-40" />
                                <p className="text-sm font-medium">{t('dashboard.no_activity') || 'No activity yet'}</p>
                            </div>
                        ) : (
                            recentActivity.slice(0, 10).map((txn) => (
                                <div key={txn.id} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors">
                                    {/* Avatar */}
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm",
                                        txn.type === 'sale' ? "bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]" : "bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE]"
                                    )}>
                                        {txn.buyer?.name?.charAt(0) || (txn.type === 'sale' ? 'S' : 'I')}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[#1A1A2E] truncate leading-tight">
                                            {txn.type === 'sale'
                                                ? (txn.buyer?.name || 'Buyer Transaction')
                                                : (txn.lot?.item?.name || txn.lot?.item_type || 'Inventory Update')}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className={cn(
                                                "text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md",
                                                txn.type === 'sale' ? "bg-green-50 text-green-700" : "bg-purple-50 text-purple-700"
                                            )}>
                                                {txn.type === 'sale' ? 'Sale' : txn.type === 'arrival' ? 'Inward' : 'Adjustment'}
                                            </span>
                                            {txn.lot?.lot_code && (
                                                <span className="text-[10px] text-[#9CA3AF] font-medium">
                                                     • Lot #{txn.lot.lot_code}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount + time */}
                                    <div className="text-right flex-shrink-0">
                                        <p className={cn(
                                            "text-sm font-black tabular-nums",
                                            txn.type === 'sale' ? "text-[#16A34A]" : "text-[#1A1A2E]"
                                        )}>
                                            {txn.type === 'sale' ? '₹' : ''}{Number(txn.amount || 0).toLocaleString()}
                                            {txn.type !== 'sale' ? ' u' : ''}
                                        </p>
                                        <p className="text-[10px] text-[#9CA3AF] font-bold mt-0.5">
                                            {new Date(txn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Sales Chart */}
                {salesTrend.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#6B7280] px-0.5">
                            {t('dashboard.revenue_velocity') || 'Revenue Trend'}
                        </p>
                        <NativeCard className="p-4">
                            <SalesChart data={salesTrend} />
                        </NativeCard>
                    </div>
                )}
            </div>
        );
    }

    // ── WEB / DESKTOP RENDER (ORIGINAL — UNCHANGED) ──────────────────────────
    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#F0F2F5] text-emerald-600">
                <div className="w-10 h-10 border-4 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="p-8 space-y-10 animate-in fade-in duration-1000">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-5xl font-[1000] tracking-tighter text-black mb-2 uppercase">
                        {t('dashboard.command_center')}
                    </h1>
                    <p className="text-slate-600 font-black flex items-center gap-2 text-lg">
                        <Activity className="w-5 h-5 text-emerald-600" />
                        {t('dashboard.live_auction')}
                    </p>
                </div>

                <div className="bg-white border border-slate-200 shadow-sm px-6 py-3 rounded-2xl flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{t('dashboard.market_status')}</span>
                        <span className="text-sm font-bold text-indigo-600 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            {t('dashboard.live_trading')}
                        </span>
                    </div>
                </div>
            </header>

            {/* Stock Alerts Area */}
            <div className="animate-in slide-in-from-top duration-500">
                <StockAlertSummaryCard />
            </div>

            {/* Key Metrics Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                    title={t('stats.revenue')}
                    value={`₹${stats.revenue.toLocaleString()}`}
                    icon={<TrendingUp className="h-6 w-6 text-blue-700" />}
                    bgColor="bg-blue-50"
                    borderColor="border-blue-100"
                    trend="+12.5%"
                    trendColor="text-blue-700"
                    trendBg="bg-white/60"
                    href="/finance"
                />
                <StatsCard
                    title={t('stats.inventory')}
                    value={stats.inventory.toString()}
                    icon={<Package className="h-6 w-6 text-purple-700" />}
                    bgColor="bg-purple-50"
                    borderColor="border-purple-100"
                    subtext={t('stats.lots_in_yard')}
                    subtextBg="bg-white/60"
                    href="/stock"
                />
                <StatsCard
                    title={t('stats.collections')}
                    value={`₹${stats.collections.toLocaleString()}`}
                    icon={<ShieldAlert className="h-6 w-6 text-rose-700" />}
                    bgColor="bg-rose-50"
                    borderColor="border-rose-100"
                    trend={t('stats.action_required')}
                    trendColor="text-rose-700"
                    trendBg="bg-white/60"
                    href="/finance/payments"
                />
                <StatsCard
                    title={t('stats.network')}
                    value={stats.network.toString()}
                    icon={<Users className="h-6 w-6 text-emerald-700" />}
                    bgColor="bg-emerald-50"
                    borderColor="border-emerald-100"
                    subtext={t('stats.farmers_registered')}
                    subtextBg="bg-white/60"
                    href="/contacts"
                />
            </div>

            <div className="grid gap-8 md:grid-cols-7">
                {/* Sales Chart Area */}
                <div className="col-span-4 bg-white border border-slate-200 shadow-sm rounded-3xl p-8 relative overflow-hidden group hover:shadow-md transition-all duration-500">
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <div>
                            <h3 className="text-xl font-black text-slate-900">{t('dashboard.revenue_velocity')}</h3>
                            <p className="text-xs text-slate-500 mt-1 font-black">{t('dashboard.transaction_volume')}</p>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                            {t('dashboard.real_time')}
                        </span>
                    </div>
                    <SalesChart data={salesTrend} />
                </div>

                {/* Recent Activity Feed */}
                <div className="col-span-3 bg-white border border-slate-200 shadow-sm rounded-3xl p-8 relative overflow-hidden flex flex-col h-full">
                    <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-purple-600" /> {t('common.live_feed')}
                    </h3>

                    <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {recentActivity.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                <Activity className="w-12 h-12 mb-2" />
                                <p className="text-sm font-bold">{t('dashboard.no_activity')}</p>
                            </div>
                        ) : (
                            recentActivity.map((txn, i) => (
                                <div key={txn.id} className="group relative bg-slate-50 hover:bg-emerald-50 p-4 rounded-xl border border-slate-100 hover:border-emerald-200 transition-all duration-300">
                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold shadow-sm transition-colors",
                                                txn.type === 'sale' ? "text-emerald-600 border-emerald-100" : "text-purple-600 border-purple-100"
                                            )}>
                                                {txn.buyer?.name?.charAt(0) || (txn.type === 'sale' ? 'B' : 'S')}
                                            </div>
                                            <div>
                                                <p className={cn(
                                                    "text-sm font-black transition-colors",
                                                    txn.type === 'sale' ? "text-emerald-700" : "text-slate-900 group-hover:text-purple-700"
                                                )}>
                                                    {t(
                                                        txn.type === 'sale' ? 'dashboard.activity.msg_sold' :
                                                        txn.type === 'arrival' ? 'dashboard.activity.msg_received' :
                                                        'dashboard.activity.msg_adjusted',
                                                        { item: txn.lot?.item_type || t('dashboard.activity.item') }
                                                    )}
                                                </p>
                                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                                                    {t('dashboard.activity.lot', { code: txn.lot?.lot_code })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn(
                                                "font-mono font-bold text-lg",
                                                txn.type === 'sale' ? "text-emerald-600" : "text-slate-800"
                                            )}>
                                                {txn.type === 'sale' ? t('common.currency_symbol') : ''}{txn.amount?.toLocaleString()}{txn.type !== 'sale' ? ' ' + t('dashboard.activity.units') : ''}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold">
                                                {new Date(txn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatsCard({ title, value, icon, bgColor, borderColor, trend, subtext, trendBg, subtextBg, trendColor, href }: any) {
    const Content = (
        <div className={cn(
            "p-6 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300 border shadow-sm",
            bgColor,
            borderColor,
            href ? 'cursor-pointer' : ''
        )}>
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title}</span>
                    <div className="p-2 rounded-lg bg-white/50 border border-white/50 group-hover:bg-white transition-colors">
                        {icon}
                    </div>
                </div>

                <div className="flex items-end justify-between">
                    <div className={cn(
                        "font-black text-slate-900 tracking-tight transition-all duration-300",
                        value.length > 12 ? "text-xl" :
                            value.length > 10 ? "text-2xl" :
                                "text-3xl"
                    )}>
                        {value}
                    </div>
                    {(trend || subtext) && (
                        <div className={cn(
                            "text-[10px] font-black px-2 py-1 rounded-md border",
                            trendBg || subtextBg,
                            trendColor || 'text-slate-600',
                            "border-white/40 shadow-sm"
                        )}>
                            {trend || subtext}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )

    if (href) {
        return <Link href={href}>{Content}</Link>
    }

    return Content
}
