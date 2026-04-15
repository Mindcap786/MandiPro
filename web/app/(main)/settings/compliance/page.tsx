"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Lock, Server, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const CATEGORIES = ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"];
const STATUS_CONFIG = {
    implemented: { label: "Implemented ✓", color: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
    in_progress: { label: "In Progress", color: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
    not_started: { label: "Not Started", color: "text-slate-500 bg-slate-50 border-slate-200", dot: "bg-slate-300" },
    not_applicable: { label: "N/A", color: "text-slate-400 bg-slate-50 border-slate-100", dot: "bg-slate-200" },
};

export default function SOC2Page() {
    const { profile } = useAuth();
    const [controls, setControls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string[]>(["Security"]);
    const [updating, setUpdating] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<any>(null);
    const [activeTab, setActiveTab] = useState("business");
    const isSuperAdmin = profile?.role === 'super_admin';
    const [isVisible, setIsVisible] = useState(isSuperAdmin);
    const [orgData, setOrgData] = useState<any>(null);
    const [bankCount, setBankCount] = useState(0);
    const [commodityCount, setCommodityCount] = useState(0);

    useEffect(() => {
        if (profile?.organization_id) { 
            fetchVisibility();
            fetchControls(); 
            fetchMetrics(); 
            fetchBusinessData();
        }
    }, [profile, isSuperAdmin]);

    const fetchVisibility = async () => {
        if (isSuperAdmin) return; // Super admin always sees it
        const { data, error } = await supabase.schema('core')
            .from('platform_branding_settings')
            .select('is_compliance_visible_to_tenants')
            .maybeSingle();
        
        if (data && !error) {
            setIsVisible(data.is_compliance_visible_to_tenants);
        } else {
            setIsVisible(false); // Default to restriction on failure
        }
    };

    const fetchBusinessData = async () => {
        // Fetch Org Info (GST, etc.)
        const { data: org } = await supabase.from('organizations').select('*').eq('id', profile?.organization_id).single();
        if (org) setOrgData(org);

        // Fetch Banks from 'mandi' schema 'accounts' table
        const { count: bCount } = await supabase.schema('mandi')
            .from('accounts')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', profile?.organization_id)
            .eq('type', 'asset')
            .eq('account_sub_type', 'bank');
        setBankCount(bCount || 0);

        // Fetch Commodities from 'mandi' schema
        const { count: cCount } = await supabase.schema('mandi')
            .from('commodities')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', profile?.organization_id);
        setCommodityCount(cCount || 0);
    };

    const fetchControls = async () => {
        setLoading(true);
        const { data } = await supabase.from("compliance_controls")
            .select("*")
            .eq("organization_id", profile?.organization_id)
            .order("control_id");
        if (data) setControls(data);
        setLoading(false);
    };

    const fetchMetrics = async () => {
        try {
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/observability/health`,
                { headers: { "Content-Type": "application/json" } }
            );
            const json = await res.json();
            setMetrics(json?.data);
        } catch { /* ignore */ }
    };

    const updateControl = async (controlId: string, updates: any) => {
        setUpdating(controlId);
        await supabase.from("compliance_controls")
            .update({ ...updates, last_reviewed_at: new Date().toISOString().split("T")[0] })
            .eq("organization_id", profile?.organization_id)
            .eq("control_id", controlId);
        setUpdating(null);
        fetchControls();
    };

    const byCategory = CATEGORIES.reduce((acc, cat) => {
        acc[cat] = controls.filter(c => c.category === cat);
        return acc;
    }, {} as Record<string, any[]>);

    const totalImplemented = controls.filter(c => c.status === "implemented").length;
    const totalControls = controls.filter(c => c.status !== "not_applicable").length;
    const score = totalControls > 0 ? Math.round((totalImplemented / totalControls) * 100) : 0;

    const catScore = (cat: string) => {
        const items = byCategory[cat] || [];
        const applicable = items.filter(c => c.status !== "not_applicable");
        const done = applicable.filter(c => c.status === "implemented").length;
        return applicable.length > 0 ? Math.round((done / applicable.length) * 100) : 0;
    };

    const CAT_ICONS: Record<string, any> = {
        Security: Lock, Availability: Server, "Processing Integrity": CheckCircle2,
        Confidentiality: Eye, Privacy: Shield,
    };

    if (!isVisible && profile?.role !== 'super_admin') {
        return (
            <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-6">
                <Card className="max-w-md w-full text-center p-8 bg-white/50 backdrop-blur-xl border-slate-200 shadow-2xl rounded-[32px]">
                    <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-8 h-8 text-amber-500" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Access Restricted</h2>
                    <p className="text-slate-500 font-medium text-sm mb-8">This module has been restricted by the platform administrator. Please contact support if you require compliance documentation.</p>
                    <Button onClick={() => window.history.back()} variant="outline" className="rounded-xl border-slate-200">Go Back</Button>
                </Card>
            </div>
        );
    }

    const businessControls = [
        { title: "GST Registration", status: orgData?.gst_number ? "implemented" : "not_started", desc: "GSTIN linked to the organization profile." },
        { title: "Bank Account Verification", status: bankCount > 0 ? "implemented" : "not_started", desc: "At least one active bank account for settlement." },
        { title: "Trading License", status: orgData?.mandi_license_no ? "implemented" : "not_started", desc: "Valid APMC/Mandi trading license configured." },
        { title: "Inventory Setup", status: commodityCount > 0 ? "implemented" : "not_started", desc: "Commodities registered for trading." },
    ];

    return (
        <ProtectedRoute requiredPermission="manage_settings">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div>
                                <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                                    <Shield className="w-7 h-7 text-indigo-600" /> Compliance 
                                </h1>
                                <p className="text-slate-400 font-bold text-sm mt-0.5">Trust, Security & Regulatory Governance Dashboard</p>
                            </div>
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-slate-100 p-1 rounded-2xl">
                                <TabsList className="bg-transparent border-none">
                                    <TabsTrigger value="business" className="rounded-xl px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">Business</TabsTrigger>
                                    <TabsTrigger value="security" className="rounded-xl px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">Platform</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <Button onClick={() => { fetchControls(); fetchMetrics(); fetchBusinessData(); }} variant="outline" size="icon" className="rounded-xl">
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsContent value="business" className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="md:col-span-1 bg-indigo-600 text-white rounded-[32px] border-none shadow-xl overflow-hidden relative">
                                    <div className="absolute top-0 right-0 p-8 opacity-10">
                                        <Shield className="w-32 h-32" />
                                    </div>
                                    <CardContent className="p-8 relative z-10">
                                        <div className="flex flex-col h-full justify-between gap-12">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">Business Readiness</p>
                                                <h3 className="text-4xl font-black tracking-tighter uppercase italic">Mandate Score</h3>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-5xl font-black italic">{Math.round((businessControls.filter(c => c.status === 'implemented').length / businessControls.length) * 100)}%</span>
                                                    <Badge className="bg-white/20 text-white border-white/30 rounded-lg">Verified</Badge>
                                                </div>
                                                <Progress value={(businessControls.filter(c => c.status === 'implemented').length / businessControls.length) * 100} className="h-3 bg-white/20" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="md:col-span-2 space-y-4">
                                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest ml-1">Regulatory Markers</h3>
                                    {businessControls.map(item => (
                                        <Card key={item.title} className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-all">
                                            <CardContent className="p-5 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.status === 'implemented' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400")}>
                                                        {item.status === 'implemented' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-800 text-sm tracking-tight">{item.title}</p>
                                                        <p className="text-xs text-slate-400 font-medium">{item.desc}</p>
                                                    </div>
                                                </div>
                                                <Badge className={cn("rounded-lg border-none", item.status === 'implemented' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                                                    {item.status === 'implemented' ? "Pass" : "Required"}
                                                </Badge>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="security" className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
                             {/* Overall Score */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="col-span-1 bg-white rounded-[28px] border border-slate-200 shadow-sm p-8 flex flex-col items-center justify-center">
                                    <div className="relative w-28 h-28">
                                        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                                            <circle cx="60" cy="60" r="50" fill="none"
                                                stroke={score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444"}
                                                strokeWidth="12"
                                                strokeDasharray={`${score * 3.14} 314`}
                                                strokeLinecap="round" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <p className="text-3xl font-[1000] text-slate-800">{score}%</p>
                                            <p className="text-[9px] font-black uppercase text-slate-400">Ready</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-slate-600 mt-4">{totalImplemented}/{totalControls} controls</p>
                                </div>

                                <div className="col-span-2 space-y-3">
                                    {CATEGORIES.map(cat => {
                                        const cs = catScore(cat);
                                        const CatIcon = CAT_ICONS[cat];
                                        return (
                                            <div key={cat} className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                                <CatIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                        <span>{cat}</span><span>{cs}%</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all"
                                                            style={{ width: `${cs}%`, backgroundColor: cs >= 70 ? "#10b981" : cs >= 40 ? "#f59e0b" : "#ef4444" }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* System Health */}
                            {metrics && (
                                <div className="bg-white border border-slate-200 rounded-[28px] p-6 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                                            <Server className="w-6 h-6 text-emerald-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase text-emerald-600 tracking-widest">Platform Pulse</p>
                                            <p className="text-lg font-black text-slate-800 tracking-tight">System Operational</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-8">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DB Latency</p>
                                            <p className="text-sm font-black text-slate-700">{metrics.db_latency_ms}ms</p>
                                        </div>
                                        <div className="text-right border-l pl-8 border-slate-100">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last Probe</p>
                                            <p className="text-sm font-black text-slate-700">{format(new Date(metrics.timestamp), "HH:mm:ss")}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Detailed Controls */}
                            <div className="space-y-4">
                                {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                                    : CATEGORIES.map(cat => {
                                        const items = byCategory[cat] || [];
                                        const isExpanded = expanded.includes(cat);
                                        const CatIcon = CAT_ICONS[cat];
                                        return (
                                            <div key={cat} className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
                                                <button onClick={() => setExpanded(prev =>
                                                    prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                                                )} className="w-full flex items-center justify-between p-6 hover:bg-slate-50/50 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                                                            <CatIcon className="w-4 h-4 text-indigo-600" />
                                                        </div>
                                                        <div className="text-left">
                                                            <p className="font-black text-slate-800">{cat}</p>
                                                            <p className="text-xs text-slate-400 font-bold">{items.length} controls · {catScore(cat)}% implemented</p>
                                                        </div>
                                                    </div>
                                                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-300" /> : <ChevronRight className="w-5 h-5 text-slate-300" />}
                                                </button>

                                                {isExpanded && (
                                                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                                                        {items.map(ctrl => {
                                                            const sc = STATUS_CONFIG[ctrl.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.not_started;
                                                            return (
                                                                <div key={ctrl.control_id} className="px-6 py-4 flex items-start justify-between gap-4">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-3">
                                                                            <code className="text-[9px] font-mono font-black text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded">
                                                                                {ctrl.control_id}
                                                                            </code>
                                                                            <p className="font-black text-slate-700 text-sm">{ctrl.title}</p>
                                                                        </div>
                                                                        {ctrl.description && (
                                                                            <p className="text-xs text-slate-400 font-bold mt-1 ml-12">{ctrl.description}</p>
                                                                        )}
                                                                        {ctrl.last_reviewed_at && (
                                                                            <p className="text-[9px] font-mono text-slate-300 mt-1 ml-12">
                                                                                Reviewed: {format(new Date(ctrl.last_reviewed_at), "dd MMM yyyy")}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                        <select
                                                                            value={ctrl.status}
                                                                            onChange={e => updateControl(ctrl.control_id, { status: e.target.value })}
                                                                            className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg border cursor-pointer", sc.color)}
                                                                            disabled={profile?.role !== 'super_admin'}
                                                                        >
                                                                            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                                                                <option key={k} value={k}>{v.label}</option>
                                                                            ))}
                                                                        </select>
                                                                        {updating === ctrl.control_id && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </ProtectedRoute>
    );
}
