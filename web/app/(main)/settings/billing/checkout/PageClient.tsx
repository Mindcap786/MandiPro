'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';
import { ProtectedRoute } from '@/components/protected-route';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, CheckCircle2, ShieldCheck, Zap, Building2, TrendingUp, Tag, X } from 'lucide-react';

const PLAN_ICONS: Record<string, any> = {
    basic: Zap,
    standard: TrendingUp,
    enterprise: Building2,
};

export default function CheckoutContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile } = useAuth();
    const { toast } = useToast();
    const planId = searchParams.get('plan_id');

    const [plan, setPlan] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // Coupon State
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
    const [couponLoading, setCouponLoading] = useState(false);

    useEffect(() => {
        if (planId) {
            fetchPlanDetails();
        } else {
            router.push('/settings/billing');
        }
    }, [planId]);

    const fetchPlanDetails = async () => {
        const { data, error } = await supabase
            .schema('core')
            .from('app_plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (error || !data) {
            toast({ title: 'Error', description: 'Plan not found.', variant: 'destructive' });
            router.push('/settings/billing');
            return;
        }

        setPlan(data);
        setLoading(false);
    };

    const validateCoupon = async () => {
        if (!couponInput.trim()) return;
        setCouponLoading(true);
        try {
            const { data, error } = await supabase
                .schema('core')
                .from('subscription_coupons')
                .select('*')
                .eq('code', couponInput.trim().toUpperCase())
                .eq('is_active', true)
                .maybeSingle();

            if (error || !data) {
                toast({ title: 'Invalid Coupon', description: 'This code does not exist or is inactive.', variant: 'destructive' });
                setAppliedCoupon(null);
            } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
                toast({ title: 'Expired Coupon', description: 'This code has expired.', variant: 'destructive' });
                setAppliedCoupon(null);
            } else if (data.max_uses !== null && data.current_uses >= data.max_uses) {
                toast({ title: 'Coupon Exhausted', description: 'This code has reached its usage limit.', variant: 'destructive' });
                setAppliedCoupon(null);
            } else {
                setAppliedCoupon(data);
                setCouponInput('');
                toast({ title: 'Coupon Applied!', description: `Successfully applied discount.` });
            }
        } catch (err: any) {
             toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
        setCouponLoading(false);
    };

    const handleCheckout = async () => {
        if (!profile?.organization_id || !plan) return;
        setProcessing(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Session expired. Please log in again.');

            const finalPrice = (() => {
                let p = plan.price_monthly;
                if (appliedCoupon) {
                    if (appliedCoupon.discount_type === 'percentage') {
                        p = Math.max(0, p - (p * appliedCoupon.discount_amount / 100));
                    } else {
                        p = Math.max(0, p - appliedCoupon.discount_amount);
                    }
                }
                return p;
            })();

            const res = await fetch('/api/billing/activate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    planId: plan.id,
                    billingCycle: 'monthly',
                    couponCode: appliedCoupon?.code || null,
                    couponId: appliedCoupon?.id || null,
                    orgId: profile.organization_id,
                    amount: finalPrice,
                    gateway: 'smepay',
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Activation Failed');

            toast({
                title: '🎉 Upgrade Successful!',
                description: `Welcome to the ${plan.display_name} plan. Your subscription is now active.`,
            });

            // Hard reload to flush all auth / layout / profile state
            window.location.href = '/settings/billing';

        } catch (error: any) {
            console.error('Checkout error:', error);
            toast({ title: 'Payment Failed', description: error.message || 'An error occurred during checkout.', variant: 'destructive' });
            setProcessing(false);
        }
    };


    if (loading || !plan) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
            </div>
        );
    }

    const Icon = PLAN_ICONS[plan.name] || Zap;

    // Price Math
    let finalPrice = plan.price_monthly;
    let discountStr = '';
    
    if (appliedCoupon) {
        if (appliedCoupon.discount_type === 'percentage') {
             const amt = (finalPrice * appliedCoupon.discount_amount) / 100;
             finalPrice = Math.max(0, finalPrice - amt);
             discountStr = `-${appliedCoupon.discount_amount}% (-₹${amt.toLocaleString()})`;
        } else {
             finalPrice = Math.max(0, finalPrice - appliedCoupon.discount_amount);
             discountStr = `-₹${appliedCoupon.discount_amount.toLocaleString()}`;
        }
    }

    return (
        <div className="min-h-screen bg-[#F0F2F5] pb-20 pt-8">
            <div className="max-w-4xl mx-auto px-6">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Billing
                </button>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left: Summary */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm">
                            <h1 className="text-3xl font-[1000] tracking-tighter uppercase mb-6">Review Upgrade</h1>
                            
                            <div className="flex items-center gap-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl mb-8">
                                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                                    <Icon className="w-7 h-7" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase text-slate-800">{plan.display_name} Edition</h3>
                                    <p className="text-sm font-semibold text-slate-500">{plan.description || "Unlocking maximum team productivity."}</p>
                                </div>
                            </div>

                            <h4 className="font-bold text-slate-800 mb-4 px-2 tracking-tight">What's included in this tier:</h4>
                            <div className="space-y-3 px-2">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                    <span className="font-semibold text-slate-600 text-sm">Up to {plan.max_web_users} Web Users & {plan.max_mobile_users} Mobile Users</span>
                                </div>
                                {(plan.enabled_modules || []).map((m: string) => (
                                    <div key={m} className="flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                        <span className="font-semibold text-slate-600 text-sm capitalize">{m} Module Enabled</span>
                                    </div>
                                ))}
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                    <span className="font-semibold text-slate-600 text-sm">{plan.storage_gb_included}GB Secure Cloud Backup</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 justify-center text-slate-400 p-4">
                            <ShieldCheck className="w-5 h-5" />
                            <span className="text-xs font-bold uppercase tracking-widest">256-Bit Secure Payment Gateway</span>
                        </div>
                    </div>

                    {/* Right: Payment Card */}
                    <div className="md:col-span-1">
                        <div className="bg-slate-900 text-white rounded-[32px] p-8 shadow-xl sticky top-8">
                            <h3 className="font-black tracking-widest text-[11px] uppercase text-slate-400 mb-6 border-b border-white/10 pb-4">Order Summary</h3>
                            
                            <div className="flex justify-between items-center mb-4">
                                <span className="font-semibold text-slate-300">{plan.display_name} (Monthly)</span>
                                <span className="font-bold">₹{plan.price_monthly.toLocaleString()}</span>
                            </div>
                            
                            <div className="flex justify-between items-center mb-6 text-sm text-slate-400">
                                <span>Taxes (Included)</span>
                                <span>₹0</span>
                            </div>

                            {/* Coupon Section */}
                            <div className="mb-6 pt-4 border-t border-white/10">
                                {!appliedCoupon ? (
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Discount Code"
                                            value={couponInput}
                                            onChange={e => setCouponInput(e.target.value.toUpperCase())}
                                            className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-black tracking-widest uppercase h-10"
                                        />
                                        <Button 
                                            onClick={validateCoupon}
                                            disabled={!couponInput || couponLoading}
                                            variant="secondary"
                                            className="bg-white/10 hover:bg-white/20 text-white font-bold h-10 px-4"
                                        >
                                            {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                        <div className="flex items-center gap-2">
                                            <Tag className="w-4 h-4 text-emerald-400" />
                                            <div>
                                                <p className="text-xs font-black tracking-widest uppercase text-emerald-400">{appliedCoupon.code}</p>
                                                <p className="text-[10px] text-emerald-500 font-bold">{appliedCoupon.description || 'Discount Applied'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-emerald-400">{discountStr}</span>
                                            <button onClick={() => setAppliedCoupon(null)} className="text-emerald-500 hover:text-white transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-white/10 pt-6 mb-8 flex justify-between items-end">
                                <span className="font-bold text-slate-400">Total Due</span>
                                <span className="text-4xl font-[1000] tracking-tighter text-white">₹{finalPrice.toLocaleString()}</span>
                            </div>

                            <Button 
                                onClick={handleCheckout} 
                                disabled={processing}
                                className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/50"
                            >
                                {processing ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                                ) : (
                                    'Confirm & Pay'
                                )}
                            </Button>
                            <p className="text-[10px] text-center text-slate-500 mt-4 font-bold uppercase tracking-widest">
                                Billed securely via internal wallet.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

