"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Smartphone, MessageSquare, Mail, AlertTriangle, Download, Save, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useStockAlerts } from "@/hooks/use-stock-alerts";
import { format } from "date-fns";

export function AlertConfigScreen() {
    const { profile } = useAuth();
    const orgId = profile?.organization_id;
    const { toast } = useToast();
    const { alerts } = useStockAlerts();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [config, setConfig] = useState<any>({
        global_low_stock_threshold: 500,
        global_critical_stock_threshold: 100,
        global_aging_warning_days: 3,
        global_aging_critical_days: 5,
        notify_whatsapp: false,
        notify_push: true,
        notify_sms: false,
        notify_email: false,
        phone_number: '',
        commodity_overrides: {}
    });

    const [items, setItems] = useState<any[]>([]);
    const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (orgId) {
            fetchConfig();
            fetchItems();
        }
    }, [orgId]);

    const fetchConfig = async () => {
        const { data, error } = await supabase
            .from('alert_config')
            .select('*')
            .eq('organization_id', orgId)
            .single();

        if (data) {
            setConfig(data);
        } else if (error && error.code === 'PGRST116') {
            // No config exists yet, we'll insert on save
            console.log("No config found, using defaults");
        }
        setLoading(false);
    };

    const fetchItems = async () => {
        const { data } = await supabase
            .schema('mandi')
            .from('commodities')
            .select('id, name')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('name');
        
        if (data) setItems(data);
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('alert_config')
                .upsert({
                    organization_id: orgId,
                    ...config
                }, { onConflict: 'organization_id' });

            if (error) throw error;

            toast({ title: "Success", description: "Alert configuration saved successfully!" });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleOverrideChange = (itemId: string, field: string, value: string) => {
        const valNum = value ? parseFloat(value) : null;
        setConfig((prev: any) => ({
            ...prev,
            commodity_overrides: {
                ...prev.commodity_overrides,
                [itemId]: {
                    ...(prev.commodity_overrides?.[itemId] || {}),
                    [field]: valNum
                }
            }
        }));
    };

    const exportHistoryCSV = () => {
        if (alerts.length === 0) return toast({ title: "Notice", description: "No alerts to export." });
        
        const headers = ['Date', 'Type', 'Severity', 'Commodity', 'Location', 'Status', 'Resolved At'];
        const csvRows = [headers.join(',')];
        
        alerts.forEach(a => {
            csvRows.push([
                format(new Date(a.created_at), 'yyyy-MM-dd HH:mm:ss'),
                a.alert_type,
                a.severity,
                `"${a.commodity_name}"`,
                `"${a.location_name || ''}"`,
                a.is_resolved ? 'Resolved' : 'Active',
                a.resolved_at ? format(new Date(a.resolved_at), 'yyyy-MM-dd HH:mm:ss') : ''
            ].join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alert-history-${format(new Date(), 'yyyyMMdd')}.csv`;
        a.click();
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-[#1A6B3C]" /></div>;

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-[1000] tracking-tight">Alert Configuration</h1>
                    <p className="text-sm text-slate-500 font-bold mt-1">Manage thresholds and notification routing</p>
                </div>
                <Button onClick={saveConfig} disabled={saving} className="bg-black hover:bg-slate-800 text-white font-black rounded-xl">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                </Button>
            </div>

            {/* SECTION 1: GLOBAL THRESHOLDS */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-black tracking-tight">Global Default Thresholds</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase text-slate-500 tracking-wider">Low Stock Warning (Units)</Label>
                        <Input type="number" 
                            className="bg-amber-50/50 border-amber-200 font-bold"
                            value={config.global_low_stock_threshold || ''} 
                            onChange={(e) => setConfig({...config, global_low_stock_threshold: e.target.value})} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase text-slate-500 tracking-wider">Critical Stock (Units)</Label>
                        <Input type="number" 
                            className="bg-red-50/50 border-red-200 font-bold"
                            value={config.global_critical_stock_threshold || ''} 
                            onChange={(e) => setConfig({...config, global_critical_stock_threshold: e.target.value})} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase text-slate-500 tracking-wider">Aging Warning (Days)</Label>
                        <Input type="number" 
                            className="bg-amber-50/50 border-amber-200 font-bold"
                            value={config.global_aging_warning_days || ''} 
                            onChange={(e) => setConfig({...config, global_aging_warning_days: e.target.value})} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase text-slate-500 tracking-wider">Aging Critical (Days)</Label>
                        <Input type="number" 
                            className="bg-red-50/50 border-red-200 font-bold"
                            value={config.global_aging_critical_days || ''} 
                            onChange={(e) => setConfig({...config, global_aging_critical_days: e.target.value})} 
                        />
                    </div>
                </div>
            </div>

            {/* SECTION 2: CHANNELS */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-black tracking-tight">Notification Channels</h2>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-slate-900">Push Notifications</Label>
                            <p className="text-xs font-semibold text-slate-500">Send alerts to the MandiGrow mobile app</p>
                        </div>
                        <Switch checked={config.notify_push} onCheckedChange={(c) => setConfig({...config, notify_push: c})} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1">WhatsApp <MessageSquare className="w-3 h-3 text-emerald-500" /></Label>
                            <p className="text-xs font-semibold text-slate-500">Instant alerts via Twilio WhatsApp API</p>
                        </div>
                        <Switch checked={config.notify_whatsapp} onCheckedChange={(c) => setConfig({...config, notify_whatsapp: c})} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1">SMS <Smartphone className="w-3 h-3 text-blue-500" /></Label>
                            <p className="text-xs font-semibold text-slate-500">Short text fallbacks via MSG91</p>
                        </div>
                        <Switch checked={config.notify_sms} onCheckedChange={(c) => setConfig({...config, notify_sms: c})} />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1">Email Digest <Mail className="w-3 h-3 text-purple-500" /></Label>
                            <p className="text-xs font-semibold text-slate-500">Daily 7AM summary of unresolved alerts</p>
                        </div>
                        <Switch checked={config.notify_email} onCheckedChange={(c) => setConfig({...config, notify_email: c})} />
                    </div>

                    {(config.notify_whatsapp || config.notify_sms) && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
                            <Label className="text-xs font-black uppercase text-slate-500 tracking-wider w-32">Mobile Number</Label>
                            <Input 
                                placeholder="+91 9999999999" 
                                value={config.phone_number || ''} 
                                onChange={(e) => setConfig({...config, phone_number: e.target.value})}
                                className="flex-1 font-bold"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* SECTION 3: COMMODITY OVERRIDES */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
                <h2 className="text-lg font-black tracking-tight mb-2">Commodity Overrides</h2>
                <p className="text-xs font-bold text-slate-500 mb-4">Set specific thresholds that ignore the global defaults above.</p>
                
                <div className="space-y-3">
                    {items.map(item => {
                        const isExpanded = expandedOverrides[item.id];
                        const overrides = config.commodity_overrides?.[item.id] || {};
                        const hasActiveOverride = overrides.low_val !== undefined || overrides.critical_val !== undefined;

                        return (
                            <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                <div 
                                    className={`p-3 flex justify-between items-center cursor-pointer select-none transition-colors ${hasActiveOverride ? 'bg-indigo-50/50' : 'bg-slate-50 hover:bg-slate-100'}`}
                                    onClick={() => setExpandedOverrides(prev => ({...prev, [item.id]: !isExpanded}))}
                                >
                                    <div>
                                        <span className="font-black text-sm">{item.name}</span>
                                        {hasActiveOverride && <span className="ml-2 text-[10px] uppercase font-black tracking-widest text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">Custom Set</span>}
                                    </div>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                                
                                {isExpanded && (
                                    <div className="p-4 bg-white border-t border-slate-100 grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Custom Low Stock</Label>
                                            <Input 
                                                type="number" 
                                                placeholder={`Global: ${config.global_low_stock_threshold}`}
                                                value={overrides.low_val || ''} 
                                                onChange={(e) => handleOverrideChange(item.id, 'low_val', e.target.value)}
                                                className="h-8 text-xs font-bold"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Custom Critical</Label>
                                            <Input 
                                                type="number" 
                                                placeholder={`Global: ${config.global_critical_stock_threshold}`}
                                                value={overrides.critical_val || ''} 
                                                onChange={(e) => handleOverrideChange(item.id, 'critical_val', e.target.value)}
                                                className="h-8 text-xs font-bold"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* SECTION 4: HISTORY */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black tracking-tight mb-1">Alert History</h2>
                    <p className="text-xs font-bold text-slate-500">Download the last 30 days of alert records.</p>
                </div>
                <Button onClick={exportHistoryCSV} variant="outline" className="font-bold">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
            </div>
        </div>
    );
}
