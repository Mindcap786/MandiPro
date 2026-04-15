'use client';

import { useEffect, useState } from 'react';
import {
    Settings, Shield, Server, Globe, Bell, Database, RefreshCw, Clock,
    Loader2, CheckCircle2, Save, AlertTriangle, Printer, Calendar, CreditCard
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function AdminSettingsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingBranding, setSavingBranding] = useState(false);
    const [platformInfo, setPlatformInfo] = useState<any>({});
    const [branding, setBranding] = useState<any>({
        document_footer_powered_by_text: '',
        document_footer_presented_by_text: '',
        document_footer_developed_by_text: '',
        is_watermark_enabled: false,
        watermark_text: '',
        is_compliance_visible_to_tenants: true
    });

    // ── Billing Lifecycle Settings ──────────────────────────────────────────────
    const [trialDays, setTrialDays] = useState(14);
    const [graceDaysMonthly, setGraceDaysMonthly] = useState(7);
    const [graceDaysYearly, setGraceDaysYearly] = useState(14);
    const [reminderDaysMonthly, setReminderDaysMonthly] = useState(3);
    const [reminderDaysYearly, setReminderDaysYearly] = useState(7);

    useEffect(() => { fetchInfo(); }, []);

    const fetchInfo = async () => {
        setLoading(true);
        try {
            const [orgsRes, subsRes, flagsRes, brandingRes, settingsRes] = await Promise.allSettled([
                supabase.schema('core').from('organizations').select('id', { count: 'exact', head: true }),
                supabase.schema('core').from('subscriptions').select('status').eq('status', 'active'),
                supabase.schema('core').from('feature_flags').select('key, is_enabled').is('organization_id', null),
                supabase.schema('core').from('platform_branding_settings').select('*').maybeSingle(),
                supabase.schema('core').from('app_settings')
                    .select('key, value')
                    .in('key', ['global_trial_days', 'grace_period_days_monthly', 'grace_period_days_yearly', 'payment_reminder_days_monthly', 'payment_reminder_days_yearly']),
            ]);

            setPlatformInfo({
                totalOrgs: orgsRes.status === 'fulfilled' ? orgsRes.value.count || 0 : 0,
                activeSubs: subsRes.status === 'fulfilled' ? (subsRes.value.data?.length || 0) : 0,
                maintenanceMode: flagsRes.status === 'fulfilled'
                    ? flagsRes.value.data?.find((f: any) => f.key === 'maintenance_mode')?.is_enabled ?? false
                    : false,
            });

            if (brandingRes.status === 'fulfilled' && brandingRes.value.data) {
                setBranding(brandingRes.value.data);
            }

            if (settingsRes.status === 'fulfilled' && settingsRes.value.data) {
                const s = settingsRes.value.data;
                const get = (key: string, def: number) => {
                    const row = s.find((r: any) => r.key === key);
                    if (!row) return def;
                    
                    // Handle both direct value and JSONB value structure from app_settings
                    let val = row.value;
                    if (val && typeof val === 'object' && val.value !== undefined) {
                        val = val.value;
                    }

                    const v = typeof val === 'string' ? parseInt(val) : (val as any);
                    return isNaN(v) ? def : v;
                };
                setTrialDays(get('global_trial_days', 14));
                setGraceDaysMonthly(get('grace_period_days_monthly', 7));
                setGraceDaysYearly(get('grace_period_days_yearly', 14));
                setReminderDaysMonthly(get('payment_reminder_days_monthly', 3));
                setReminderDaysYearly(get('payment_reminder_days_yearly', 7));
            }
        } catch {}
        setLoading(false);
    };

    const handleSaveBranding = async () => {
        if (!branding.id) return;
        setSavingBranding(true);
        const { error } = await supabase.schema('core')
            .from('platform_branding_settings')
            .update({
                document_footer_powered_by_text: branding.document_footer_powered_by_text,
                document_footer_presented_by_text: branding.document_footer_presented_by_text,
                document_footer_developed_by_text: branding.document_footer_developed_by_text,
                is_watermark_enabled: branding.is_watermark_enabled,
                watermark_text: branding.watermark_text,
                is_compliance_visible_to_tenants: branding.is_compliance_visible_to_tenants
            })
            .eq('id', branding.id);
        
        if (error) {
            toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Branding Updated', description: 'Platform PDF footprint has been updated globally.' });
        }
        setSavingBranding(false);
    };

    const handleSaveBillingSettings = async () => {
        setSaving(true);
        try {
            const rows = [
                { key: 'global_trial_days', value: { value: trialDays } },
                { key: 'grace_period_days_monthly', value: { value: graceDaysMonthly } },
                { key: 'grace_period_days_yearly', value: { value: graceDaysYearly } },
                { key: 'payment_reminder_days_monthly', value: { value: reminderDaysMonthly } },
                { key: 'payment_reminder_days_yearly', value: { value: reminderDaysYearly } },
            ];
            const { error } = await supabase.schema('core')
                .from('app_settings')
                .upsert(rows, { onConflict: 'key', ignoreDuplicates: false });
            if (error) throw error;
            toast({ title: '✅ Billing Settings Saved', description: `Lifecycle settings updated successfully.` });
        } catch (e: any) {
            toast({ title: 'Save Failed', description: e.message, variant: 'destructive' });
        }
        setSaving(false);
    };

    const INFO_CARDS = [
        {
            label: 'Total Tenants', value: platformInfo.totalOrgs,
            icon: Database, color: 'text-blue-400'
        },
        {
            label: 'Active Subscriptions', value: platformInfo.activeSubs,
            icon: CheckCircle2, color: 'text-emerald-400'
        },
        {
            label: 'Platform Status',
            value: platformInfo.maintenanceMode ? 'MAINTENANCE' : 'OPERATIONAL',
            icon: Shield,
            color: platformInfo.maintenanceMode ? 'text-red-400' : 'text-emerald-400'
        },
    ];

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-[0.2em] uppercase mb-1">Settings</h1>
                    <p className="text-slate-500 text-sm font-medium">Platform-level configuration and operational parameters.</p>
                </div>
                <Button variant="outline" className="border-slate-200 text-slate-900 hover:bg-white/5" onClick={fetchInfo} disabled={loading}>
                    <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} /> Refresh
                </Button>
            </div>

            {/* Platform status cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {INFO_CARDS.map(card => (
                    <Card key={card.label} className="bg-white shadow-sm border-slate-200">
                        <CardContent className="p-5 flex items-center gap-4">
                            <div className="p-2.5 rounded-xl bg-white/5 border border-slate-200">
                                <card.icon className={cn("w-5 h-5", card.color)} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
                                {loading
                                    ? <div className="h-5 w-12 bg-white/10 rounded animate-pulse mt-1" />
                                    : <p className={cn("text-xl font-black mt-0.5", card.color)}>{card.value}</p>
                                }
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Feature Flags */}
                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-slate-900 flex items-center gap-2 text-base">
                            <Shield className="w-4 h-4 text-purple-400" /> Feature Flags
                        </CardTitle>
                        <CardDescription className="text-slate-500">
                            Control which modules and features are enabled globally or per-tenant.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 w-full"
                            onClick={() => window.location.href = '/admin/features'}
                        >
                            Manage Feature Flags →
                        </Button>
                    </CardContent>
                </Card>

                {/* Billing Plans */}
                <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-slate-900 flex items-center gap-2 text-base">
                            <Server className="w-4 h-4 text-emerald-400" /> Subscription Plans
                        </CardTitle>
                        <CardDescription className="text-slate-500">
                            Manage your Basic, Standard, and Enterprise pricing tiers.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 w-full"
                            onClick={() => window.location.href = '/admin/billing/plans'}
                        >
                            Manage Plans →
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Billing Lifecycle Settings — Trial, Grace, Reminder */}
            <Card className="bg-white shadow-sm border-slate-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-slate-900 flex items-center gap-2 text-base">
                                <Clock className="w-4 h-4 text-orange-400" /> Billing Lifecycle Settings
                            </CardTitle>
                            <CardDescription className="text-slate-500 mt-1">
                                Control trial periods, grace periods, and payment reminder timing. Changes apply to ALL new tenants immediately.
                            </CardDescription>
                        </div>
                        <Button
                            className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border border-orange-500/30 font-black"
                            onClick={handleSaveBillingSettings}
                            disabled={saving}
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Settings
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Trial Period */}
                        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                <Label className="text-slate-700 font-black text-xs uppercase tracking-widest">Free Trial Period</Label>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <Input
                                    type="number"
                                    value={trialDays}
                                    onChange={e => setTrialDays(Math.max(0, parseInt(e.target.value) || 0))}
                                    min={0}
                                    max={90}
                                    className="bg-white border-blue-200 text-slate-900 w-full font-black text-lg text-center"
                                />
                                <span className="text-slate-500 text-sm font-medium">days</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2 block">All new organizations start with this many free trial days. Set to 0 to disable trial.</p>
                        </div>

                        {/* Grace Period */}
                        <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200 space-y-3">
                            <div className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-orange-500" />
                                <Label className="text-slate-700 font-black text-xs uppercase tracking-widest">Grace Period</Label>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Monthly</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={graceDaysMonthly}
                                            onChange={e => setGraceDaysMonthly(Math.max(0, parseInt(e.target.value) || 0))}
                                            min={0}
                                            max={30}
                                            className="bg-white border-orange-200 text-slate-900 w-full font-black text-center"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Yearly</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={graceDaysYearly}
                                            onChange={e => setGraceDaysYearly(Math.max(0, parseInt(e.target.value) || 0))}
                                            min={0}
                                            max={90}
                                            className="bg-white border-orange-200 text-slate-900 w-full font-black text-center"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 pt-1">Days after subscription expiry before tenant access is suspended.</p>
                        </div>

                        {/* Payment Reminder */}
                        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-emerald-500" />
                                <Label className="text-slate-700 font-black text-xs uppercase tracking-widest">Reminder Before Expiry</Label>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Monthly</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={reminderDaysMonthly}
                                            onChange={e => setReminderDaysMonthly(Math.max(1, parseInt(e.target.value) || 1))}
                                            min={1}
                                            max={30}
                                            className="bg-white border-emerald-200 text-slate-900 w-full font-black text-center"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Yearly</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            value={reminderDaysYearly}
                                            onChange={e => setReminderDaysYearly(Math.max(1, parseInt(e.target.value) || 1))}
                                            min={1}
                                            max={30}
                                            className="bg-white border-emerald-200 text-slate-900 w-full font-black text-center"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 pt-1">Trigger banner N days before subscription ends.</p>
                        </div>
                    </div>

                    <p className="text-xs text-orange-500/80 flex items-center gap-1.5 bg-orange-50 p-3 rounded-lg border border-orange-100">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Trial period applies to new organizations only. Grace period affects all tenants on their next billing cycle.
                    </p>
                </CardContent>
            </Card>

            {/* Platform Branding Settings */}
            <Card className="bg-white shadow-sm border-slate-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-slate-900 flex items-center gap-2 text-base">
                                <Printer className="w-4 h-4 text-cyan-400" /> Print Documents & PDFs Branding
                            </CardTitle>
                            <CardDescription className="text-slate-500 mt-1">
                                Configure the overarching platform attribution injected into all tenant invoices and exports.
                            </CardDescription>
                        </div>
                        <Button
                            className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30"
                            onClick={handleSaveBranding}
                            disabled={savingBranding || !branding.id}
                        >
                            {savingBranding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            Update Branding
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label className="text-slate-500">Presented By (Left Footer)</Label>
                            <Input
                                value={branding.document_footer_presented_by_text}
                                onChange={e => setBranding({ ...branding, document_footer_presented_by_text: e.target.value })}
                                className="bg-white shadow-sm border-slate-200 text-slate-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-500">Powered By (Center Footer)</Label>
                            <Input
                                value={branding.document_footer_powered_by_text}
                                onChange={e => setBranding({ ...branding, document_footer_powered_by_text: e.target.value })}
                                className="bg-white shadow-sm border-slate-200 text-slate-900"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-500">Developed By (Right Footer)</Label>
                            <Input
                                value={branding.document_footer_developed_by_text}
                                onChange={e => setBranding({ ...branding, document_footer_developed_by_text: e.target.value })}
                                className="bg-white shadow-sm border-slate-200 text-slate-900"
                            />
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 mb-1">Background Watermark</h4>
                            <p className="text-xs text-slate-500">Inject a subtle centralized watermark across prints. Disabled by default to preserve tenant identity.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Input
                                value={branding.watermark_text}
                                onChange={e => setBranding({ ...branding, watermark_text: e.target.value })}
                                placeholder="Watermark text..."
                                className="bg-white shadow-sm border-slate-200 text-slate-900 w-48"
                                disabled={!branding.is_watermark_enabled}
                            />
                            <Switch
                                checked={branding.is_watermark_enabled}
                                onCheckedChange={c => setBranding({ ...branding, is_watermark_enabled: c })}
                            />
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 bg-indigo-50/30 flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                                <Shield className="w-4 h-4 text-indigo-500" /> Compliance Transparency
                            </h4>
                            <p className="text-xs text-slate-500">Enable or disable the SOC-2 & Business Compliance page for all tenants. Disable if you feel it may cause confusion for smaller traders.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={cn("text-[10px] font-black uppercase tracking-widest", branding.is_compliance_visible_to_tenants ? "text-indigo-600" : "text-slate-400")}>
                                {branding.is_compliance_visible_to_tenants ? "Visible" : "Hidden"}
                            </span>
                            <Switch
                                checked={branding.is_compliance_visible_to_tenants}
                                onCheckedChange={c => setBranding({ ...branding, is_compliance_visible_to_tenants: c })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Platform Info */}
            <Card className="bg-white shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle className="text-slate-900 flex items-center gap-2 text-base">
                        <Globe className="w-4 h-4 text-blue-400" /> Platform Information
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        {[
                            { label: 'Product', value: 'MandiGrow / WholesalePro' },
                            { label: 'Schemas', value: 'core · mandi · wholesale' },
                            { label: 'Database', value: 'Supabase (PostgreSQL 17)' },
                            { label: 'Region', value: 'ap-south-1 (Mumbai)' },
                        ].map(item => (
                            <div key={item.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                <p className="text-slate-500 font-black uppercase tracking-widest text-[9px] mb-1">{item.label}</p>
                                <p className="text-slate-900 font-mono font-bold">{item.value}</p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
