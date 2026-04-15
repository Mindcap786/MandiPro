"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle, Database, ShieldAlert, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

export function SystemHealthDashboard() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [health, setHealth] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [lastCheck, setLastCheck] = useState<Date | null>(null);

    const runCheck = async () => {
        if (!profile?.organization_id) return;
        setLoading(true);
        try {
            // 1. Run Integrity Check RPC
            const { data: integrityData, error: rpcError } = await supabase.rpc('check_system_integrity', {
                p_organization_id: profile.organization_id
            });
            if (rpcError) throw rpcError;

            // 2. Fetch Active Alerts
            const { data: alertData, error: alertError } = await supabase
                .from('system_alerts')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .order('severity', { ascending: true }) // CRITICAL first (if sorted alphabetically? No. Need custom sort or rely on severity text)
                .neq('status', 'RESOLVED')
                .limit(10);

            if (alertError) throw alertError;

            setHealth(integrityData);
            setAlerts(alertData || []);
            setLastCheck(new Date());

        } catch (e) {
            console.error("Health Check Failed", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        runCheck();
        // Poll every 60s
        const interval = setInterval(runCheck, 60000);
        return () => clearInterval(interval);
    }, [profile]);

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'CRITICAL': return 'bg-red-500/10 text-red-500 border-red-500/50';
            case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/50';
            case 'MEDIUM': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/50';
            default: return 'bg-gray-500/10 text-gray-500';
        }
    };

    return (
        <Card className="bg-black/40 border-white/5 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <div className="space-y-1">
                    <CardTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-neon-blue" />
                        System Health Monitor
                    </CardTitle>
                    <CardDescription className="text-[10px] font-mono text-gray-400">
                        {loading ? 'Scanning Neural Grid...' : `Last Scan: ${lastCheck?.toLocaleTimeString()}`}
                    </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={runCheck} disabled={loading} className="h-8 w-8 p-0 rounded-full hover:bg-white/10">
                    <Loader2 className={`w-4 h-4 text-neon-blue ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Status Grid */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center gap-2">
                        <div className={`p-2 rounded-full ${alerts.length > 0 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {alerts.length > 0 ? <ShieldAlert className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Business Rules</h4>
                            <p className="text-sm font-bold text-white">{alerts.length === 0 ? 'All Systems Go' : `${alerts.length} Rules Violated`}</p>
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-2 rounded-full bg-blue-500/10 text-blue-500">
                            <Database className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Ledger Balance</h4>
                            <p className="text-sm font-bold text-white">
                                {health?.ledger_imbalance === 0 ? 'Perfect Zero' : `⚠️ GAP: ${health?.ledger_imbalance}`}
                            </p>
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-2 rounded-full bg-purple-500/10 text-purple-500">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Stock Integrity</h4>
                            <p className="text-sm font-bold text-white">
                                {health?.negative_stock === 0 ? '100% Valid' : `${health?.negative_stock} Negative Lots`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Critical Alerts List */}
                {alerts.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Active Integrity Alerts
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {alerts.map((alert) => (
                                <div key={alert.id} className={`p-3 rounded-lg border flex items-start justify-between gap-4 ${getSeverityColor(alert.severity)} bg-black/40`}>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-[8px] font-black px-1.5 py-0 border-current`}>
                                                {alert.severity}
                                            </Badge>
                                            <span className="text-xs font-bold tracking-tight">{alert.alert_type}</span>
                                        </div>
                                        <p className="text-[10px] opacity-80 font-mono leading-relaxed">
                                            {JSON.stringify(alert.details)}
                                        </p>
                                    </div>
                                    <span className="text-[8px] font-mono opacity-50 whitespace-nowrap">
                                        {new Date(alert.created_at).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
