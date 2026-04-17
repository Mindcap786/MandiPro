'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
    Loader2, Zap, Activity, Stethoscope, CheckCircle2, AlertTriangle, RefreshCw,
    Search, ChevronDown, ChevronRight, Package, BookOpen, ArrowUpDown,
    Wifi, Shield, Database, BarChart3, Clock, Building2,
    MessageSquare, Lightbulb, CreditCard, MailPlus, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
const REPAIR_TOOLS = [
    {
        id: 'RECALC_LEDGER', label: 'Rebuild Ledger', icon: BookOpen, color: 'text-blue-400',
        desc: 'Re-sums all ledger entries to fix balance drift from failed transactions.',
        rpc: 'admin_recalculate_ledger', danger: false
    },
    {
        id: 'RECALC_STOCK', label: 'Recalculate Stock', icon: Package, color: 'text-emerald-400',
        desc: 'Recomputes stock quantities from lot entries to fix negative stock issues.',
        rpc: 'admin_recalculate_stock', danger: false
    },
    {
        id: 'RESYNC_BALANCES', label: 'Resync Balances', icon: ArrowUpDown, color: 'text-orange-400',
        desc: 'Recalculates all party account balances from raw transaction data.',
        rpc: 'admin_resync_balances', danger: false
    },
    {
        id: 'UNLOCK_TXNS', label: 'Unlock Stuck Transactions', icon: Zap, color: 'text-yellow-400',
        desc: 'Force-completes transactions stuck in "processing" state for > 24 hours.',
        rpc: 'admin_unlock_stuck_transactions', danger: true
    },
];

function HealthBar({ label, score, icon: Icon }: { label: string; score: number; icon: any }) {
    const color = score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500';
    const textColor = score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-yellow-400' : 'text-red-400';
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                    <Icon className="w-3 h-3 text-slate-500" />
                    <span className="text-xs font-bold text-gray-300">{label}</span>
                </div>
                <span className={cn("text-xs font-black", textColor)}>{score}/100</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${score}%` }} />
            </div>
        </div>
    );
}

function TicketQueue() {
    const { toast } = useToast();
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sessionToken, setSessionToken] = useState<string | null>(null);

    // Dialog state
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [ticketStatus, setTicketStatus] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                setSessionToken(session.access_token);
                fetchTickets(session.access_token);
            } else {
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchTickets = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/support', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch tickets');
            setTickets(data.tickets || []);
        } catch (e: any) {
            toast({ title: 'Access Denied', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateTicket = async () => {
        if (!selectedTicket || !sessionToken) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/support', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    ticket_id: selectedTicket.id,
                    status: ticketStatus,
                    admin_notes: adminNotes
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update ticket');
            
            toast({ title: 'Ticket Updated', description: `Status changed to ${ticketStatus}` });
            setSelectedTicket(null);
            fetchTickets(sessionToken);
        } catch (e: any) {
            toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const openTicket = (t: any) => {
        setSelectedTicket(t);
        setTicketStatus(t.status);
        setAdminNotes(t.admin_notes || '');
    };

    const getIcon = (type: string) => {
        if (type === 'feature_request') return <Lightbulb className="w-5 h-5 text-amber-500" />;
        if (type === 'billing') return <CreditCard className="w-5 h-5 text-emerald-500" />;
        return <MessageSquare className="w-5 h-5 text-indigo-500" />;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-3">
                    <Card className="bg-white shadow-sm border-slate-200">
                        <CardHeader className="border-b border-slate-200 pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg text-slate-900 font-bold">Active Support Queue</CardTitle>
                                <CardDescription>All communications across your multi-tenant ecosystem</CardDescription>
                            </div>
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200 shadow-none font-mono pointer-events-none">
                                Total: {tickets.length}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="p-12 text-center text-slate-400">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-50 text-indigo-500" />
                                    <p>Fetching multi-tenant communications...</p>
                                </div>
                            ) : tickets.length === 0 ? (
                                <div className="p-12 text-center text-slate-400 font-medium">Inbox zero. No active support requests.</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {tickets.map((t) => (
                                        <div 
                                            key={t.id} 
                                            onClick={() => openTicket(t)}
                                            className="p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 group-hover:scale-105 transition-transform">
                                                    {getIcon(t.ticket_type)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-bold text-slate-900 line-clamp-1 max-w-[300px]">{t.subject || 'No Subject'}</h3>
                                                        {t.status === 'open' && <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 shadow-none border-none py-0 h-5 text-[10px]">NEW</Badge>}
                                                        {t.status === 'in_progress' && <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-none border-none py-0 h-5 text-[10px]">WIP</Badge>}
                                                        {t.status === 'resolved' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 shadow-none border-none py-0 h-5 text-[10px]">RESOLVED</Badge>}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                                                        <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {t.org?.name || 'Unknown Tenant'} (ID: {t.org?.tenant_id || t.organization_id.substring(0,8)})</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4 sm:mt-0 flex items-center gap-6 justify-between sm:justify-end">
                                                <div className="text-right">
                                                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">Created</p>
                                                    <p className="text-sm font-mono text-slate-700 flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5" /> {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                                                    </p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="hidden sm:flex text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100">
                                                    Review
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
                <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-[700px] shadow-2xl p-0 overflow-hidden">
                    {selectedTicket && (
                        <>
                            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-start justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-slate-200 shadow-sm">
                                        {getIcon(selectedTicket.ticket_type)}
                                    </div>
                                    <div>
                                        <DialogTitle className="text-2xl font-black mb-1">{selectedTicket.subject}</DialogTitle>
                                        <DialogDescription className="text-slate-500 font-medium flex items-center gap-2 whitespace-nowrap">
                                            <Building2 className="w-4 h-4" /> {selectedTicket.org?.name || 'Unknown'} <span className="text-slate-300">|</span> 
                                            <span className="uppercase tracking-widest text-[10px] font-bold">{selectedTicket.ticket_type.replace('_', ' ')}</span>
                                        </DialogDescription>
                                    </div>
                                </div>
                                <div className="text-right space-y-1">
                                    <Badge className="bg-white text-slate-700 border-slate-200 shadow-none pointer-events-none text-xs font-mono px-3 py-1">
                                        {selectedTicket.id.split('-')[0]}
                                    </Badge>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                        {formatDistanceToNow(new Date(selectedTicket.created_at), { addSuffix: true })}
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black tracking-widest uppercase text-slate-400 block">Tenant Message</label>
                                    <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-700 leading-relaxed whitespace-pre-wrap shadow-sm text-sm">
                                        {selectedTicket.message}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black tracking-widest uppercase text-slate-400 block">Ticket Status Status</label>
                                        <Select value={ticketStatus} onValueChange={setTicketStatus}>
                                            <SelectTrigger className="bg-white border-slate-200 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border-slate-200 text-slate-900">
                                                <SelectItem value="open" className="font-medium text-slate-700">🟢 Open (New)</SelectItem>
                                                <SelectItem value="in_progress" className="font-medium text-amber-600">🟡 In Progress / Investigating</SelectItem>
                                                <SelectItem value="resolved" className="font-medium text-emerald-600">✓ Resolved successfully</SelectItem>
                                                <SelectItem value="closed" className="font-medium text-slate-400">⨯ Closed / Dropped</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black tracking-widest uppercase text-slate-400 block flex items-center gap-1.5">
                                        Internal Resolution Notes (Hidden from Tenant)
                                    </label>
                                    <Textarea 
                                        value={adminNotes} 
                                        onChange={e => setAdminNotes(e.target.value)} 
                                        placeholder="Document the fix or communication here..." 
                                        className="min-h-[120px] bg-slate-50 border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none font-medium text-sm"
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-lg">
                                <Button variant="outline" onClick={() => setSelectedTicket(null)} className="font-bold border-slate-200 hover:bg-slate-100">Cancel</Button>
                                <Button onClick={handleUpdateTicket} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Ticket'}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DiagnosticsContent() {
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState<any>(null);
    const [health, setHealth] = useState<any>(null);
    const [tenantAlerts, setTenantAlerts] = useState<any[]>([]);
    const [scanning, setScanning] = useState(false);
    const [runningTool, setRunningTool] = useState<string | null>(null);
    const [confirmConfig, setConfirmConfig] = useState<{
        open: boolean;
        title: string;
        description: string;
        onConfirm: () => Promise<void> | void;
        variant?: 'default' | 'destructive' | 'warning';
    }>({ open: false, title: '', description: '', onConfirm: () => {} });

    const handleSearch = async (q: string) => {
        setSearch(q);
        if (q.length < 2) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const res = await fetch('/api/admin/tenants');
            const data = await res.json();
            setSearchResults((data || []).filter((t: any) =>
                t.name?.toLowerCase().includes(q.toLowerCase()) ||
                t.id?.includes(q)
            ).slice(0, 6));
        } catch {}
        setSearching(false);
    };

    const scanTenant = async (tenant: any) => {
        setSelectedTenant(tenant);
        setSearch('');
        setSearchResults([]);
        setScanning(true);
        setTenantAlerts([]);
        try {
            // Fetch full drill-down data from new API
            const [detailRes, alertsRes] = await Promise.allSettled([
                fetch(`/api/admin/tenants/${tenant.id}`).then(r => r.json()),
                supabase.schema('core').from('system_alerts')
                    .select('id, alert_type, severity, message, created_at')
                    .eq('organization_id', tenant.id)
                    .eq('is_resolved', false)
                    .order('created_at', { ascending: false })
                    .limit(10),
            ]);

            const detail = detailRes.status === 'fulfilled' ? detailRes.value : null;
            const alerts = alertsRes.status === 'fulfilled' ? (alertsRes.value.data || []) : [];
            setTenantAlerts(alerts);

            if (detail?.health) {
                setHealth({ ...detail.health, stats: { ...detail.health } });
            } else if (detail?.org) {
                // Fallback: compute from get_tenant_details RPC
                const { data, error } = await supabase.rpc('get_tenant_details', { p_org_id: tenant.id });
                if (!error && data?.stats) {
                    const ledgerScore = Math.max(0, 100 - ((data.stats.negative_ledger_count || 0) * 5));
                    const stockScore = Math.max(0, 100 - ((data.stats.negative_stock_count || 0) * 10));
                    const criticalCount = alerts.filter((a: any) => a.severity === 'critical').length;
                    const alertScore = Math.max(0, 100 - (criticalCount * 20) - ((alerts.length - criticalCount) * 5));
                    const composite = Math.round((ledgerScore + stockScore + alertScore) / 3);
                    setHealth({ ...data, scores: { ledger: ledgerScore, stock: stockScore, alerts: alertScore, composite } });
                }
            }
        } catch (e: any) {
            toast({ title: 'Scan Failed', description: e.message, variant: 'destructive' });
        }
        setScanning(false);
    };

    const runTool = async (tool: typeof REPAIR_TOOLS[0]) => {
        if (!selectedTenant) return;
        
        setConfirmConfig({
            open: true,
            title: `Run ${tool.label}?`,
            description: `Are you sure you want to execute "${tool.label}" on ${selectedTenant.name}? This action will be logged and audited.`,
            variant: tool.danger ? 'destructive' : 'default',
            onConfirm: async () => {
                setRunningTool(tool.id);
                try {
                    const { error } = await supabase.rpc(tool.rpc, { p_org_id: selectedTenant.id });
                    if (error) throw error;
                    toast({ title: 'Tool Completed', description: `${tool.label} ran successfully on ${selectedTenant.name}` });
                    await scanTenant(selectedTenant);
                } catch (e: any) {
                    toast({ title: 'Tool Failed', description: e.message || 'Unknown error', variant: 'destructive' });
                }
                setRunningTool(null);
            }
        });
    };

    return (
        <div className="mt-6 space-y-8 animate-in fade-in duration-500">
            {/* Tenant Search */}
            <Card className="bg-white shadow-sm border-slate-200">
                <CardContent className="p-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Select Tenant to Diagnose</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Search mandi by name or UUID..."
                            className="pl-9 bg-white/20 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-neon-blue/50 font-mono"
                            value={search}
                            onChange={e => handleSearch(e.target.value)}
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
                    </div>
                    {searchResults.length > 0 && (
                        <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
                            {searchResults.map(t => (
                                <div
                                    key={t.id}
                                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-slate-200 last:border-0"
                                    onClick={() => scanTenant(t)}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-slate-900 font-black text-xs">
                                        {t.name?.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{t.name}</p>
                                        <p className="text-[10px] font-mono text-slate-500">{t.id}</p>
                                    </div>
                                    <ChevronRight className="ml-auto w-4 h-4 text-slate-400" />
                                </div>
                            ))}
                        </div>
                    )}
                    {selectedTenant && (
                        <div className="mt-3 flex items-center gap-3 p-3 bg-indigo-600/10 border border-neon-blue/20 rounded-xl">
                            <Building2 className="w-4 h-4 text-indigo-600" />
                            <div>
                                <p className="text-sm font-black text-slate-900">{selectedTenant.name}</p>
                                <p className="text-[10px] font-mono text-slate-500">{selectedTenant.id}</p>
                            </div>
                            <Button size="sm" variant="outline" className="ml-auto border-neon-blue/30 text-indigo-600 hover:bg-indigo-600/10" onClick={() => scanTenant(selectedTenant)} disabled={scanning}>
                                {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Activity className="w-3 h-3 mr-1" /> Re-Scan</>}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Health Dashboard */}
            {health && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white shadow-sm border-slate-200">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                                    <Stethoscope className="w-4 h-4 text-indigo-600" /> Tenant Health Scores
                                </CardTitle>
                                <span className={cn(
                                    "text-3xl font-black",
                                    health.scores.composite >= 85 ? "text-emerald-400" : health.scores.composite >= 70 ? "text-yellow-400" : "text-red-400"
                                )}>
                                    {(health.scores?.composite ?? health.composite ?? 0)}/100
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <HealthBar label="Ledger Integrity" score={health.scores?.ledger ?? health.ledger_score ?? 100} icon={BookOpen} />
                            <HealthBar label="Stock Consistency" score={health.scores?.stock ?? health.stock_score ?? 100} icon={Package} />
                            <HealthBar label="System Alerts" score={health.scores?.alerts ?? health.alert_score ?? Math.max(0, 100 - tenantAlerts.filter((a:any) => a.severity==='critical').length * 20)} icon={Shield} />
                            <HealthBar label="Sync Health" score={tenantAlerts.length === 0 ? 100 : Math.max(0, 100 - tenantAlerts.length * 8)} icon={Database} />
                            <div className="pt-3 border-t border-slate-200 space-y-2">
                                {health.stats.negative_ledger_count > 0 && (
                                    <div className="flex items-center gap-2 text-red-400 text-xs">
                                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                        {health.stats.negative_ledger_count} negative ledger entries detected
                                    </div>
                                )}
                                {health.stats.negative_stock_count > 0 && (
                                    <div className="flex items-center gap-2 text-orange-400 text-xs">
                                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                        {health.stats.negative_stock_count} negative stock lots
                                    </div>
                                )}
                                {health.scores.composite === 100 && (
                                    <div className="flex items-center gap-2 text-emerald-400 text-xs">
                                        <CheckCircle2 className="w-3 h-3" /> All systems healthy
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-slate-900 text-base font-black flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-500" /> Self-Healing Repair Tools
                            </CardTitle>
                            <CardDescription>Each action is audited. Use with caution.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {REPAIR_TOOLS.map(tool => (
                                <div key={tool.id} className={cn(
                                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                                    tool.danger ? "border-red-500/20 bg-red-950/10 hover:bg-red-50" : "border-slate-200 bg-slate-50 hover:bg-white/5"
                                )}>
                                    <div className="flex items-start gap-3">
                                        <tool.icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", tool.color)} />
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{tool.label}</p>
                                            <p className="text-[10px] text-slate-500 leading-relaxed">{tool.desc}</p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={tool.danger ? "destructive" : "secondary"}
                                        onClick={() => runTool(tool)}
                                        disabled={runningTool !== null}
                                        className="ml-3 flex-shrink-0 text-xs"
                                    >
                                        {runningTool === tool.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RefreshCw className="w-3 h-3 mr-1" /> Run</>}
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            {!health && !selectedTenant && (
                <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-xl">
                    <Stethoscope className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold">Search for a tenant above to run diagnostics</p>
                    <p className="text-slate-400 text-sm mt-1">Health scores, error counts, and repair tools will appear here.</p>
                </div>
            )}

            <ConfirmationDialog
                open={confirmConfig.open}
                onOpenChange={(open) => setConfirmConfig({ ...confirmConfig, open })}
                title={confirmConfig.title}
                description={confirmConfig.description}
                onConfirm={confirmConfig.onConfirm}
                variant={confirmConfig.variant}
            />
        </div>
    );
}

export default function SupportOpsPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 p-8 pb-20 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-black flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-indigo-600" /> Support Hub
                    </h1>
                    <p className="text-slate-500 mt-1 uppercase tracking-widest text-xs font-bold">Network Centralised Communications</p>
                </div>

                <Tabs defaultValue="tickets" className="w-full">
                    <TabsList className="bg-slate-100 border border-slate-200 p-1 rounded-xl h-auto">
                        <TabsTrigger value="tickets" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2.5 font-bold text-sm tracking-wide">
                            Ticket Inbox
                        </TabsTrigger>
                        <TabsTrigger value="diagnostics" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2.5 font-bold text-sm tracking-wide gap-2">
                            <Stethoscope className="w-4 h-4" /> Deep Diagnostics
                        </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="tickets">
                        <Suspense fallback={<div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
                            <TicketQueue />
                        </Suspense>
                    </TabsContent>
                    
                    <TabsContent value="diagnostics">
                        <Suspense fallback={<div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
                            <DiagnosticsContent />
                        </Suspense>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
