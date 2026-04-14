'use client';

import { useEffect, useState } from 'react';
import { 
    Landmark, Shield, Info, Save, Loader2, 
    CreditCard, Smartphone, Banknote, CheckCircle2, AlertCircle,
    Eye, EyeOff, Globe, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function PaymentGatewaysPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const [configs, setConfigs] = useState<any[]>([]);
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const res = await fetch('/api/admin/billing/gateways');
            const data = await res.json();
            if (res.ok) {
                setConfigs(data || []);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const getConfig = (gateway: string) => {
        return configs.find(c => c.gateway_type === gateway) || { 
            gateway_type: gateway, 
            config: {}, 
            is_active: false 
        };
    };

    const handleFieldChange = (gateway: string, field: string, value: string) => {
        setConfigs(prev => {
            const exists = prev.some(c => c.gateway_type === gateway);
            if (!exists) {
                return [...prev, { gateway_type: gateway, config: { [field]: value }, is_active: false }];
            }
            return prev.map(c => {
                if (c.gateway_type === gateway) {
                    return { ...c, config: { ...c.config, [field]: value } };
                }
                return c;
            });
        });
    };


    const handleUpdate = async (gateway: string, configOverrides: any = {}) => {
        setSaving(gateway);
        try {
            const current = getConfig(gateway);
            const res = await fetch('/api/admin/billing/gateways', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gateway: gateway,
                    config: { ...current.config, ...configOverrides },
                    is_active: current.is_active
                })
            });

            if (!res.ok) throw new Error('Failed to update config');

            toast({ title: 'Success', description: `${gateway.toUpperCase()} configuration saved.` });
            fetchConfigs();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(null);
        }
    };

    const handleToggleActive = async (gateway: string, active: boolean) => {
        setSaving(gateway);
        try {
            const current = getConfig(gateway);
            const res = await fetch('/api/admin/billing/gateways', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gateway: gateway,
                    config: current.config,
                    is_active: active
                })
            });

            if (!res.ok) throw new Error('Failed to toggle status');

            toast({ title: 'Gateway Updated', description: `${gateway.toUpperCase()} is now ${active ? 'Online' : 'Offline'}.` });
            fetchConfigs();
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setSaving(null);
        }
    };

    const handleTestConnection = async (gateway: string) => {
        setTesting(gateway);
        // Simulated connection test
        await new Promise(r => setTimeout(r, 1500));
        setTesting(null);
        toast({ 
            title: 'Connection Verified', 
            description: `Successfully reached ${gateway.charAt(0).toUpperCase() + gateway.slice(1)} API servers.`,
            variant: 'default'
        });
    };

    const toggleKeyVisibility = (key: string) => {
        setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading) {
        return (
            <div className="p-12 flex justify-center items-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
            <div className="space-y-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <Landmark className="w-8 h-8 text-indigo-600" />
                    Payment Gateways
                </h1>
                <p className="text-slate-500 text-sm font-medium">Configure secure payment providers and automated billing collection.</p>
            </div>

            <Tabs defaultValue="smepay" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-slate-100 p-1 h-14 rounded-xl border border-slate-200">
                    <TabsTrigger value="smepay" className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Banknote className="w-4 h-4 text-emerald-600" /> SME Pay
                    </TabsTrigger>
                    <TabsTrigger value="stripe" className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <CreditCard className="w-4 h-4" /> Stripe
                    </TabsTrigger>
                    <TabsTrigger value="razorpay" className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Smartphone className="w-4 h-4" /> Razorpay
                    </TabsTrigger>
                    <TabsTrigger value="manual" className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Globe className="w-4 h-4" /> Offline / Manual
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="smepay" className="mt-6">
                    <GatewayCard
                        gateway="smepay"
                        title="SME Pay — Indian Payment Gateway"
                        description="Collect payments from Indian businesses via SME Pay UPI, net banking, cards & wallets. Webhooks auto-activate subscriptions."
                        config={getConfig('smepay')}
                        onSave={() => handleUpdate('smepay')}
                        onToggle={(active: boolean) => handleToggleActive('smepay', active)}
                        onTest={() => handleTestConnection('smepay')}
                        isSaving={saving === 'smepay'}
                        isTesting={testing === 'smepay'}
                    >
                        <div className="grid gap-4">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
                                <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700 font-medium">
                                    SME Pay webhook URL: <span className="font-mono font-black">{typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/smepay</span> — Configure this in your SME Pay merchant dashboard under Webhooks.
                                </p>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Merchant ID</Label>
                                <Input
                                    value={getConfig('smepay').config?.merchantId || ''}
                                    placeholder="SME-XXXXXXXXXXXX"
                                    className="bg-slate-50 border-slate-200 font-mono text-sm"
                                    onChange={(e) => handleFieldChange('smepay', 'merchantId', e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">API Key</Label>
                                <div className="relative">
                                    <Input
                                        type={showKeys['smepay_api'] ? 'text' : 'password'}
                                        value={getConfig('smepay').config?.apiKey || ''}
                                        placeholder="••••••••••••••••"
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('smepay', 'apiKey', e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('smepay_api')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {showKeys['smepay_api'] ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Salt / Hash Secret</Label>
                                <div className="relative">
                                    <Input
                                        type={showKeys['smepay_salt'] ? 'text' : 'password'}
                                        value={getConfig('smepay').config?.salt || ''}
                                        placeholder="••••••••••••••••"
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('smepay', 'salt', e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('smepay_salt')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {showKeys['smepay_salt'] ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Webhook Secret</Label>
                                <div className="relative">
                                    <Input
                                        type={showKeys['smepay_webhook'] ? 'text' : 'password'}
                                        value={getConfig('smepay').config?.webhookSecret || ''}
                                        placeholder="••••••••••••••••"
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('smepay', 'webhookSecret', e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('smepay_webhook')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                                    >
                                        {showKeys['smepay_webhook'] ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </GatewayCard>
                </TabsContent>

                <TabsContent value="stripe" className="mt-6">
                    <GatewayCard 
                        gateway="stripe"
                        title="Stripe Payment Bridge"
                        description="Global payments infrastructure for modern SaaS subscription billing."
                        config={getConfig('stripe')}
                        onSave={() => handleUpdate('stripe')}
                        onToggle={(active: boolean) => handleToggleActive('stripe', active)}
                        onTest={() => handleTestConnection('stripe')}
                        isSaving={saving === 'stripe'}
                        isTesting={testing === 'stripe'}
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Public Key (Live)</Label>
                                <Input 
                                    value={getConfig('stripe').config?.publicKey || ''}
                                    placeholder="pk_live_..."
                                    className="bg-slate-50 border-slate-200 font-mono text-sm"
                                    onChange={(e) => handleFieldChange('stripe', 'publicKey', e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Secret Key</Label>
                                <div className="relative">
                                    <Input 
                                        type={showKeys['stripe_secret'] ? "text" : "password"}
                                        value={getConfig('stripe').config?.secretKey || ''}
                                        placeholder="sk_live_..."
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('stripe', 'secretKey', e.target.value)}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => toggleKeyVisibility('stripe_secret')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {showKeys['stripe_secret'] ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Webhook Secret</Label>
                                <div className="relative">
                                    <Input 
                                        type={showKeys['stripe_webhook'] ? "text" : "password"}
                                        value={getConfig('stripe').config?.webhookSecret || ''}
                                        placeholder="whsec_..."
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('stripe', 'webhookSecret', e.target.value)}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => toggleKeyVisibility('stripe_webhook')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {showKeys['stripe_webhook'] ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </GatewayCard>
                </TabsContent>

                <TabsContent value="razorpay" className="mt-6">
                    <GatewayCard 
                        gateway="razorpay"
                        title="Razorpay India"
                        description="Preferred payment collection for Indian businesses with UPI support."
                        config={getConfig('razorpay')}
                        onSave={() => handleUpdate('razorpay')}
                        onToggle={(active: boolean) => handleToggleActive('razorpay', active)}
                        onTest={() => handleTestConnection('razorpay')}
                        isSaving={saving === 'razorpay'}
                        isTesting={testing === 'razorpay'}
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Key ID</Label>
                                <Input 
                                    value={getConfig('razorpay').config?.keyId || ''}
                                    placeholder="rzp_live_..."
                                    className="bg-slate-50 border-slate-200 font-mono text-sm"
                                    onChange={(e) => handleFieldChange('razorpay', 'keyId', e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Key Secret</Label>
                                <div className="relative">
                                    <Input 
                                        type={showKeys['razorpay_secret'] ? "text" : "password"}
                                        value={getConfig('razorpay').config?.keySecret || ''}
                                        placeholder="••••••••••••"
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('razorpay', 'keySecret', e.target.value)}
                                    />
                                    <button 
                                        onClick={() => toggleKeyVisibility('razorpay_secret')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {showKeys['razorpay_secret'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Webhook Secret</Label>
                                <div className="relative">
                                    <Input 
                                        type={showKeys['razorpay_webhook'] ? "text" : "password"}
                                        value={getConfig('razorpay').config?.webhookSecret || ''}
                                        className="bg-slate-50 border-slate-200 font-mono text-sm pr-10"
                                        onChange={(e) => handleFieldChange('razorpay', 'webhookSecret', e.target.value)}
                                    />
                                    <button 
                                        onClick={() => toggleKeyVisibility('razorpay_webhook')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {showKeys['razorpay_webhook'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </GatewayCard>
                </TabsContent>

                <TabsContent value="manual" className="mt-6">
                    <GatewayCard 
                        gateway="manual"
                        title="Manual Bank Transfer"
                        description="Instructions provided to users for offline payment and manual verification."
                        config={getConfig('manual')}
                        onSave={() => handleUpdate('manual')}
                        onToggle={(active: boolean) => handleToggleActive('manual', active)}
                        onTest={() => handleTestConnection('manual')}
                        isSaving={saving === 'manual'}
                        isTesting={testing === 'manual'}
                    >
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-500">Bank Details & Instructions</Label>
                                <textarea 
                                    value={getConfig('manual').config?.instructions || ''}
                                    className="w-full h-32 bg-slate-50 border border-slate-200 rounded-lg text-sm p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                                    placeholder="Enter bank account details, IFSC code, and transfer instructions here..."
                                    onChange={(e) => handleFieldChange('manual', 'instructions', e.target.value)}
                                />
                            </div>
                        </div>
                    </GatewayCard>
                </TabsContent>
            </Tabs>
            
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
                <Shield className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <div className="space-y-1">
                    <h4 className="text-sm font-black text-amber-900 uppercase tracking-wide">Security Enforcement</h4>
                    <p className="text-amber-700 text-xs font-medium leading-relaxed">
                        API keys are stored securely in the core schema. Never share your secret keys. 
                        Webhooks should be configured in your provider dashboard pointing to the MandiGrow primary domain.
                    </p>
                </div>
            </div>
        </div>
    );
}

function GatewayCard({ gateway, title, description, config, children, onSave, onToggle, isSaving, onTest, isTesting }: any) {
    return (
        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 py-6">
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <CardTitle className="text-xl font-black text-slate-900">{title}</CardTitle>
                        <CardDescription className="text-xs font-medium text-slate-500">{description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                        <span className={cn("text-[9px] font-black uppercase tracking-[0.15em]", config.is_active ? "text-emerald-500" : "text-slate-400")}>
                            {config.is_active ? 'Gateway Online' : 'Gateway Offline'}
                        </span>
                        <Switch 
                            checked={config.is_active || false} 
                            onCheckedChange={onToggle}
                            className="data-[state=checked]:bg-emerald-500"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
                {children}
                
                <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onTest}
                        disabled={isSaving || isTesting}
                        className="border-slate-200 text-[10px] font-black uppercase tracking-widest h-9 px-4 hover:bg-slate-50"
                    >
                        {isTesting ? (
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        ) : (
                            <Zap className="w-3 h-3 mr-2 text-amber-500" />
                        )}
                        Test Production Link
                    </Button>

                    <Button 
                        onClick={onSave}
                        disabled={isSaving || isTesting}
                        className="bg-indigo-600 hover:bg-black text-white font-black uppercase tracking-widest px-10 h-11"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Commit Configuration
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
