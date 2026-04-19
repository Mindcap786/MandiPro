'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, LogOut, Zap } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function BillingRenewalPage() {
    const { profile, signOut, refreshOrg } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    if (!profile) return null;

    const handleRenew = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/billing/renew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organization_id: profile.organization_id })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Renewal failed');
            }

            toast({
                title: 'Account Reactivated',
                description: 'Your trial has been extended by 14 days for verification.',
            });

            await refreshOrg();
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const org = profile.organization;
    const isTrial = org.status === 'trial';
    const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
    const isActuallyExpired = trialEnd && new Date() > trialEnd;

    return (
        <div className="min-h-screen bg-[#dce7c8] flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-2xl">
                <Card className="bg-white rounded-[40px] border-[#c8d6b0] shadow-[0_20px_60px_-15px_rgba(4,120,87,0.15)] overflow-hidden">
                    <div className="bg-emerald-900 p-12 text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590494165264-1ebe3602eb80?auto=format&fit=crop&q=80&w=2000')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
                        <div className="relative z-10 flex flex-col items-center gap-6">
                            <div className="w-20 h-20 rounded-3xl bg-amber-500 text-black flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                                <AlertCircle className="w-10 h-10" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">Subscription <span className="text-amber-400">Suspended</span></h1>
                                <p className="text-emerald-100/60 font-medium tracking-tight">Your access to the MandiGrow ecosystem has timed out.</p>
                            </div>
                        </div>
                    </div>

                    <CardContent className="p-12 space-y-8 text-center text-gray-700">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 rounded-3xl bg-[#f4f7ee] border border-[#c8d6b0] text-center">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Plan</div>
                                <div className="text-2xl font-black text-emerald-800 uppercase tracking-tighter">{org.subscription_tier}</div>
                            </div>
                            <div className="p-6 rounded-3xl bg-[#f4f7ee] border border-[#c8d6b0] text-center">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Trial Status</div>
                                <div className="text-2xl font-black text-red-600 uppercase tracking-tighter">EXPIRED</div>
                            </div>
                        </div>

                        <div className="space-y-4 max-w-md mx-auto">
                            <p className="font-medium leading-relaxed">
                                To continue managing your mandi operations, arrivals, and financial ledgers, please renew your subscription or upgrade to a feature-rich plan.
                            </p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <Button 
                                onClick={handleRenew}
                                disabled={loading}
                                className="w-full h-16 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Zap className="w-6 h-6" /> Renew Subscription Now</>}
                            </Button>
                            
                            <div className="flex items-center gap-4">
                                <Button 
                                    variant="outline"
                                    onClick={() => router.push('/subscribe')}
                                    className="flex-1 h-16 rounded-2xl border-[#c8d6b0] text-gray-700 font-black text-lg hover:bg-white/50"
                                >
                                    <CreditCard className="w-5 h-5 mr-2" /> Upgrade Plan
                                </Button>
                                <Button 
                                    variant="ghost"
                                    onClick={() => signOut()}
                                    className="h-16 px-8 rounded-2xl text-red-600 font-bold uppercase tracking-widest text-xs hover:bg-red-50"
                                >
                                    <LogOut className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center justify-center gap-6 text-gray-400">
                             <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-[10px] font-bold uppercase tracking-widest">Safe & Secure</span></div>
                             <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-[10px] font-bold uppercase tracking-widest">Instant Activation</span></div>
                        </div>
                    </CardContent>
                </Card>
                
                <p className="mt-8 text-center text-xs font-bold text-emerald-800/60 uppercase tracking-widest">
                    Need help? Contact <a href="mailto:support@mindt.pro" className="underline decoration-emerald-800/30">MandiGrow Support</a>
                </p>
            </div>
        </div>
    );
}
