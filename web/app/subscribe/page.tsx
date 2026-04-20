'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Loader2, Monitor, Smartphone, Check, ArrowRight, Zap, Shield, Crown, Info, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

import * as Icons from 'lucide-react';

const PLAN_META: Record<string, { icon: any; color: string; bgColor: string; borderColor: string; description: string; tag: string | null }> = {
    'basic': { icon: Icons.Monitor, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100', description: 'Essential features for small teams getting started.', tag: null },
    'standard': { icon: Icons.Zap, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-100', description: 'Advanced tools for growing businesses.', tag: 'Popular' },
    'enterprise': { icon: Icons.Crown, color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-100', description: 'Maximum scale and dedicated support for large operations.', tag: 'Best Value' },
};

const ACCENT_MAP: Record<string, any> = {
    'emerald': { color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-100', borderActive: 'border-emerald-200', ring: 'ring-emerald-50', bgActive: 'bg-emerald-600' },
    'indigo': { color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-100', borderActive: 'border-indigo-200', ring: 'ring-indigo-50', bgActive: 'bg-indigo-600' },
    'purple': { color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-100', borderActive: 'border-purple-200', ring: 'ring-purple-50', bgActive: 'bg-purple-600' },
};

const getPlanVisuals = (plan: any) => {
    const name = plan.name.toLowerCase();
    const meta = PLAN_META[name] || PLAN_META['basic'];
    
    // Override with dynamic values from features
    const dynamicIcon = plan.features?.icon ? (Icons as any)[plan.features.icon] : null;
    const accent = plan.features?.accent_color || (name === 'standard' ? 'indigo' : name === 'enterprise' ? 'purple' : 'emerald');
    const tag = plan.features?.tag || meta.tag;
    const visuals = ACCENT_MAP[accent] || ACCENT_MAP['emerald'];

    return {
        Icon: dynamicIcon || meta.icon,
        color: visuals.color,
        bgColor: visuals.bgColor,
        borderColor: visuals.borderColor,
        borderActive: visuals.borderActive,
        ring: visuals.ring,
        bgActive: visuals.bgActive,
        tag,
    };
};

export default function SubscribePage() {
    const router = useRouter();
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        fetchPlans();
        checkUser();
    }, []);

    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
    };

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseRaw = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            const { data, error } = await supabaseRaw
                .schema('core')
                .from('app_plans')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            
            // Only show the 3 default plans OR custom plans explicitly marked to be shown
            const visiblePlans = (data || []).filter((plan: any) => 
                ['basic', 'standard', 'enterprise'].includes(plan.name.toLowerCase()) || 
                plan.features?.show_on_homepage === true
            );
            
            setPlans(visiblePlans);
        } catch (err) {
            console.error('Error fetching plans:', err);
            setPlans([]);
        } finally {
            setLoading(false);
        }
    };

    const formatPrice = (price: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            {/* Header / Nav */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="font-black text-xl tracking-tighter flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-700 rounded flex items-center justify-center text-white font-black text-xl">M</div>
                        MandiGrow
                    </Link>
                    {user ? (
                        <Link href="/dashboard" className="text-sm font-black text-slate-900 bg-slate-100 px-5 py-2 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2">
                            Go to Dashboard <ArrowRight className="w-4 h-4" />
                        </Link>
                    ) : (
                        <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-emerald-700 transition-colors">
                            Sign In
                        </Link>
                    )}
                </div>
            </nav>

            {/* Hero */}
            <div className="bg-white border-b border-slate-200 py-20">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <p className="text-emerald-600 font-bold text-sm uppercase tracking-widest mb-4">PRICING</p>
                    <h1 className="text-4xl md:text-6xl font-black text-emerald-950 mb-6 tracking-tight">
                        Pricing that's <span className="text-emerald-600">straightforward</span>, flexible, and future-ready
                    </h1>
                    <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-slate-500 font-medium">
                        <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> 14-day free trial</div>
                        <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> No surprise charges</div>
                        <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Scales with you</div>
                    </div>

                    {/* Billing Toggle */}
                    <div className="flex items-center justify-center gap-4 mt-12 bg-slate-100 p-1.5 rounded-xl w-fit mx-auto">
                        <button
                            onClick={() => setBilling('monthly')}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                                billing === 'monthly' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBilling('yearly')}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                                billing === 'yearly' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            Yearly
                            {plans.length > 0 && (() => {
                                const maxSavings = Math.max(...plans.map(p => 
                                    p.price_monthly > 0 
                                        ? Math.round(100 * (1 - (p.price_yearly / (p.price_monthly * 12))))
                                        : 0
                                ));
                                return maxSavings > 0 ? (
                                    <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                                        SAVE ~{maxSavings}%
                                    </span>
                                ) : null;
                            })()}
                        </button>
                    </div>
                </div>
            </div>

            {/* Plans Grid */}
            <div className="max-w-7xl mx-auto px-6 -mt-12 pb-24">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-6" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Configuring Your Experience...</p>
                    </div>
                ) : plans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 bg-white rounded-3xl border border-slate-200 shadow-sm text-center px-6">
                        <Info className="w-10 h-10 text-slate-300 mb-4" />
                        <h3 className="text-xl font-black text-slate-900 mb-2">Custom Setup Required</h3>
                        <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium">
                            We're currently scaling our public plan server. For immediate access, please contact our implementation team.
                        </p>
                        <Link href="/contact">
                            <Button variant="outline" className="px-8 py-6 rounded-xl border-slate-200 font-bold hover:bg-slate-50">
                                Speak to a Munshi
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {plans.map((plan) => {
                            const { Icon, color, bgColor, tag, bgActive, borderActive, ring } = getPlanVisuals(plan);
                            const meta = PLAN_META[plan.name.toLowerCase()] || PLAN_META['basic'];
                            
                            // Monthly equivalent for display; yearly shows total charged
                            const price = billing === 'monthly' ? plan.price_monthly : Math.round(plan.price_yearly / 12);
                            const savingsPct = plan.price_monthly > 0 
                                ? Math.round(100 * (1 - (plan.price_yearly / (plan.price_monthly * 12))))
                                : 0;
                            const isStandard = plan.name.toLowerCase() === 'standard' || plan.features?.tag?.toLowerCase() === 'popular';

                            return (
                                 <div 
                                    key={plan.id} 
                                    className={cn(
                                        "bg-white border rounded-[32px] p-8 flex flex-col transition-all duration-300 hover:shadow-2xl group flex-1",
                                        isStandard 
                                            ? `${borderActive} shadow-xl ring-4 ${ring} ring-opacity-50 -mt-4 mb-4` 
                                            : "border-slate-200 shadow-sm"
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-8">
                                        <div className={cn("p-4 rounded-2xl", bgColor, color)}>
                                            <Icon className="w-8 h-8" />
                                        </div>
                                        {tag && (
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                                                isStandard ? `${bgActive} text-white` : "bg-slate-100 text-slate-600"
                                            )}>
                                                {tag}
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-2xl font-black text-slate-900 mb-2">{plan.display_name}</h3>
                                    <p className="text-slate-500 text-sm leading-relaxed mb-8 flex-grow">
                                        {plan.description || meta.description}
                                    </p>

                                    <div className="mb-10">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-5xl font-black tracking-tight text-slate-900">{formatPrice(price)}</span>
                                            <span className="text-slate-400 font-bold">/mo</span>
                                        </div>
                                        {billing === 'yearly' && (
                                            <div className="mt-2 space-y-0.5">
                                                <p className="text-sm text-green-600 font-bold">
                                                    {formatPrice(plan.price_yearly)} billed annually
                                                </p>
                                                {savingsPct > 0 && (
                                                    <p className="text-[10px] text-green-500 font-black uppercase tracking-widest">
                                                        Save {savingsPct}% vs monthly
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4 mb-10 border-t border-slate-50 pt-8">
                                        <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                            <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                <Check className="w-3 h-3 text-blue-600" />
                                            </div>
                                            <Users className="w-4 h-4 text-slate-400" />
                                            {(() => {
                                                const maxUsers = plan.max_total_users ?? plan.max_users ?? plan.max_web_users ?? 0;
                                                return <span>{maxUsers < 0 ? 'Unlimited' : maxUsers} User{maxUsers !== 1 ? 's' : ''} (Web + Mobile)</span>;
                                            })()}
                                        </div>
                                        {plan.enabled_modules?.map((module: string) => (
                                            <div key={module} className="flex items-center gap-3 text-sm font-semibold text-slate-700 capitalize">
                                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                    <Check className="w-3 h-3 text-blue-600" />
                                                </div>
                                                {module} Module
                                            </div>
                                        ))}
                                    </div>

                                    <Link href={user ? `/checkout?plan_id=${plan.id}&cycle=${billing}` : `/login?plan_id=${plan.id}`}>
                                        <Button 
                                            className={cn(
                                                "w-full py-7 text-lg font-black transition-all rounded-2xl",
                                                isStandard 
                                                    ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-lg shadow-emerald-200" 
                                                    : "bg-slate-900 hover:bg-slate-800 text-white"
                                            )}
                                        >
                                            {user ? (billing === 'yearly' ? 'Upgrade Now (Save 20%)' : 'Upgrade Now') : 'Start Free Trial'}
                                        </Button>
                                    </Link>
                                    <p className="text-center text-[11px] text-slate-400 font-bold uppercase mt-4 tracking-widest">
                                        No Credit Card Required
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Comparison Brief / Footer */}
            <div className="bg-white border-t border-slate-200 py-24">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-black text-slate-900 mb-6">Need a custom plan?</h2>
                    <p className="text-slate-500 mb-10 leading-relaxed max-w-2xl mx-auto text-lg">
                        For large-scale enterprises that need deeper capabilities, extended modules, and advanced system features.
                    </p>
                    <Link href="/contact">
                        <Button variant="outline" className="px-8 py-6 rounded-xl border-slate-200 font-bold hover:bg-slate-50">
                            Contact Sales
                        </Button>
                    </Link>
                    
                    <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
                        <div>
                            <h4 className="font-bold text-slate-900 mb-3">Enterprise Support</h4>
                            <p className="text-sm text-slate-500 leading-relaxed">Dedicated account managers and 24/7 priority support for large operations.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-3">Secure & Compliant</h4>
                            <p className="text-sm text-slate-500 leading-relaxed">Bank-grade encryption and regular security audits to keep your data safe.</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 mb-3">Seamless Migration</h4>
                            <p className="text-sm text-slate-500 leading-relaxed">Our team helps you port your data from Tally or old ERPs in less than 48 hours.</p>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="bg-slate-50 border-t border-slate-200 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                <p>&copy; 2026 MandiGrow Software Solutions Pvt Ltd. All rights reserved.</p>
            </footer>
        </div>
    );
}
