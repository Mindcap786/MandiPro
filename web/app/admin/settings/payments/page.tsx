'use client';

import { useState, useEffect } from 'react';
import { 
    CreditCard, ShieldCheck, Zap, Laptop, ExternalLink, 
    Save, Loader2, CheckCircle2, AlertCircle, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export default function PaymentSettingsPage() {
    const { toast } = useToast();
    const [configs, setConfigs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => { fetchConfigs(); }, []);

    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/payments/config');
            if (!res.ok) throw new Error('Failed to fetch');
            setConfigs(await res.json());
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        }
        setLoading(false);
    };

    const handleSave = async (gateway: string, data: any) => {
        setSaving(gateway);
        try {
            const res = await fetch('/api/admin/payments/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gateway_type: gateway, ...data })
            });
            if (!res.ok) throw new Error('Failed to save');
            toast({ title: 'Success', description: `${gateway} configuration updated.` });
            fetchConfigs();
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(null);
        }
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-white">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        </div>
    );

    const stripe = configs.find(c => c.gateway_type === 'stripe') || { config: {} };
    const razorpay = configs.find(c => c.gateway_type === 'razorpay') || { config: {} };

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-[1000] text-slate-900 tracking-[0.2em] uppercase mb-1 flex items-center gap-4">
                        <CreditCard className="w-10 h-10 text-indigo-600" />
                        Payment Gateways
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">Configure Stripe and Razorpay for global SaaS billing.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Stripe Card */}
                <Card className={cn(
                    "bg-white shadow-sm border-slate-200 relative overflow-hidden transition-all duration-500",
                    stripe.is_active ? "ring-2 ring-indigo-500 border-indigo-500/20" : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                )}>
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <Zap className="w-32 h-32 text-indigo-400" />
                    </div>
                    <CardHeader>
                        <div className="flex justify-between items-center mb-2">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" alt="Stripe" className="h-8 filter invert brightness-200" />
                            <Switch 
                                checked={stripe.is_active} 
                                onCheckedChange={(val) => handleSave('stripe', { is_active: val })}
                                disabled={saving === 'stripe'}
                            />
                        </div>
                        <CardTitle className="text-slate-900">Stripe Integration</CardTitle>
                        <CardDescription>Global standard for credit cards and digital wallets.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Public Key</Label>
                            <Input 
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={stripe.config.public_key}
                                onChange={(e) => stripe.config.public_key = e.target.value}
                                placeholder="pk_live_..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Secret Key</Label>
                            <Input 
                                type="password"
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={stripe.config.secret_key}
                                onChange={(e) => stripe.config.secret_key = e.target.value}
                                placeholder="sk_live_..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Webhook Signing Secret</Label>
                            <Input 
                                type="password"
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={stripe.config.webhook_secret}
                                onChange={(e) => stripe.config.webhook_secret = e.target.value}
                                placeholder="whsec_..."
                            />
                        </div>
                        <Button 
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-slate-900 font-black uppercase tracking-widest"
                            onClick={() => handleSave('stripe', { config: stripe.config })}
                            disabled={saving === 'stripe'}
                        >
                            {saving === 'stripe' ? <Loader2 className="animate-spin" /> : 'Update Stripe Details'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Razorpay Card */}
                <Card className={cn(
                    "bg-white shadow-sm border-slate-200 relative overflow-hidden transition-all duration-500",
                    razorpay.is_active ? "ring-2 ring-blue-500 border-blue-500/20" : "opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                )}>
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                        <CreditCard className="w-32 h-32 text-blue-400" />
                    </div>
                    <CardHeader>
                        <div className="flex justify-between items-center mb-2">
                             <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/Razorpay_logo.svg" alt="Razorpay" className="h-6 filter brightness-200" />
                            <Switch 
                                checked={razorpay.is_active} 
                                onCheckedChange={(val) => handleSave('razorpay', { is_active: val })}
                                disabled={saving === 'razorpay'}
                            />
                        </div>
                        <CardTitle className="text-slate-900">Razorpay Integration</CardTitle>
                        <CardDescription>Optimized for Indian payments (UPI, Cards, NetBanking).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Key ID</Label>
                            <Input 
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={razorpay.config.key_id}
                                onChange={(e) => razorpay.config.key_id = e.target.value}
                                placeholder="rzp_live_..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Key Secret</Label>
                            <Input 
                                type="password"
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={razorpay.config.key_secret}
                                onChange={(e) => razorpay.config.key_secret = e.target.value}
                                placeholder="••••••••••••"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Webhook Secret</Label>
                            <Input 
                                type="password"
                                className="bg-white shadow-sm border-slate-200 text-slate-900 font-mono"
                                defaultValue={razorpay.config.webhook_secret}
                                onChange={(e) => razorpay.config.webhook_secret = e.target.value}
                                placeholder="••••••••••••"
                            />
                        </div>
                        <Button 
                            className="w-full bg-blue-600 hover:bg-blue-700 text-slate-900 font-black uppercase tracking-widest"
                            onClick={() => handleSave('razorpay', { config: razorpay.config })}
                            disabled={saving === 'razorpay'}
                        >
                             {saving === 'razorpay' ? <Loader2 className="animate-spin" /> : 'Update Razorpay Details'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Support/Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-50 border-slate-200 border-dashed">
                    <CardContent className="p-6 flex items-start gap-4">
                        <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-tighter text-slate-900">Encrypted Storage</p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                API keys are stored with server-side encryption and masked in the UI for maximum security.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-50 border-slate-200 border-dashed">
                    <CardContent className="p-6 flex items-start gap-4">
                        <Laptop className="w-6 h-6 text-blue-500 shrink-0" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-tighter text-slate-900">Dynamic Routing</p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                Switching gateways in the UI immediately updates the billing engine for all tenants.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-50 border-slate-200 border-dashed">
                    <CardContent className="p-6 flex items-start gap-4">
                        <Info className="w-6 h-6 text-orange-500 shrink-0" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-tighter text-slate-900">Webhook Setup</p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                Ensure your webhook URL is set to <code className="text-orange-400">/api/payments/webhook</code> in your gateway dashboard.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
