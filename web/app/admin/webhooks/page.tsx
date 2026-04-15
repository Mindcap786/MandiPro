'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface WebhookEvent {
    id: string; gateway: string; event_id: string; event_type: string;
    organization_id: string | null; status: string; payload: any;
    error_message: string | null; received_at: string; processed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
    processed: 'bg-emerald-100 text-emerald-700',
    failed:    'bg-red-100 text-red-700',
    skipped:   'bg-slate-100 text-slate-600',
    duplicate: 'bg-amber-100 text-amber-700',
};

const GATEWAY_STYLES: Record<string, string> = {
    razorpay: 'bg-blue-100 text-blue-700',
    stripe:   'bg-violet-100 text-violet-700',
    smepay:   'bg-orange-100 text-orange-700',
};

export default function WebhooksPage() {
    const [events, setEvents] = useState<WebhookEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'failed' | 'processed' | 'razorpay' | 'stripe'>('all');
    const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            let query = supabase
                .schema('core')
                .from('webhook_events')
                .select('*')
                .order('received_at', { ascending: false })
                .limit(100);

            if (filter === 'failed') query = query.eq('status', 'failed');
            else if (filter === 'processed') query = query.eq('status', 'processed');
            else if (filter === 'razorpay') query = query.eq('gateway', 'razorpay');
            else if (filter === 'stripe') query = query.eq('gateway', 'stripe');

            const { data } = await query;
            setEvents(data || []);
        } catch (e) {
            console.error('[Webhooks] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, [filter]);

    const failedCount = events.filter(e => e.status === 'failed').length;
    const processedCount = events.filter(e => e.status === 'processed').length;
    const duplicateCount = events.filter(e => e.status === 'duplicate').length;

    const StatusIcon = ({ status }: { status: string }) => {
        if (status === 'processed') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
        if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
        if (status === 'duplicate') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
        return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Webhook Monitor</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Real-time incoming webhook events from payment gateways</p>
                </div>
                <button onClick={fetchEvents} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="shadow-sm">
                    <CardContent className="p-4 text-center">
                        <div className="text-3xl font-black text-emerald-600">{processedCount}</div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">Processed</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4 text-center">
                        <div className={cn('text-3xl font-black', failedCount > 0 ? 'text-red-600' : 'text-slate-400')}>{failedCount}</div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">Failed</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="p-4 text-center">
                        <div className="text-3xl font-black text-amber-500">{duplicateCount}</div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">Duplicates Caught</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'processed', 'failed', 'razorpay', 'stripe'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all',
                            filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                        )}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Events Table */}
            <Card className="shadow-sm">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : events.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-slate-400">No webhook events found.</p>
                            <p className="text-xs text-slate-300 mt-1">Events appear here when payment gateways send webhooks.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {/* Table Header */}
                            <div className="grid grid-cols-6 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50">
                                <div>Status</div>
                                <div>Gateway</div>
                                <div className="col-span-2">Event Type</div>
                                <div>Received</div>
                                <div>Actions</div>
                            </div>

                            {events.map((evt) => (
                                <div key={evt.id} className="grid grid-cols-6 px-5 py-3 items-center hover:bg-slate-50/50 transition-colors">
                                    {/* Status */}
                                    <div className="flex items-center gap-1.5">
                                        <StatusIcon status={evt.status} />
                                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_STYLES[evt.status] || 'bg-slate-100 text-slate-500')}>
                                            {evt.status}
                                        </span>
                                    </div>

                                    {/* Gateway */}
                                    <div>
                                        <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full capitalize', GATEWAY_STYLES[evt.gateway] || 'bg-slate-100 text-slate-500')}>
                                            {evt.gateway}
                                        </span>
                                    </div>

                                    {/* Event Type */}
                                    <div className="col-span-2">
                                        <p className="text-xs font-bold text-slate-700 font-mono">{evt.event_type}</p>
                                        {evt.error_message && (
                                            <p className="text-[10px] text-red-500 mt-0.5 truncate">{evt.error_message}</p>
                                        )}
                                    </div>

                                    {/* Received */}
                                    <div>
                                        <p className="text-xs text-slate-500">{format(new Date(evt.received_at), 'dd MMM HH:mm')}</p>
                                    </div>

                                    {/* Actions */}
                                    <div>
                                        <button
                                            onClick={() => setSelectedEvent(evt)}
                                            className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
                                        >
                                            <Eye className="w-3 h-3" /> View
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payload Viewer Dialog */}
            <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black">
                            Webhook Payload — {selectedEvent?.event_type}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedEvent && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><span className="text-slate-400">Gateway:</span> <strong>{selectedEvent.gateway}</strong></div>
                                <div><span className="text-slate-400">Status:</span> <strong>{selectedEvent.status}</strong></div>
                                <div><span className="text-slate-400">Event ID:</span> <span className="font-mono text-[10px]">{selectedEvent.event_id}</span></div>
                                <div><span className="text-slate-400">Received:</span> <strong>{format(new Date(selectedEvent.received_at), 'dd MMM yyyy HH:mm:ss')}</strong></div>
                            </div>
                            {selectedEvent.error_message && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                                    <p className="text-xs font-black text-red-600 mb-1">Error</p>
                                    <p className="text-xs text-red-700">{selectedEvent.error_message}</p>
                                </div>
                            )}
                            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-64">
                                <pre className="text-[10px] text-emerald-400 font-mono whitespace-pre-wrap">
                                    {JSON.stringify(selectedEvent.payload, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
