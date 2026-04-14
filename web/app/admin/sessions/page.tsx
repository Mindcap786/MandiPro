'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Activity, XCircle, ShieldAlert, Loader2, KeyRound, MonitorSmartphone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export default function SessionsPage() {
    const { toast } = useToast();
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sessionToken, setSessionToken] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                setSessionToken(session.access_token);
                fetchSessions(session.access_token);
            } else {
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchSessions = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/sessions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch sessions');
            setSessions(data.sessions || []);
        } catch (e: any) {
            toast({ title: 'Access Denied', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleTerminate = async (sessionId: string) => {
        try {
            const res = await fetch(`/api/admin/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({ action: 'terminate_session', session_id: sessionId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to terminate');
            
            toast({ title: 'Session Terminated', description: `User will be blocked on next request.` });
            if (sessionToken) fetchSessions(sessionToken);
        } catch (e: any) {
            toast({ title: 'Permission Error', description: e.message, variant: 'destructive' });
        }
    };

    const isAdmin = (role: string) => role && role.includes('admin') || role === 'read_only';

    return (
        <div className="min-h-screen bg-white text-slate-900 p-8 pb-20 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-black flex items-center gap-3">
                        <Activity className="w-8 h-8 text-rose-500" /> Active Session Control
                    </h1>
                    <p className="text-slate-400 mt-1 uppercase tracking-widest text-xs font-bold">Bank-Grade Global Termination</p>
                </div>

                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="border-b border-slate-200 pb-4">
                        <CardTitle className="text-lg text-slate-900 font-bold flex items-center justify-between">
                            <span>Live JWT Sessions</span>
                            <Badge className="bg-slate-100 text-slate-500 border-slate-200 font-mono pointer-events-none shadow-none">Total Active: {sessions.length}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-12 text-center text-slate-500">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 opacity-50" />
                                <p>Scanning network edge for active tokens...</p>
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">No active network sessions detected.</div>
                        ) : (
                            <div className="divide-y divide-slate-200">
                                {sessions.map((s) => (
                                    <div key={s.session_id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                                {isAdmin(s.role) ? <ShieldAlert className="w-4 h-4 text-indigo-500" /> : <MonitorSmartphone className="w-4 h-4 text-slate-500" />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900 flex items-center gap-2">
                                                    {s.email}
                                                    {isAdmin(s.role) && <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-[10px] h-5 uppercase tracking-wider">Internal Admin</Badge>}
                                                    {!isAdmin(s.role) && <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] h-5 uppercase tracking-wider">Tenant User</Badge>}
                                                </p>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                                    <Globe className="w-3 h-3" /> {s.last_login_ip || 'IP Unknown'}
                                                    <span className="text-slate-300">|</span>
                                                    ID: {s.session_id.substring(0, 8)}...
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="hidden lg:block text-right text-sm">
                                                <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Session Born</p>
                                                <p className="text-slate-900 font-medium font-mono">
                                                    {s.created_at ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true }) : 'Unknown'}
                                                </p>
                                            </div>

                                            <Button 
                                                onClick={() => handleTerminate(s.session_id)}
                                                variant="outline" 
                                                className="border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-bold"
                                            >
                                                <XCircle className="w-4 h-4 mr-2" /> Kill Session
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
    );
}
