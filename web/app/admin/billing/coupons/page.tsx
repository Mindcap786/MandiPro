'use client';

import { useEffect, useState } from 'react';
import { 
    Tag, Plus, Loader2, Save, Trash2, Gift,
    Ticket, RefreshCw, AlertCircle, CheckCircle2, X,
    Percent, Hash, TrendingUp, Users, Edit2 
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

export default function AdminCouponsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [activeCoupons, setActiveCoupons] = useState<any[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [code, setCode] = useState('');
    const [discount, setDiscount] = useState('');
    const [type, setType] = useState('flat');
    const [maxUses, setMaxUses] = useState('');
    const [expiresAt, setExpiresAt] = useState('');

    useEffect(() => {
        fetchActiveCoupons();
    }, []);

    const fetchActiveCoupons = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/coupons', {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const data = await res.json();
            if (data.success) setActiveCoupons(data.coupons);
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    const generateCoupon = async () => {
        if (!code || !discount) {
            toast({ title: 'Missing required fields', variant: 'destructive' });
            return;
        }
        setActionLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/coupons', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    code: code,
                    discount_amount: discount,
                    discount_type: type,
                    max_uses: maxUses || null,
                    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
                })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate coupon');
            
            toast({ title: 'Coupon Generated', description: `Code ${code.toUpperCase()} is now live.` });
            setCode('');
            setDiscount('');
            setMaxUses('');
            setExpiresAt('');
            setIsCreateOpen(false);
            fetchActiveCoupons();
        } catch (e: any) {
            toast({ title: 'Generation Failed', description: e.message, variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const deleteCoupon = async (id: string) => {
        if (!confirm('Are you sure you want to delete this coupon? This action cannot be undone.')) return;
        setActionLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/coupons?id=${id}`, { 
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to revoke coupon');
            toast({ title: 'Coupon Revoked' });
            fetchActiveCoupons();
        } catch (e: any) {
            toast({ title: 'Revoke Failed', description: e.message, variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const toggleActive = async (id: string, currentStatus: boolean) => {
        setActionLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/coupons', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id, is_active: !currentStatus })
            });
            if (!res.ok) throw new Error('Failed to toggle status');
            fetchActiveCoupons();
        } catch (e: any) {
            toast({ title: 'Toggle Failed', description: e.message, variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    const openEdit = (c: any) => {
        setEditingId(c.id);
        setCode(c.code);
        setDiscount(c.discount_amount.toString());
        setType(c.discount_type);
        setMaxUses(c.max_uses ? c.max_uses.toString() : '');
        setExpiresAt(c.expires_at ? c.expires_at.slice(0, 16) : '');
        setIsEditOpen(true);
    };

    const updateCoupon = async () => {
        if (!code || !discount) {
            toast({ title: 'Missing required fields', variant: 'destructive' });
            return;
        }
        setActionLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/coupons', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({ id: editingId, code, discount_amount: discount, discount_type: type, max_uses: maxUses || null, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update coupon');
            
            toast({ title: 'Coupon Updated', description: `Changes saved for ${code.toUpperCase()}.` });
            setIsEditOpen(false);
            setEditingId(null);
            setCode('');
            setDiscount('');
            setMaxUses('');
            setExpiresAt('');
            fetchActiveCoupons();
        } catch (e: any) {
            toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-12 flex justify-center items-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Ticket className="w-10 h-10 text-amber-500" />
                        Offer Factory
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">Manage growth incentives and promotional master codes.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="border-slate-200 h-12 w-12 p-0 rounded-2xl" onClick={fetchActiveCoupons}>
                        <RefreshCw className={cn("w-5 h-5 text-slate-400", actionLoading && "animate-spin")} />
                    </Button>
                    
                    <Dialog open={isCreateOpen} onOpenChange={(val) => {
                        setIsCreateOpen(val);
                        if (!val) { setCode(''); setDiscount(''); setMaxUses(''); setExpiresAt(''); }
                    }}>
                        <DialogTrigger asChild>
                            <Button className="h-12 bg-indigo-600 hover:bg-black text-white font-black uppercase tracking-widest px-8 rounded-2xl shadow-xl shadow-indigo-100">
                                <Plus className="w-5 h-5 mr-2" />
                                Create Coupon
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-none shadow-2xl">
                            <div className="bg-indigo-600 p-8 text-white">
                                <Gift className="w-12 h-12 mb-4 opacity-50" />
                                <DialogTitle className="text-2xl font-black">Generate Promo</DialogTitle>
                                <DialogDescription className="text-indigo-100 font-medium">
                                    Define the terms for your new promotional code.
                                </DialogDescription>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Coupon Code</Label>
                                    <Input 
                                        placeholder="e.g. ALPHA100" 
                                        value={code}
                                        onChange={e => setCode(e.target.value.toUpperCase())}
                                        className="bg-slate-50 border-slate-200 font-mono font-black text-xl tracking-widest text-indigo-600 h-14"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Value</Label>
                                        <Input 
                                            type="number"
                                            placeholder="500" 
                                            value={discount}
                                            onChange={e => setDiscount(e.target.value)}
                                            className="bg-slate-50 border-slate-200 font-black h-12"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Type</Label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-black rounded-xl h-12 px-3 text-sm focus:bg-white transition-all outline-none"
                                            value={type}
                                            onChange={e => setType(e.target.value)}
                                        >
                                            <option value="flat">Fixed (₹)</option>
                                            <option value="percentage">Percentage (%)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Circulation Limit</Label>
                                    <Input 
                                        type="number"
                                        placeholder="Unlimited (Zero for ∞)" 
                                        value={maxUses}
                                        onChange={e => setMaxUses(e.target.value)}
                                        className="bg-slate-50 border-slate-200 font-bold h-12"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Expiration Date & Time</Label>
                                    <Input 
                                        type="datetime-local"
                                        value={expiresAt}
                                        onChange={e => setExpiresAt(e.target.value)}
                                        className="bg-slate-50 border-slate-200 font-bold h-12"
                                    />
                                </div>

                                <Button 
                                    className="w-full bg-indigo-600 hover:bg-black text-white font-black uppercase tracking-widest h-14 rounded-2xl shadow-xl shadow-indigo-100 mt-4"
                                    onClick={generateCoupon}
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                    Deploy to Network
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isEditOpen} onOpenChange={(val) => {
                        setIsEditOpen(val);
                        if (!val) { setEditingId(null); setCode(''); setDiscount(''); setMaxUses(''); setExpiresAt(''); }
                    }}>
                        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-none shadow-2xl">
                            <div className="bg-slate-800 p-8 text-white">
                                <Edit2 className="w-12 h-12 mb-4 opacity-50" />
                                <DialogTitle className="text-2xl font-black">Edit Promo</DialogTitle>
                                <DialogDescription className="text-slate-300 font-medium">
                                    Modify the terms for this promotional code.
                                </DialogDescription>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Coupon Code</Label>
                                    <Input 
                                        placeholder="e.g. ALPHA100" 
                                        value={code}
                                        onChange={e => setCode(e.target.value.toUpperCase())}
                                        className="bg-slate-50 border-slate-200 font-mono font-black text-xl tracking-widest text-slate-900 h-14"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Value</Label>
                                        <Input 
                                            type="number"
                                            placeholder="50" 
                                            value={discount}
                                            onChange={e => setDiscount(e.target.value)}
                                            className="bg-slate-50 border-slate-200 font-black h-12"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Type</Label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-black rounded-xl h-12 px-3 text-sm focus:bg-white transition-all outline-none"
                                            value={type}
                                            onChange={e => setType(e.target.value)}
                                        >
                                            <option value="flat">Fixed (₹)</option>
                                            <option value="percentage">Percentage (%)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Circulation Limit</Label>
                                    <Input 
                                        type="number"
                                        placeholder="Unlimited (Zero for ∞)" 
                                        value={maxUses}
                                        onChange={e => setMaxUses(e.target.value)}
                                        className="bg-slate-50 border-slate-200 font-bold h-12"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Expiration Date & Time</Label>
                                    <Input 
                                        type="datetime-local"
                                        value={expiresAt}
                                        onChange={e => setExpiresAt(e.target.value)}
                                        className="bg-slate-50 border-slate-200 font-bold h-12"
                                    />
                                </div>

                                <Button 
                                    className="w-full bg-slate-800 hover:bg-black text-white font-black uppercase tracking-widest h-14 rounded-2xl shadow-xl mt-4"
                                    onClick={updateCoupon}
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard icon={<Ticket className="w-5 h-5" />} label="In Circulation" value={activeCoupons.length} color="indigo" />
                <MetricCard icon={<TrendingUp className="w-5 h-5" />} label="Avg. Conversion" value="14.2%" color="emerald" />
                <MetricCard icon={<Users className="w-5 h-5" />} label="Total Redemptions" value={activeCoupons.reduce((acc, c) => acc + (c.current_uses || 0), 0)} color="amber" />
            </div>

            <Card className="border-slate-200 shadow-xl rounded-[32px] overflow-hidden bg-white">
                <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                    <CardTitle className="text-lg font-black text-slate-900 flex items-center justify-between">
                        ACTIVE PROMOTIONS
                        <Badge className="bg-white text-slate-600 border-slate-200 font-black h-8 px-4 rounded-full shadow-sm">Real-time Stats</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/30 border-y border-slate-100">
                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="px-8 py-5">Promo Signal</th>
                                    <th className="px-8 py-5">Benefit Structure</th>
                                    <th className="px-8 py-5">Usage Efficiency</th>
                                    <th className="px-8 py-5 text-right">Operations</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeCoupons.map((c) => {
                                    const usagePercent = c.max_uses ? Math.min((c.current_uses / c.max_uses) * 100, 100) : 0;
                                    return (
                                        <tr key={c.id} className="group hover:bg-slate-50/30 transition-colors">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn("w-12 h-12 rounded-2xl border flex items-center justify-center shadow-sm", c.is_active ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-50 border-slate-200 text-slate-400")}>
                                                        <Tag className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={cn("font-mono font-black text-2xl tracking-tighter leading-none", c.is_active ? "text-indigo-900" : "text-slate-400 line-through")}>{c.code}</span>
                                                        <span className={cn("text-[9px] font-bold uppercase tracking-widest mt-1", c.is_active ? "text-emerald-500" : "text-slate-400")}>
                                                            Status: {c.is_active ? 'Active' : 'Inactive'}
                                                            {c.expires_at && ` • Expires: ${new Date(c.expires_at).toLocaleDateString()}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "w-8 h-8 rounded-full flex items-center justify-center",
                                                        c.discount_type === 'flat' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                                                    )}>
                                                        {c.discount_type === 'flat' ? <Hash className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                                                    </div>
                                                    <span className="font-black text-slate-900 text-xl tracking-tight">
                                                        {c.discount_type === 'flat' ? `₹${c.discount_amount}` : `${c.discount_amount}%`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 max-w-xs">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                            {c.current_uses || 0} / {c.max_uses || '∞'} Redemptions
                                                        </span>
                                                        <span className="text-xs font-black text-indigo-600">{Math.round(usagePercent)}%</span>
                                                    </div>
                                                    <Progress value={usagePercent} className="h-1.5 bg-slate-100" />
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Switch 
                                                        checked={c.is_active} 
                                                        onCheckedChange={() => toggleActive(c.id, c.is_active)}
                                                        disabled={actionLoading}
                                                    />
                                                    <div className="w-px h-6 bg-slate-200 mx-2" />
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 h-10 w-10 rounded-2xl transition-all"
                                                        onClick={() => openEdit(c)}
                                                        disabled={actionLoading}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 h-10 w-10 rounded-2xl group-hover:text-red-400 transition-all"
                                                        onClick={() => deleteCoupon(c.id)}
                                                        disabled={actionLoading}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {activeCoupons.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-24 text-center">
                                            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
                                                <Ticket className="w-10 h-10 text-slate-200" />
                                            </div>
                                            <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">Master Vault Empty</h3>
                                            <p className="text-slate-300 text-sm font-medium">No promotional signals are currently being broadcast.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function MetricCard({ icon, label, value, color }: any) {
    const variants: any = {
        indigo: "bg-indigo-50 border-indigo-100 text-indigo-600",
        emerald: "bg-emerald-50 border-emerald-100 text-emerald-600",
        amber: "bg-amber-50 border-amber-100 text-amber-600",
    };
    return (
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-5">
            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", variants[color])}>
                {icon}
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
            </div>
        </div>
    );
}
