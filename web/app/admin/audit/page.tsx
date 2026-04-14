'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { format } from 'date-fns';
import {
    Loader2, Search, Shield, FileJson, Download, ChevronRight, ChevronDown,
    Filter, RefreshCw, User, Building2, Clock, Activity
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ACTION_COLORS: Record<string, string> = {
    SUSPEND:         'text-red-400 bg-red-500/10 border-red-500/20',
    ACTIVATE:        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CREATE:          'text-blue-400 bg-blue-500/10 border-blue-500/20',
    DELETE:          'text-red-400 bg-red-500/10 border-red-500/20',
    UPDATE:          'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    IMPERSONATE:     'text-purple-400 bg-purple-500/10 border-purple-500/20',
    PLAN_CHANGE:     'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    FLAG_TOGGLE:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
    BILLING:         'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    DEFAULT:         'text-slate-500 bg-white/5 border-slate-200',
};

function getActionStyle(action: string) {
    for (const [key, val] of Object.entries(ACTION_COLORS)) {
        if (action?.toUpperCase().includes(key)) return val;
    }
    return ACTION_COLORS.DEFAULT;
}

function LogRow({ log }: { log: any }) {
    const [open, setOpen] = useState(false);
    const style = getActionStyle(log.action_type);
    const hasDiff = log.before_data || log.after_data;
    return (
        <>
            <div
                className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-200 last:border-0 group"
                onClick={() => setOpen(!open)}
            >
                <div className="col-span-2 flex items-center gap-2 text-xs text-slate-500 font-mono">
                    <Clock className="w-3 h-3 flex-shrink-0 text-slate-400" />
                    {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                </div>
                <div className="col-span-2">
                    <Badge variant="outline" className={cn("text-[10px] font-black uppercase", style)}>
                        {log.action_type}
                    </Badge>
                </div>
                <div className="col-span-3 flex items-center gap-2 text-sm text-slate-900 min-w-0">
                    <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{log.actor?.email || log.admin_id || 'System'}</span>
                </div>
                <div className="col-span-3 flex items-center gap-2 text-sm text-slate-500 min-w-0">
                    <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{log.target_org?.name || '—'}</span>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-2">
                    {hasDiff && <FileJson className="w-3 h-3 text-indigo-600" />}
                    {open
                        ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-900 transition-colors" />
                        : <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-500 transition-colors" />
                    }
                </div>
            </div>
            {open && (
                <div className="bg-white shadow-sm border-b border-slate-200 px-6 py-4">
                    <div className="grid grid-cols-3 gap-4">
                        {/* Metadata */}
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Metadata</p>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex gap-2">
                                    <span className="text-slate-500 w-20 flex-shrink-0">Log ID</span>
                                    <span className="text-slate-900 font-mono truncate">{log.id}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-slate-500 w-20 flex-shrink-0">IP</span>
                                    <span className="text-slate-900 font-mono">{log.ip_address || '—'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-slate-500 w-20 flex-shrink-0">Module</span>
                                    <span className="text-slate-900">{log.module || 'admin'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-slate-500 w-20 flex-shrink-0">User Agent</span>
                                    <span className="text-slate-900 text-[10px] truncate">{log.user_agent || '—'}</span>
                                </div>
                            </div>
                        </div>
                        {/* Before */}
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-red-500/70 mb-2 flex items-center gap-1">
                                <FileJson className="w-3 h-3" /> Before
                            </p>
                            <pre className="text-[10px] text-red-400 font-mono bg-red-50 p-3 rounded-xl border border-red-500/10 overflow-auto max-h-40 leading-relaxed">
                                {log.before_data ? JSON.stringify(log.before_data, null, 2) : 'No previous state'}
                            </pre>
                        </div>
                        {/* After */}
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 mb-2 flex items-center gap-1">
                                <FileJson className="w-3 h-3" /> After
                            </p>
                            <pre className="text-[10px] text-emerald-400 font-mono bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/10 overflow-auto max-h-40 leading-relaxed">
                                {log.after_data ? JSON.stringify(log.after_data, null, 2) : 'No new state'}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default function AuditVaultPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('all');

    useEffect(() => { fetchLogs(); }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/audit-logs');
            if (res.ok) {
                const data = await res.json();
                setLogs(data || []);
            } else {
                // Fallback: try direct table query
                const { data } = await supabase
                    .schema('core')
                    .from('view_admin_audit_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(200);
                if (data) setLogs(data);
            }
        } catch {
            /* silently fail, table may be empty */
        }
        setLoading(false);
    };

    const filtered = logs.filter(l => {
        const matchSearch = !search ||
            l.actor?.email?.toLowerCase().includes(search.toLowerCase()) ||
            l.target_org?.name?.toLowerCase().includes(search.toLowerCase()) ||
            l.action_type?.toLowerCase().includes(search.toLowerCase()) ||
            l.ip_address?.includes(search);
        const matchAction = actionFilter === 'all' || l.action_type?.toUpperCase().includes(actionFilter.toUpperCase());
        return matchSearch && matchAction;
    });

    const exportCSV = () => {
        const rows = [['Timestamp', 'Action', 'Actor', 'Target', 'IP']];
        filtered.forEach(l => rows.push([
            l.created_at, l.action_type, l.actor?.email || 'System',
            l.target_org?.name || 'Global', l.ip_address || ''
        ]));
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'audit_log.csv'; a.click();
    };

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-[0.2em] uppercase mb-1">Audit Vault</h1>
                    <p className="text-slate-500 text-sm font-medium">Immutable record of all admin actions. Legal-grade compliance log.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="border-slate-200 text-slate-900 hover:bg-white/5" onClick={fetchLogs}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                    <Button variant="outline" className="border-slate-200 text-slate-900 hover:bg-white/5" onClick={exportCSV}>
                        <Download className="w-4 h-4 mr-2" /> Export CSV
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Events', value: logs.length, color: 'text-slate-900' },
                    { label: 'Filtered', value: filtered.length, color: 'text-indigo-600' },
                    { label: 'Unique Admins', value: Array.from(new Set(logs.map(l => l.actor_id))).length, color: 'text-purple-400' },
                    { label: 'Last Event', value: logs[0] ? format(new Date(logs[0].created_at), 'HH:mm:ss') : '—', color: 'text-emerald-400' },
                ].map(s => (
                    <Card key={s.label} className="bg-white shadow-sm border-slate-200">
                        <CardContent className="p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{s.label}</p>
                            <p className={cn("text-xl font-black mt-1", s.color)}>{s.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filter Bar */}
            <Card className="bg-white shadow-sm border-slate-200">
                <CardContent className="p-4 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <Input
                            placeholder="Search by admin, tenant, action, or IP..."
                            className="pl-9 bg-white/20 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-neon-blue/50"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <Select value={actionFilter} onValueChange={setActionFilter}>
                        <SelectTrigger className="w-[180px] bg-white/20 border-slate-200 text-slate-900">
                            <Filter className="w-3 h-3 mr-2 text-slate-500" />
                            <SelectValue placeholder="Action Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-50 border-slate-200 text-slate-900">
                            <SelectItem value="all">All Actions</SelectItem>
                            <SelectItem value="SUSPEND">Suspend</SelectItem>
                            <SelectItem value="ACTIVATE">Activate</SelectItem>
                            <SelectItem value="CREATE">Create</SelectItem>
                            <SelectItem value="IMPERSONATE">Impersonate</SelectItem>
                            <SelectItem value="PLAN_CHANGE">Plan Change</SelectItem>
                            <SelectItem value="FLAG">Feature Flag</SelectItem>
                            <SelectItem value="BILLING">Billing Events</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Log Table */}
            <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200">
                    {['Timestamp', 'Action', 'Actor', 'Target Tenant', ''].map((h, i) => (
                        <div key={h} className={cn(
                            "text-[10px] font-black uppercase tracking-widest text-slate-500",
                            i === 0 ? "col-span-2" : i === 1 ? "col-span-2" : i === 2 ? "col-span-3" : i === 3 ? "col-span-3" : "col-span-2"
                        )}>
                            {h}
                        </div>
                    ))}
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                    {loading ? (
                        <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <Shield className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                            <p className="text-slate-500 font-bold">No audit records found</p>
                            <p className="text-slate-400 text-xs mt-1">System is clean or filters are too narrow.</p>
                        </div>
                    ) : (
                        filtered.map(log => <LogRow key={log.id} log={log} />)
                    )}
                </div>
            </Card>
        </div>
    );
}
