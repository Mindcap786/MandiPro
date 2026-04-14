'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Save, Layers, Users, Database, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PLAN_COLORS: Record<string, string> = {
    basic: 'bg-gray-500',
    standard: 'bg-blue-500',
    enterprise: 'bg-purple-500',
};

export default function AdminBillingPlansPage() {
    const { toast } = useToast();
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [originalPlans, setOriginalPlans] = useState<any[]>([]); // To track unsaved changes

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .schema('core')
            .from('app_plans')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } else {
            const sanitizedData = (data || []).map(plan => {
                const total = plan.max_total_users === -1 ? 999999 : (plan.max_total_users || 0);
                return { ...plan, max_total_users: total };
            });
            setPlans(sanitizedData);
            setOriginalPlans(JSON.parse(JSON.stringify(sanitizedData)));
        }
        setLoading(false);
    };

    const handleSaveAll = async () => {
        setSaving('all');
        let successCount = 0;
        let failCount = 0;
        
        try {
            for (const plan of plans) {
                const updatePayload = {
                    id: plan.id,
                    price_monthly: plan.price_monthly === '' ? 0 : plan.price_monthly,
                    price_yearly: plan.price_yearly === '' ? 0 : plan.price_yearly,
                    price_per_user: plan.price_per_user === '' ? 0 : plan.price_per_user,
                    price_per_transaction: plan.price_per_transaction === '' ? 0 : plan.price_per_transaction,
                    storage_gb_included: plan.storage_gb_included === '' ? 0 : plan.storage_gb_included,
                    price_per_gb: plan.price_per_gb === '' ? 0 : plan.price_per_gb,
                    max_web_users: plan.max_web_users === '' ? 0 : plan.max_web_users,
                    max_mobile_users: plan.max_mobile_users === '' ? 0 : plan.max_mobile_users,
                    max_total_users: plan.max_total_users === -1 ? -1 : (plan.max_total_users || 0),
                    max_users: plan.max_total_users === -1 ? -1 : (plan.max_total_users || 0),
                    display_name: plan.display_name,
                    description: plan.description,
                    enabled_modules: plan.enabled_modules || [],
                    features: plan.features || {}
                };

                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (session?.access_token) {
                    headers['Authorization'] = `Bearer ${session.access_token}`;
                }

                const res = await fetch('/api/admin/billing/plans', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(updatePayload)
                });
                
                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || `Failed to update ${plan.name}`);
                }
                successCount++;
            }

            toast({ title: 'Bulk Update Success', description: `Successfully synchronized all ${successCount} plans.` });
            setOriginalPlans(JSON.parse(JSON.stringify(plans)));
        } catch (err: any) {
            console.error('Bulk Update Error:', err);
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(null);
        }
    };

    const handleUpdatePlan = async (index: number) => {
        const plan = plans[index];
        setSaving(plan.id);

        const updatePayload = {
            id: plan.id,
            price_monthly: plan.price_monthly === '' ? 0 : plan.price_monthly,
            price_yearly: plan.price_yearly === '' ? 0 : plan.price_yearly,
            price_per_user: plan.price_per_user === '' ? 0 : plan.price_per_user,
            price_per_transaction: plan.price_per_transaction === '' ? 0 : plan.price_per_transaction,
            storage_gb_included: plan.storage_gb_included === '' ? 0 : plan.storage_gb_included,
            price_per_gb: plan.price_per_gb === '' ? 0 : plan.price_per_gb,
            max_web_users: plan.max_web_users === '' ? 0 : plan.max_web_users,
            max_mobile_users: plan.max_mobile_users === '' ? 0 : plan.max_mobile_users,
            max_total_users: plan.max_total_users === -1 ? -1 : (plan.max_total_users || 0),
            max_users: plan.max_total_users === -1 ? -1 : (plan.max_total_users || 0),
            display_name: plan.display_name,
            description: plan.description,
            enabled_modules: plan.enabled_modules || [],
            features: plan.features || {}
        };

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const res = await fetch('/api/admin/billing/plans', {
                method: 'POST',
                headers,
                body: JSON.stringify(updatePayload)
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Update failed');
            }

            toast({ title: 'Plan Updated', description: `${plan.display_name} saved and synchronized.` });
            
            // Sync original state locally to avoid race conditions
            setOriginalPlans(prev => {
                const next = [...prev];
                next[index] = JSON.parse(JSON.stringify(plan));
                return next;
            });
        } catch (err: any) {
            console.error('Frontend Error:', err);
            toast({ 
                title: 'Application Error', 
                description: err.message || 'An unexpected error occurred in the browser.', 
                variant: 'destructive' 
            });
        } finally {
            setSaving(null);
        }
    };

    const handleChange = (index: number, field: string, value: any) => {
        const newPlans = [...plans];
        const plan = newPlans[index];
        
        plan[field] = value;

        // Synchronize logic: Total Pool
        if (field === 'max_users' || field === 'max_total_users') {
            plan.max_users = value;
            plan.max_total_users = value;
        }

        setPlans(newPlans);
    };

    const handleToggleModule = (index: number, module: string) => {
        const newPlans = [...plans];
        const currentModules = newPlans[index].enabled_modules || [];
        if (currentModules.includes(module)) {
            newPlans[index].enabled_modules = currentModules.filter((m: string) => m !== module);
        } else {
            newPlans[index].enabled_modules = [...currentModules, module];
        }
        setPlans(newPlans);
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Layers className="w-8 h-8 text-indigo-600" />
                        Subscription Plans
                    </h1>
                    <p className="text-slate-500 text-sm font-medium mt-1">Manage 5-dimension pricing tier structures.</p>
                </div>
                <Button 
                    onClick={handleSaveAll} 
                    disabled={!!saving}
                    className="bg-indigo-600 hover:bg-indigo-600/80 text-black font-black uppercase tracking-widest px-8"
                >
                    {saving === 'all' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save All Plans
                </Button>
            </div>

            {loading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {plans.map((plan, index) => (
                        <Card key={plan.id} className="bg-white shadow-sm border-slate-200 flex flex-col">
                            <CardHeader className="border-b border-slate-200 pb-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="space-y-1.5 flex-1">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Display Name</Label>
                                                <Input 
                                                    value={plan.display_name}
                                                    onChange={(e) => handleChange(index, 'display_name', e.target.value)}
                                                    className="bg-white shadow-sm border-slate-200 text-slate-900 font-black text-xl h-10 p-0 hover:border-slate-300 transition-colors focus:ring-0"
                                                />
                                            </div>
                                            {JSON.stringify(plan) !== JSON.stringify(originalPlans[index]) && (
                                                <span className="bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase px-2 py-1 rounded border border-amber-500/20 animate-pulse">Unsaved Changes</span>
                                            )}
                                            
                                            {/* Visibility Toggle for Custom Plans */}
                                            {!['basic', 'standard', 'enterprise'].includes(plan.name?.toLowerCase()) && (
                                                <label className="flex items-center gap-2 cursor-pointer mt-2 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100 w-fit">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!plan.features?.show_on_homepage}
                                                        onChange={(e) => {
                                                            const newPlans = [...plans];
                                                            newPlans[index].features = { ...(newPlans[index].features || {}), show_on_homepage: e.target.checked };
                                                            setPlans(newPlans);
                                                        }}
                                                        className="w-3.5 h-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                                                    />
                                                    <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Show on Public Subscribe Page</span>
                                                </label>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sub-description</Label>
                                            <textarea 
                                                value={plan.description}
                                                onChange={(e) => handleChange(index, 'description', e.target.value)}
                                                className="w-full bg-white/20 border border-slate-200 rounded-lg text-slate-500 text-xs p-2 h-16 resize-none focus:outline-none focus:border-slate-200"
                                            />
                                        </div>
                                    </div>

                                    {/* Reactive Badge */}
                                    <div className="text-right flex-shrink-0 bg-white/5 p-3 rounded-xl border border-slate-200 min-w-[120px]">
                                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Current Live Status</div>
                                        <div className="text-[10px] text-gray-300 font-bold uppercase truncate max-w-[100px] mb-2">{plan.enabled_modules?.join(', ')}</div>
                                        <div className={cn(
                                            "inline-flex items-center px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                                            plan.id === saving ? "animate-pulse bg-white/10 text-slate-900" : "bg-emerald-500/10 text-emerald-400"
                                        )}>
                                            {plan.max_users < 0 ? 'Unlimited' : plan.max_users} TOTAL USERS
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6 flex-1 pt-6">
                                
                                {/* Dimension 1: Base Plan */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Layers className="w-3 h-3 text-indigo-600" /> Base Subscription
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500">Monthly (₹)</Label>
                                            <Input
                                                type="number"
                                                value={plan.price_monthly}
                                                onChange={(e) => handleChange(index, 'price_monthly', e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                className="bg-slate-50 border-slate-200 text-slate-900 font-mono text-sm h-9"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500">Yearly (₹)</Label>
                                            <Input
                                                type="number"
                                                value={plan.price_yearly}
                                                onChange={(e) => handleChange(index, 'price_yearly', e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                className="bg-slate-50 border-slate-200 text-slate-900 font-mono text-sm h-9"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Dimension 1.5: User Limits */}
                                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-slate-200 shadow-inner">
                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center justify-between">
                                        <div className="flex items-center gap-2"><Users className="w-3 h-3" /> User Access Limits</div>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={plan.max_web_users === -1}
                                                onChange={(e) => handleChange(index, 'max_web_users', e.target.checked ? -1 : 10)}
                                                className="w-3 h-3 rounded border-slate-200 bg-white checked:bg-indigo-600 transition-all"
                                            />
                                            <span className="text-[9px] text-slate-500 group-hover:text-indigo-600 transition-colors">Unlimited</span>
                                        </label>
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5 bg-white shadow-sm p-3 rounded-xl border border-neon-blue/20">
                                            <Label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Global Total Users Pool (Master Cap)</Label>
                                            <Input
                                                type="number"
                                                value={plan.max_users === -1 ? '' : plan.max_users}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                                    handleChange(index, 'max_users', val);
                                                    handleChange(index, 'max_total_users', val);
                                                }}
                                                disabled={plan.max_users === -1}
                                                placeholder={plan.max_users === -1 ? '∞' : 'Qty'}
                                                className="bg-white/50 border-slate-200 text-slate-900 font-black text-xl h-12 focus:ring-1 focus:ring-neon-blue/50 disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="text-[9px] text-slate-500 font-medium italic px-1">
                                            * Access granted is system-wide. A single user and their credentials can access both Web and Mobile platforms (strictly one session at a time).
                                        </div>
                                    </div>
                                </div>

                                {/* Dimension 1.6: Module Composition */}
                                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-slate-200">
                                    <div className="flex flex-col gap-1.5">
                                        <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Activity className="w-3 h-3" /> Module Access
                                        </h4>
                                        <p className="text-[9px] text-slate-500 leading-tight">Controls which application hubs are available to this tenant tier.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {['mandi', 'finance', 'crm'].map(module => (
                                            <button
                                                key={module}
                                                onClick={() => handleToggleModule(index, module)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border",
                                                    plan.enabled_modules?.includes(module) 
                                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                                                        : "bg-white shadow-sm text-slate-500 border-slate-200 hover:border-slate-200"
                                                )}
                                            >
                                                {module}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Dimension 1.7: Visual Metadata Sync */}
                                <div className="space-y-3 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50">
                                    <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Save className="w-3 h-3" /> Frontend Visual Sync
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Public Tag</Label>
                                            <Input
                                                value={plan.features?.tag || ''}
                                                onChange={(e) => {
                                                    const newPlans = [...plans];
                                                    newPlans[index].features = { ...(newPlans[index].features || {}), tag: e.target.value };
                                                    setPlans(newPlans);
                                                }}
                                                placeholder="e.g. Popular"
                                                className="bg-white border-slate-200 text-[11px] h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Accent Color</Label>
                                            <Input
                                                value={plan.features?.accent_color || ''}
                                                onChange={(e) => {
                                                    const newPlans = [...plans];
                                                    newPlans[index].features = { ...(newPlans[index].features || {}), accent_color: e.target.value };
                                                    setPlans(newPlans);
                                                }}
                                                placeholder="e.g. emerald, blue"
                                                className="bg-white border-slate-200 text-[11px] h-8"
                                            />
                                        </div>
                                        <div className="space-y-1.5 col-span-2">
                                            <Label className="text-[9px] font-bold text-slate-500 uppercase">Lucide Icon Name</Label>
                                            <Input
                                                value={plan.features?.icon || ''}
                                                onChange={(e) => {
                                                    const newPlans = [...plans];
                                                    newPlans[index].features = { ...(newPlans[index].features || {}), icon: e.target.value };
                                                    setPlans(newPlans);
                                                }}
                                                placeholder="e.g. Zap, Crown, Monitor"
                                                className="bg-white border-slate-200 text-[11px] h-8"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Dimension 2 & 3: Usage / Transaction */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Users className="w-3 h-3 text-purple-400" /> Usage Pricing
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500">Per Extra User (₹/mo)</Label>
                                            <Input
                                                type="number"
                                                value={plan.price_per_user}
                                                onChange={(e) => handleChange(index, 'price_per_user', e.target.value)}
                                                className="bg-slate-50 border-slate-200 text-slate-900 font-mono text-sm h-9"
                                                disabled={plan.name === 'enterprise'}
                                            />
                                        </div>
                                    </div>
                                </div>

                            </CardContent>
                            <div className="p-6 pt-0 border-t border-slate-200 mt-4">
                                <Button
                                    onClick={() => handleUpdatePlan(index)}
                                    disabled={saving === plan.id}
                                    className="w-full bg-white text-black hover:bg-gray-200 font-black uppercase tracking-wider mt-4"
                                >
                                    {saving === plan.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Pricing Rules
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
