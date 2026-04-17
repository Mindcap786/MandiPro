'use client';

import { useEffect, useState } from 'react';
import {
    DollarSign, TrendingUp, CreditCard, AlertCircle, RefreshCw,
    Users, BarChart3, Clock, Loader2,
    CheckCircle2, XCircle, Zap, FileText, ChevronRight, Activity, Tag, Key, Ticket,
    Bell, AlertTriangle, Timer, ShieldOff
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';

const PLAN_COLORS: Record<string, string> = {
    basic: 'bg-gray-500',
    standard: 'bg-blue-500',
    enterprise: 'bg-indigo-600',
};

export default function BillingOverviewPage() {
    const { toast } = useToast();
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [tenants, setTenants] = useState<any[]>([]);
    const [selectedTenantId, setSelectedTenantId] = useState<string>('');
    const [isPlanBuilderOpen, setIsPlanBuilderOpen] = useState(false);
    const [customPlan, setCustomPlan] = useState({
        name: '',
        price_monthly: 0,
        max_web_users: 5,
        max_mobile_users: 10,
        storage_gb: 1,
        enabled_modules: ['mandi']
    });

    useEffect(() => { 
        fetchData(); 
        fetchTenants();
    }, []);

    const getHeaders = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
        };
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/billing/stats', { headers: await getHeaders() });
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
        } catch (e) {
            toast({ title: 'Error fetching stats', variant: 'destructive' });
        }
        setLoading(false);
    };

    const fetchTenants = async () => {
        try {
            const res = await fetch('/api/admin/tenants', { headers: await getHeaders() });
            if (!res.ok) throw new Error('Failed to fetch tenants');
            const data = await res.json();
            setTenants(Array.isArray(data) ? data : []);
        } catch (e) {
            setTenants([]);
        }
    };

    const handleAction = async (actionId: string, payload: any = {}) => {
        if (!selectedTenantId) {
            toast({ title: 'Select a tenant first', variant: 'destructive' });
            return;
        }
        setActionLoading(true);
        try {
            const res = await fetch('/api/admin/billing/actions', {
                method: 'POST',
                headers: await getHeaders(),
                body: JSON.stringify({
                    action: actionId,
                    organization_id: selectedTenantId,
                    payload
                })
            });
            if (!res.ok) throw new Error('Action failed');
            toast({ title: 'Success', description: `Action ${actionId} completed` });
            fetchData();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
        setActionLoading(false);
    };

    const saveCustomPlan = async () => {
        if (!selectedTenantId || !customPlan.name) return;
        setActionLoading(true);
        try {
            const res = await fetch('/api/admin/billing/custom-plan', {
                method: 'POST',
                headers: await getHeaders(),
                body: JSON.stringify({ organization_id: selectedTenantId, ...customPlan })
            });
            if (!res.ok) throw new Error('Failed to save custom plan');
            toast({ title: 'Plan Created' });
            setIsPlanBuilderOpen(false);
            fetchTenants();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

    if (loading && !stats) {
        return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-1">Billing Overview</h1>
                    <p className="text-slate-500 font-medium text-sm">Real-time revenue metrics and tenant subscription control.</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/admin/billing/gateways">
                        <Button variant="outline" className="border-slate-200">
                            <Key className="w-4 h-4 mr-2" /> Gateways
                        </Button>
                    </Link>
                    <Link href="/admin/billing/coupons">
                        <Button variant="outline" className="border-slate-200">
                            <Ticket className="w-4 h-4 mr-2" /> Coupons
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'MRR', value: fmt(stats?.mrr), icon: DollarSign, color: 'text-indigo-600', sub: `₹${(stats?.arpu || 0).toFixed(0)} ARPU` },
                    { label: 'ARR', value: fmt(stats?.arr), icon: TrendingUp, color: 'text-emerald-500', sub: 'Projected annual' },
                    { label: 'Active Tenants', value: stats?.active_tenants, icon: Users, color: 'text-blue-500', sub: `${stats?.total_tenants} total` },
                    { label: 'Suspended', value: stats?.suspended_count, icon: AlertCircle, color: 'text-red-500', sub: `${stats?.churn_rate}% Churn` },
                ].map(k => (
                    <Card key={k.label} className="bg-white shadow-sm border-slate-200">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k.label}</p>
                                <k.icon className={cn("w-4 h-4", k.color)} />
                            </div>
                            <p className={cn("text-2xl font-black", k.color)}>{k.value}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{k.sub}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Alert Dashboard */}
            {stats?.alert_counts && (
                <Card className="bg-white shadow-sm border-amber-200 border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                            <Bell className="w-4 h-4 text-amber-500" /> Subscription Alert Dashboard
                            <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live</span>
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs">Tenants requiring immediate attention</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                {
                                    label: 'Trial Expiring (≤7d)',
                                    value: stats.alert_counts.expiring_trials,
                                    icon: Timer,
                                    color: 'text-yellow-600',
                                    bg: 'bg-yellow-50 border-yellow-200',
                                    href: '/admin/tenants?status=trial'
                                },
                                {
                                    label: 'Sub Expiring (≤7d)',
                                    value: stats.alert_counts.expiring_subs,
                                    icon: AlertTriangle,
                                    color: 'text-orange-600',
                                    bg: 'bg-orange-50 border-orange-200',
                                    href: '/admin/tenants?status=expiring_soon'
                                },
                                {
                                    label: 'Grace Period',
                                    value: stats.alert_counts.grace_period,
                                    icon: Clock,
                                    color: 'text-orange-700',
                                    bg: 'bg-orange-100 border-orange-300',
                                    href: '/admin/tenants?status=grace_period'
                                },
                                {
                                    label: 'Suspended',
                                    value: stats.alert_counts.suspended,
                                    icon: ShieldOff,
                                    color: 'text-red-600',
                                    bg: 'bg-red-50 border-red-200',
                                    href: '/admin/tenants?status=suspended'
                                },
                            ].map(a => (
                                <Link key={a.label} href={a.href}>
                                    <div className={cn(
                                        "p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md group",
                                        a.bg
                                    )}>
                                        <div className="flex items-center justify-between mb-2">
                                            <a.icon className={cn("w-4 h-4", a.color)} />
                                            <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <p className={cn("text-2xl font-black", a.color)}>
                                            {a.value ?? '—'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{a.label}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Plan Distribution */}
                <Card className="bg-white shadow-sm border-slate-200 lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-600" /> Plan Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(stats?.plan_distribution || []).map((plan: any) => {
                            const pct = Math.round((plan.count / (stats.active_tenants || 1)) * 100);
                            const colorClass = PLAN_COLORS[plan.name] || 'bg-gray-500';
                            return (
                                <div key={plan.name} className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="capitalize">{plan.display_name}</span>
                                        <span>{plan.count} ({pct}%)</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={cn("h-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {/* Subscription Lifecycle Actions */}
                <Card className="bg-white shadow-sm border-slate-200 lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-500" /> Lifecycle Control
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <select 
                            className="w-full bg-slate-50 border border-slate-200 text-sm rounded-lg p-2.5 font-bold"
                            value={selectedTenantId}
                            onChange={(e) => setSelectedTenantId(e.target.value)}
                        >
                            <option value="">Select Tenant</option>
                            {tenants.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" className="font-bold text-[10px] uppercase" onClick={() => handleAction('reactivate')} disabled={!selectedTenantId || actionLoading}>Reactivate</Button>
                            <Button variant="outline" size="sm" className="font-bold text-[10px] uppercase text-red-500" onClick={() => handleAction('suspend')} disabled={!selectedTenantId || actionLoading}>Suspend</Button>
                            <Button variant="outline" size="sm" className="font-bold text-[10px] uppercase col-span-2" onClick={() => setIsPlanBuilderOpen(true)} disabled={!selectedTenantId || actionLoading}>Custom Plan</Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Revenue Trend */}
                <Card className="bg-white shadow-sm border-slate-200 lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" /> Monthly Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[120px] flex items-end gap-2">
                            {(stats?.revenue_trend || []).map((t: any, i: number) => {
                                const maxRev = Math.max(...(stats?.revenue_trend?.map((x: any) => x.revenue) || [1]));
                                const height = maxRev > 0 ? (t.revenue / maxRev) * 100 : 5;
                                return (
                                    <div key={i} className="flex-1 bg-emerald-500/20 border-t border-emerald-400 rounded-t" style={{ height: `${Math.max(10, height)}%` }} title={`${t.label}: ${fmt(t.revenue)}`} />
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-2 text-[8px] font-black text-slate-400">
                            <span>{(stats?.revenue_trend || [])[0]?.label}</span>
                            <span>{(stats?.revenue_trend || []).slice(-1)[0]?.label}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Custom Plan Builder Dialog */}
            <Dialog open={isPlanBuilderOpen} onOpenChange={setIsPlanBuilderOpen}>
                <DialogContent className="bg-white">
                    <DialogHeader><DialogTitle className="font-black">Custom Plan Builder</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input placeholder="Plan Name" value={customPlan.name} onChange={e => setCustomPlan({...customPlan, name: e.target.value.toUpperCase()})} />
                        <Input type="number" placeholder="Monthly Price" value={customPlan.price_monthly} onChange={e => setCustomPlan({...customPlan, price_monthly: parseFloat(e.target.value)})} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input type="number" placeholder="Web Users" value={customPlan.max_web_users} onChange={e => setCustomPlan({...customPlan, max_web_users: parseInt(e.target.value)})} />
                            <Input type="number" placeholder="Mobile Users" value={customPlan.max_mobile_users} onChange={e => setCustomPlan({...customPlan, max_mobile_users: parseInt(e.target.value)})} />
                        </div>
                        <Button className="w-full bg-indigo-600 font-black h-12" onClick={saveCustomPlan} disabled={actionLoading}>Update Tenant Plan</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
