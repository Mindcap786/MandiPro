'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
    Check,
    CreditCard,
    ShieldCheck,
    Banknote,
    Ticket,
    ArrowLeft,
    Loader2,
    AlertCircle,
    QrCode,
    Smartphone,
    Timer,
    ExternalLink,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Checkout() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const supabaseClient = supabase;

    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState(false);
    const [plan, setPlan] = useState<any>(null);
    const [gatewayConfig, setGatewayConfig] = useState<any>(null);
    const [couponCode, setCouponCode] = useState('');
    const [couponStatus, setCouponStatus] = useState<any>(null);
    const [selectedGateway, setSelectedGateway] = useState<string>('smepay');
    const [org, setOrg] = useState<any>(null);
    const [userEmail, setUserEmail] = useState('');
    const [userName, setUserName] = useState('');

    // Realtime: listen for webhook-driven subscription activation.
    // The polling loop is kept as a fallback; this makes the UI flip
    // instantly the moment the signature-verified webhook writes the row.
    useEffect(() => {
        if (!org?.id) return;
        const channel = supabaseClient
            .channel(`sub-activation-${org.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'core',
                    table: 'subscriptions',
                    filter: `organization_id=eq.${org.id}`,
                },
                (payload) => {
                    const next = payload.new as { status?: string } | null;
                    if (next?.status === 'active') {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        setSmepayState('success');
                        toast.success('Payment confirmed — subscription active!');
                        setTimeout(() => router.push('/dashboard?upgrade=success'), 1500);
                    }
                },
            )
            .subscribe();
        return () => {
            supabaseClient.removeChannel(channel);
        };
    }, [org?.id, router, supabaseClient]);

    // SME Pay state
    const [smepayState, setSmepayState] = useState<'idle' | 'loading' | 'payment' | 'polling' | 'success' | 'failed' | 'expired'>('idle');
    const [smepayData, setSmepayData] = useState<any>(null);
    const [smepayCountdown, setSmepayCountdown] = useState(300); // 5 min
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    const planName = searchParams.get('plan_id') || 'basic';
    const cycle = searchParams.get('cycle') || 'monthly';

    const [couponLoading, setCouponLoading] = useState(false);

    const planPrice = cycle === 'yearly' ? (plan?.price_yearly || 0) : (plan?.price_monthly || 0);
    const discount = couponStatus?.isValid
        ? (couponStatus.type === 'percentage' ? (planPrice * couponStatus.amount / 100) : couponStatus.amount)
        : 0;
    const finalPrice = Math.max(0, planPrice - discount);

    useEffect(() => {
        fetchData();
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [planName]);

    const fetchData = async () => {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUserEmail(user.email || '');

            const { data: profile } = await supabaseClient
                .schema('core')
                .from('profiles')
                .select('*, organization:organization_id(*)')
                .eq('id', user.id)
                .maybeSingle();

            setOrg(profile?.organization || null);
            setUserName(profile?.full_name || user.user_metadata?.full_name || '');

            const { data: planData } = await supabaseClient
                .schema('core')
                .from('app_plans')
                .select('*')
                .or(`id.eq.${planName},name.ilike.${planName}`)
                .order('sort_order', { ascending: true })
                .limit(1)
                .maybeSingle();
            setPlan(planData);

            // payment_config is optional — fail gracefully if table doesn't exist
            try {
                const { data: gateway } = await supabaseClient
                    .schema('core')
                    .from('payment_config')
                    .select('*')
                    .eq('is_active', true)
                    .maybeSingle();
                setGatewayConfig(gateway);
            } catch {
                // payment_config table may not be provisioned yet — SME Pay still works
                setGatewayConfig(null);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyCoupon = async () => {
        if (!couponCode) return;
        setCouponLoading(true);
        try {
            const res = await fetch('/api/billing/coupon-validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: couponCode, planId: planName, cycle })
            });
            const data = await res.json();
            if (data.isValid) {
                setCouponStatus(data);
                toast.success(`Coupon Applied: ${data.message}`);
            } else {
                setCouponStatus(null);
                toast.error(data.message || 'Invalid Coupon');
            }
        } catch {
            toast.error('Failed to validate coupon');
        } finally {
            setCouponLoading(false);
        }
    };

    // ========== SME Pay Flow ==========
    const handleSmepayPayment = async () => {
        setSmepayState('loading');
        setActivating(true);

        try {
            const res = await fetch('/api/payments/smepay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orgId: org?.id,
                    planId: planName,
                    billingCycle: cycle,
                    amount: finalPrice,
                    customerEmail: userEmail,
                    customerName: userName,
                    couponCode: couponStatus?.isValid ? couponCode : null,
                }),
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to create payment');

            setSmepayData(data);
            setSmepayState('payment');
            setActivating(false);

            // Calculate countdown from expires_at
            const expiresIn = data.expiresAt ? Math.max(0, data.expiresAt - Math.floor(Date.now() / 1000)) : 300;
            setSmepayCountdown(expiresIn);

            // Start countdown timer
            countdownRef.current = setInterval(() => {
                setSmepayCountdown(prev => {
                    if (prev <= 1) {
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        setSmepayState('expired');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            // Start polling for payment status
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/payments/smepay/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orgId: org?.id, slug: data.slug }),
                    });
                    const statusData = await statusRes.json();

                    if (statusData.activated) {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        setSmepayState('success');
                        toast.success('Payment Confirmed! Activating subscription...');
                        setTimeout(() => router.push('/dashboard'), 2000);
                    } else if (statusData.status === 'failed') {
                        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                        if (countdownRef.current) clearInterval(countdownRef.current);
                        setSmepayState('failed');
                        toast.error('Payment failed. Please try again.');
                    }
                } catch {
                    // Ignore polling errors, keep trying
                }
            }, 5000);

        } catch (e: any) {
            toast.error(e.message || 'Payment initiation failed');
            setSmepayState('idle');
            setActivating(false);
        }
    };

    // ========== Real-gateway dispatch ==========
    // Every path must complete a real payment. The backend webhook is the only
    // writer of `subscriptions.status = 'active'`; the frontend never activates.
    const handleActivate = async () => {
        if (selectedGateway === 'smepay') {
            return handleSmepayPayment();
        }
        if (selectedGateway === 'manual') {
            toast.error('Manual / bank transfer plans are activated by support after funds are verified. Please contact support@mandigrow.com.');
            return;
        }
        toast.error('Please choose UPI (SME Pay) to complete payment.');
    };

    const formatCountdown = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
            {/* Header */}
            <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold transition-all">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Plans
                </button>
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-black uppercase tracking-tighter text-slate-400">Secure Checkout</span>
                </div>
            </div>

            {/*
              Mobile: column-reverse so Pay Summary appears FIRST (top of screen).
              Desktop: 12-col grid with left summary + right sticky pay panel.
            */}
            <main className="max-w-7xl mx-auto px-4 md:px-6 pb-24">
                {/* ── MOBILE ORDER SUMMARY + PAY BUTTON (shown first on mobile only) ── */}
                <div className="lg:hidden mb-6">
                    <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl border-2 border-emerald-500/20">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80 mb-1">Order Total</p>
                                <span className="text-3xl font-black">₹{finalPrice.toLocaleString()}</span>
                                {discount > 0 && (
                                    <span className="ml-2 text-emerald-400 text-sm font-bold">(-₹{discount.toLocaleString()} off)</span>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{plan?.display_name || plan?.name} Plan</p>
                                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                    {cycle} Billing
                                </span>
                            </div>
                        </div>
                        <Button
                            onClick={handleActivate}
                            disabled={activating || (selectedGateway === 'smepay' && smepayState !== 'idle')}
                            className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-base font-black shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                            {selectedGateway === 'smepay'
                                ? (smepayState === 'idle' ? `Pay ₹${finalPrice.toLocaleString()} via UPI` : 'Payment in Progress...')
                                : 'Confirm & Activate'
                            }
                        </Button>
                        <p className="text-center text-[10px] opacity-40 font-bold uppercase mt-3 tracking-widest">
                            🔒 256-bit SSL Encrypted • Powered by SME Pay
                        </p>
                    </div>
                </div>

                {/* ── MAIN CONTENT GRID (desktop: side by side) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Left: Summary */}
                <div className="lg:col-span-7 space-y-8">
                    {/* Plan Summary Card */}
                    <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm transition-all hover:shadow-xl hover:shadow-slate-200/50">
                        <div className="flex items-center justify-between mb-6 md:mb-10">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Subscription Summary</h1>
                                <p className="text-slate-500 font-bold mt-1">Review your plan details before activation</p>
                            </div>
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-2xl md:text-3xl">
                                {plan?.name?.toLowerCase() === 'basic' ? '🌱' : plan?.name?.toLowerCase() === 'standard' ? '🚀' : '💎'}
                            </div>
                        </div>

                        <div className="p-5 md:p-8 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between group">
                            <div className="flex items-center gap-4 md:gap-6">
                                <div className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-200 font-black text-emerald-600 text-lg">
                                    {(plan?.display_name || plan?.name || 'P')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="font-black text-base md:text-xl capitalize text-slate-900">{plan?.display_name || plan?.name}</h3>
                                    <div className="flex items-center gap-2 md:gap-3 mt-1 flex-wrap">
                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest leading-none">
                                            {cycle} Billing
                                        </span>
                                        <span className="text-xs md:text-sm font-bold text-slate-400">
                                            {(plan?.max_total_users === -1 || plan?.max_users === -1) ? '∞' : (plan?.max_total_users ?? plan?.max_users ?? plan?.max_web_users)} Users included
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                onClick={() => router.push('/settings/billing')}
                                className="h-10 px-4 md:h-12 md:px-6 rounded-xl hover:bg-emerald-50 text-emerald-600 font-black transition-all text-sm"
                            >
                                Change
                            </Button>
                        </div>
                    </div>

                    {/* Coupons Section */}
                    <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-6 md:mb-8">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                <Ticket className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-black text-slate-900">Have a coupon?</h2>
                                <p className="text-sm text-slate-500 font-bold">Apply your discount code below</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <Input
                                    placeholder="Enter Code (e.g. EARLYBIRD50)"
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                    className="h-12 md:h-16 pl-4 md:pl-6 rounded-2xl border-slate-200 font-bold text-base md:text-lg placeholder:text-slate-300 focus:ring-emerald-500/20"
                                />
                                {couponStatus?.isValid && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                        <Check className="w-4 h-4" />
                                        <span className="text-xs font-black uppercase tracking-tighter">Applied</span>
                                    </div>
                                )}
                            </div>
                            <Button
                                onClick={handleApplyCoupon}
                                disabled={couponLoading || !couponCode}
                                className="h-12 md:h-16 px-6 md:px-8 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black transition-all active:scale-95"
                            >
                                {couponLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Apply'}
                            </Button>
                        </div>
                    </div>

                    {/* Gateway Selection */}
                    <div className="bg-white rounded-[2.5rem] p-6 md:p-10 border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-4 mb-6 md:mb-10">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                <CreditCard className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-black text-slate-900">Payment Method</h2>
                                <p className="text-sm text-slate-500 font-bold">Select how you want to pay</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {/* SME Pay Gateway (Primary) */}
                            <div
                                onClick={() => { setSelectedGateway('smepay'); setSmepayState('idle'); }}
                                className={cn(
                                    "p-5 md:p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
                                    selectedGateway === 'smepay' ? "border-emerald-500 bg-emerald-50/30 shadow-lg shadow-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                                )}
                            >
                                <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0", selectedGateway === 'smepay' ? "border-emerald-500 bg-emerald-500" : "border-slate-200")}>
                                    {selectedGateway === 'smepay' && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="font-black text-slate-900 block">UPI Payment</span>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">GPay, PhonePe, Paytm & all UPI apps</span>
                                </div>
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Recommended</span>
                            </div>

                            {gatewayConfig?.gateway_type === 'razorpay' && (
                                <div
                                    onClick={() => setSelectedGateway('razorpay')}
                                    className={cn(
                                        "p-5 md:p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
                                        selectedGateway === 'razorpay' ? "border-emerald-500 bg-emerald-50/30 shadow-lg shadow-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                                    )}
                                >
                                    <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all", selectedGateway === 'razorpay' ? "border-emerald-500 bg-emerald-500" : "border-slate-200")}>
                                        {selectedGateway === 'razorpay' && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                    <div className="flex-1">
                                        <span className="font-black text-slate-900 block">Razorpay</span>
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cards, UPI, Netbanking</span>
                                    </div>
                                </div>
                            )}

                            <div
                                onClick={() => setSelectedGateway('manual')}
                                className={cn(
                                    "p-5 md:p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center gap-4",
                                    selectedGateway === 'manual' ? "border-emerald-500 bg-emerald-50/30 shadow-lg shadow-emerald-500/10" : "border-slate-100 hover:border-slate-200"
                                )}
                            >
                                <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all", selectedGateway === 'manual' ? "border-emerald-500 bg-emerald-500" : "border-slate-200")}>
                                    {selectedGateway === 'manual' && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <div className="flex-1">
                                    <span className="font-black text-slate-900 block">Manual / IMPS / Cash</span>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Bank Transfer</span>
                                </div>
                            </div>
                        </div>

                        {/* ========== SME Pay QR Code / UPI Section ========== */}
                        {selectedGateway === 'smepay' && smepayState === 'payment' && smepayData && (
                            <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="p-6 md:p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-slate-700">
                                    {/* Timer */}
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <QrCode className="w-5 h-5 text-emerald-400" />
                                            <span className="font-black uppercase tracking-wider text-xs text-emerald-400">Scan & Pay</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Timer className="w-4 h-4 text-amber-400" />
                                            <span className={cn(
                                                "font-mono font-black text-sm",
                                                smepayCountdown < 60 ? "text-red-400" : "text-amber-400"
                                            )}>
                                                {formatCountdown(smepayCountdown)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* QR Code */}
                                    <div className="flex flex-col items-center gap-6">
                                        {smepayData.qrCode && (
                                            <div className="bg-white p-4 rounded-2xl shadow-lg">
                                                <img
                                                    src={smepayData.qrCode}
                                                    alt="Payment QR Code"
                                                    className="w-48 h-48 object-contain"
                                                />
                                            </div>
                                        )}

                                        <div className="text-center">
                                            <p className="text-white font-black text-lg">Scan with any UPI app</p>
                                            <p className="text-slate-400 text-sm font-bold mt-1">Payment of ₹{finalPrice.toLocaleString()}</p>
                                        </div>

                                        {/* UPI App Deep Links */}
                                        {smepayData.intents && (
                                            <div className="w-full space-y-3">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Or pay directly via</p>
                                                <div className="grid grid-cols-3 gap-3">
                                                    {smepayData.intents.gpay && (
                                                        <a href={smepayData.intents.gpay} className="flex flex-col items-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all border border-slate-600">
                                                            <Smartphone className="w-5 h-5 text-blue-400" />
                                                            <span className="text-[10px] font-black text-white uppercase">GPay</span>
                                                        </a>
                                                    )}
                                                    {smepayData.intents.phonepe && (
                                                        <a href={smepayData.intents.phonepe} className="flex flex-col items-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all border border-slate-600">
                                                            <Smartphone className="w-5 h-5 text-purple-400" />
                                                            <span className="text-[10px] font-black text-white uppercase">PhonePe</span>
                                                        </a>
                                                    )}
                                                    {smepayData.intents.paytm && (
                                                        <a href={smepayData.intents.paytm} className="flex flex-col items-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all border border-slate-600">
                                                            <Smartphone className="w-5 h-5 text-cyan-400" />
                                                            <span className="text-[10px] font-black text-white uppercase">Paytm</span>
                                                        </a>
                                                    )}
                                                </div>

                                                {smepayData.paymentLink && (
                                                    <a
                                                        href={smepayData.paymentLink}
                                                        className="flex items-center justify-center gap-2 w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm transition-all"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        Open UPI App
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Polling indicator */}
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="text-xs font-bold">Waiting for payment confirmation...</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SME Pay Loading */}
                        {selectedGateway === 'smepay' && smepayState === 'loading' && (
                            <div className="mt-8 p-10 md:p-12 bg-slate-900 rounded-3xl border border-slate-700 flex flex-col items-center justify-center animate-in fade-in duration-300">
                                <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
                                <p className="text-white font-black text-lg">Generating Payment...</p>
                                <p className="text-slate-400 text-sm font-bold mt-1">Creating secure UPI payment link</p>
                            </div>
                        )}

                        {/* SME Pay Success */}
                        {selectedGateway === 'smepay' && smepayState === 'success' && (
                            <div className="mt-8 p-10 md:p-12 bg-emerald-900 rounded-3xl border border-emerald-700 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
                                    <CheckCircle2 className="w-8 h-8 text-white" />
                                </div>
                                <p className="text-white font-black text-xl">Payment Successful!</p>
                                <p className="text-emerald-300 text-sm font-bold mt-1">₹{finalPrice.toLocaleString()} received</p>
                                <p className="text-emerald-400/60 text-xs font-bold mt-3">Redirecting to dashboard...</p>
                            </div>
                        )}

                        {/* SME Pay Failed */}
                        {selectedGateway === 'smepay' && smepayState === 'failed' && (
                            <div className="mt-8 p-10 md:p-12 bg-red-900 rounded-3xl border border-red-700 flex flex-col items-center justify-center animate-in fade-in duration-300">
                                <XCircle className="w-12 h-12 text-red-400 mb-4" />
                                <p className="text-white font-black text-lg">Payment Failed</p>
                                <p className="text-red-300 text-sm font-bold mt-1">Please try again or use a different method</p>
                                <Button
                                    onClick={() => { setSmepayState('idle'); setSmepayData(null); }}
                                    className="mt-4 bg-white text-red-900 font-black hover:bg-red-50"
                                >
                                    Try Again
                                </Button>
                            </div>
                        )}

                        {/* SME Pay Expired */}
                        {selectedGateway === 'smepay' && smepayState === 'expired' && (
                            <div className="mt-8 p-10 md:p-12 bg-amber-900/50 rounded-3xl border border-amber-700 flex flex-col items-center justify-center animate-in fade-in duration-300">
                                <Timer className="w-12 h-12 text-amber-400 mb-4" />
                                <p className="text-white font-black text-lg">Payment Expired</p>
                                <p className="text-amber-300 text-sm font-bold mt-1">The QR code has expired. Please generate a new one.</p>
                                <Button
                                    onClick={() => { setSmepayState('idle'); setSmepayData(null); }}
                                    className="mt-4 bg-white text-amber-900 font-black hover:bg-amber-50"
                                >
                                    Generate New QR
                                </Button>
                            </div>
                        )}

                        {selectedGateway === 'manual' && (
                            <div className="mt-8 p-6 md:p-8 bg-blue-50/50 rounded-3xl border border-blue-100/50 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center gap-3 mb-6">
                                    <Banknote className="w-4 h-4 text-blue-600" />
                                    <span className="font-black uppercase tracking-wider text-xs text-blue-700">Bank Transfer Details</span>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between border-b border-blue-100/50 pb-3">
                                        <span className="text-sm font-bold text-blue-900/60">Account Name</span>
                                        <span className="text-sm font-black text-blue-900">{gatewayConfig?.manual_config?.account_name || 'MandiGrow Solutions'}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-blue-100/50 pb-3">
                                        <span className="text-sm font-bold text-blue-900/60">Bank Name</span>
                                        <span className="text-sm font-black text-blue-900">{gatewayConfig?.manual_config?.bank_name || 'HDFC Bank'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm font-bold text-blue-900/60">A/C Number & IFSC</span>
                                        <span className="text-sm font-black text-blue-900">
                                            {gatewayConfig?.manual_config?.account_no || '502000XXXXXXX'} / {gatewayConfig?.manual_config?.ifsc || 'HDFC000XXXX'}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-6 p-4 bg-white/60 rounded-2xl border border-blue-200/50 flex gap-3 items-start">
                                    <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                                    <p className="text-[11px] font-bold leading-relaxed text-blue-600">
                                        Send a screenshot of payment to our WhatsApp support (+91-XXXXX-XXXXX) for immediate activation.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Payment / Total — DESKTOP ONLY (hidden on mobile, shown above instead) */}
                <div className="hidden lg:block lg:col-span-5">
                    <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl sticky top-8 border-4 border-emerald-500/10 backdrop-blur-3xl">
                        <div className="flex items-center gap-3 mb-10 opacity-60">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                            <h2 className="text-sm font-black uppercase tracking-[0.2em]">Premium Order Summary</h2>
                        </div>

                        <div className="space-y-6 mb-10">
                            <div className="flex justify-between items-center group">
                                <span className="opacity-50 font-bold group-hover:opacity-100 transition-opacity capitalize">{plan?.display_name || plan?.name || 'Subscription'} Plan ({cycle})</span>
                                <span className="font-black text-xl tracking-tighter">₹{planPrice.toLocaleString()}</span>
                            </div>

                            {discount > 0 && (
                                <div className="flex justify-between items-center px-5 py-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 animate-in zoom-in-95 duration-300">
                                    <div className="flex items-center gap-2">
                                        <Ticket className="w-4 h-4 text-emerald-400" />
                                        <span className="text-emerald-400 font-black text-xs uppercase tracking-widest">Coupon Savings</span>
                                    </div>
                                    <span className="font-black text-emerald-400">-₹{discount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="h-px bg-white/10 my-6" />
                            <div className="flex justify-between items-end">
                                <span className="text-lg font-black italic">Total Payable</span>
                                <span className="text-4xl font-black">₹{finalPrice.toLocaleString()}</span>
                            </div>
                        </div>

                        <Button
                            onClick={handleActivate}
                            disabled={activating || (selectedGateway === 'smepay' && smepayState !== 'idle')}
                            className="w-full py-8 rounded-3xl bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            {activating ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}
                            {selectedGateway === 'smepay'
                                ? (smepayState === 'idle' ? `Pay ₹${finalPrice.toLocaleString()} via UPI` : 'Payment in Progress...')
                                : 'Confirm & Activate'
                            }
                        </Button>

                        {selectedGateway === 'smepay' && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <ShieldCheck className="w-3 h-3 text-emerald-400/50" />
                                <p className="text-center text-[11px] opacity-40 font-bold uppercase tracking-widest">
                                    Powered by SME Pay - Secure UPI Gateway
                                </p>
                            </div>
                        )}

                        <p className="text-center text-[11px] opacity-40 font-bold uppercase mt-4 tracking-widest">
                            Secure 256-bit SSL Encrypted Payment
                        </p>
                    </div>
                </div>
                </div>
            </main>
        </div>
    );
}

