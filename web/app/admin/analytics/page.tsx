'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    TrendingUp, TrendingDown, DollarSign, Users, RefreshCw,
    BarChart3, PieChart, Target, Activity, ArrowUpRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface BillingStats {
    mrr: number; arr: number; arpu: number; churn_rate: number;
    active_tenants: number; total_tenants: number; suspended_count: number;
    pending_revenue: number; plan_distribution: any[]; revenue_trend: any[];
    plans: any[]; alert_counts: any;
}

function StatCard({ label, value, sub, icon: Icon, trend, color }: any) {
    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                        <p className={cn('text-2xl font-black tracking-tighter', color || 'text-slate-800')}>{value}</p>
                        {sub && <p className="text-xs text-slate-400 font-medium mt-0.5">{sub}</p>}
                    </div>
                    <div className={cn('p-2.5 rounded-xl', color?.includes('emerald') ? 'bg-emerald-50' : color?.includes('blue') ? 'bg-blue-50' : 'bg-slate-50')}>
                        <Icon className={cn('w-4 h-4', color || 'text-slate-400')} />
                    </div>
                </div>
                {trend && (
                    <div className={cn('flex items-center gap-1 mt-3 text-[10px] font-black', trend > 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(trend)}% vs last month
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function MiniBarChart({ data }: { data: Array<{ label: string; revenue: number }> }) {
    const max = Math.max(...data.map(d => d.revenue), 1);
    return (
        <div className="flex items-end gap-1.5 h-20">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                        className={cn('w-full rounded-t-sm transition-all', i === data.length - 1 ? 'bg-blue-500' : 'bg-blue-200')}
                        style={{ height: `${(d.revenue / max) * 100}%`, minHeight: d.revenue > 0 ? '4px' : '2px' }}
                    />
                    <span className="text-[8px] text-slate-400 font-bold rotating-label">{d.label}</span>
                </div>
            ))}
        </div>
    );
}

export default function AnalyticsPage() {
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [statsRes, eventsRes] = await Promise.allSettled([
                fetch('/api/admin/billing/stats').then(r => r.json()),
                supabase.schema('core')
                    .from('subscription_events')
                    .select('id, event_type, organization_id, triggered_by, created_at, old_status, new_status, amount')
                    .order('created_at', { ascending: false })
                    .limit(20)
            ]);

            if (statsRes.status === 'fulfilled') setStats(statsRes.value);
            if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value.data || []);
        } catch (e) {
            console.error('[Analytics] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const EVENT_COLORS: Record<string, string> = {
        'trial.started':           'bg-green-100 text-green-700',
        'trial.expired':           'bg-red-100 text-red-700',
        'trial.reminder_sent':     'bg-amber-100 text-amber-700',
        'subscription.activated':  'bg-blue-100 text-blue-700',
        'subscription.cancelled':  'bg-slate-100 text-slate-700',
        'subscription.expired':    'bg-red-100 text-red-700',
        'payment.succeeded':       'bg-emerald-100 text-emerald-700',
        'payment.failed':          'bg-red-100 text-red-700',
        'admin.plan_assigned':     'bg-violet-100 text-violet-700',
        'admin.trial_extended':    'bg-teal-100 text-teal-700',
        'lock.soft_started':       'bg-red-200 text-red-800',
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const planDist = stats?.plan_distribution || [];
    const totalActiveSubs = stats?.active_tenants || 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Revenue Analytics</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Real-time subscription and revenue metrics</p>
                </div>
                <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Monthly Recurring Revenue" value={`₹${(stats?.mrr || 0).toLocaleString('en-IN')}`} sub={`ARR: ₹${(stats?.arr || 0).toLocaleString('en-IN')}`} icon={DollarSign} color="text-emerald-600" trend={12.4} />
                <StatCard label="Active Subscribers" value={stats?.active_tenants || 0} sub={`${stats?.total_tenants || 0} total tenants`} icon={Users} color="text-blue-600" />
                <StatCard label="ARPU" value={`₹${Math.round(stats?.arpu || 0).toLocaleString('en-IN')}`} sub="avg revenue per user" icon={TrendingUp} color="text-violet-600" />
                <StatCard label="Churn Rate" value={`${stats?.churn_rate || 0}%`} sub={`${stats?.suspended_count || 0} suspended`} icon={TrendingDown} color={stats?.churn_rate > 5 ? 'text-red-500' : 'text-slate-600'} />
            </div>

            {/* Revenue Trend + Plan Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Revenue Trend */}
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" /> Revenue Trend (6 months)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <MiniBarChart data={(stats?.revenue_trend || []).map((d: any) => ({ label: d.label, revenue: d.revenue }))} />
                        <div className="flex justify-between mt-2">
                            {(stats?.revenue_trend || []).map((d: any) => (
                                <div key={d.month} className="text-center">
                                    <p className="text-[9px] text-slate-400 font-bold">{d.label}</p>
                                    <p className="text-[10px] font-black text-slate-600">₹{(d.revenue / 1000).toFixed(0)}k</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Plan Distribution */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <PieChart className="w-4 h-4" /> Plan Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {planDist.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No active subscribers yet</p>
                        ) : planDist.map((plan: any) => {
                            const pct = totalActiveSubs > 0 ? Math.round((plan.count / totalActiveSubs) * 100) : 0;
                            const barColors: Record<string, string> = { basic: 'bg-slate-400', standard: 'bg-blue-500', enterprise: 'bg-violet-500' };
                            return (
                                <div key={plan.name} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-700 capitalize">{plan.display_name || plan.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-400">{plan.count} orgs</span>
                                            <span className="font-black text-slate-700">{pct}%</span>
                                        </div>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full">
                                        <div className={cn('h-full rounded-full', barColors[plan.name] || 'bg-slate-400')} style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className="text-[10px] text-slate-400">MRR: ₹{plan.mrr.toLocaleString('en-IN')}</p>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            {/* Alert Counts */}
            {stats?.alert_counts && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                        { key: 'expiring_trials', label: 'Trials Expiring', urgency: 'warn' },
                        { key: 'trialing', label: 'In Trial', urgency: 'ok' },
                        { key: 'expiring_subs', label: 'Renewals Due', urgency: 'warn' },
                        { key: 'grace_period', label: 'Grace Period', urgency: 'danger' },
                        { key: 'suspended', label: 'Suspended', urgency: 'danger' },
                    ].map(({ key, label, urgency }) => (
                        <div key={key} className={cn('rounded-xl p-4 text-center border', urgency === 'danger' ? 'bg-red-50 border-red-100' : urgency === 'warn' ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100')}>
                            <div className={cn('text-3xl font-black', urgency === 'danger' ? 'text-red-600' : urgency === 'warn' ? 'text-amber-600' : 'text-emerald-600')}>
                                {stats.alert_counts[key] || 0}
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-wider">{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Recent Subscription Events */}
            <Card className="shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Recent Subscription Events
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {events.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No events recorded yet. Events are logged here as subscriptions change.</p>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {events.map((evt: any) => (
                                <div key={evt.id} className="flex items-center gap-3 py-3">
                                    <div className={cn('text-[10px] font-black px-2 py-1 rounded-lg border-0', EVENT_COLORS[evt.event_type] || 'bg-slate-100 text-slate-600')}>
                                        {evt.event_type}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-500 truncate">
                                            Org: <span className="font-mono text-slate-400 text-[10px]">{evt.organization_id?.slice(0, 12)}...</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {evt.amount && <p className="text-xs font-bold text-slate-700">₹{Number(evt.amount).toLocaleString('en-IN')}</p>}
                                        <p className="text-[10px] text-slate-400">{evt.created_at ? format(new Date(evt.created_at), 'dd MMM · HH:mm') : '—'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
