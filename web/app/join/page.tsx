'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function Join() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'validating' | 'valid' | 'invalid' | 'accepting' | 'success'>('validating');
    const [invite, setInvite] = useState<any>(null);
    const [orgName, setOrgName] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (token) validateToken();
        else setStatus('invalid');
    }, [token]);

    const validateToken = async () => {
        const { data, error } = await supabase
            .from('invitations')
            .select(`
                *,
                organization:organizations(name)
            `)
            .eq('token', token)
            .eq('status', 'pending')
            .single();

        if (error || !data) {
            setStatus('invalid');
            setErrorMsg('This invite link is invalid or has expired.');
        } else {
            // Check expiry
            if (new Date(data.expires_at) < new Date()) {
                setStatus('invalid');
                setErrorMsg('This invite has expired.');
                return;
            }

            setInvite(data);
            setOrgName(data.organization?.name || 'the organization');
            setStatus('valid');
        }
    };

    const handleJoin = async () => {
        setStatus('accepting');

        // 1. Get Current User
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Store token and redirect to login/signup
            // For now, let's assume they MUST be logged in or we redirect to signup
            router.push(`/login?redirectTo=/join?token=${token}`);
            return;
        }

        // 2. Link Profile to Org
        // We use an RPC or just direct update if generic RLS allows (security risk if not careful)
        // Let's use a specialized RPC for safety next time, but direct update for MVP if RLS permits "update own profile if invite exists"

        // BETTER: Create profile if not exists, or update.
        // Actually, we should probably call a backend function to allow "elevated" write to profiles based on valid token
        // For MVP, we will try to update profile directly. If RLS blocks, we need an RPC.

        // Let's assume we need an RPC 'accept_invitation' for security
        const { error } = await supabase.rpc('accept_invitation', {
            invite_token: token
        });

        if (error) {
            setStatus('invalid');
            setErrorMsg(error.message);
        } else {
            setStatus('success');
            setTimeout(() => {
                router.replace('/');
                router.refresh();
            }, 2000);
        }
    };

    if (status === 'validating') {
        return <div className="h-screen flex items-center justify-center bg-[#050510]"><Loader2 className="animate-spin text-neon-blue w-8 h-8" /></div>;
    }

    if (status === 'invalid') {
        return (
            <div className="h-screen flex items-center justify-center bg-[#050510] p-4">
                <Card className="w-full max-w-md bg-white/5 border-white/10 text-white">
                    <CardHeader className="text-center">
                        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <CardTitle className="text-xl">Invalid Invitation</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-gray-400">
                        {errorMsg || "We couldn't verify this invitation."}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full bg-white/10 hover:bg-white/20" onClick={() => router.push('/')}>Go Home</Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="h-screen flex items-center justify-center bg-[#050510] p-4">
                <Card className="w-full max-w-md bg-green-500/10 border-green-500/20 text-white">
                    <CardHeader className="text-center">
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <CardTitle className="text-xl">Welcome to Team {orgName}!</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-gray-400">
                        Redirecting you to the dashboard...
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="h-screen flex items-center justify-center bg-[#050510] relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-blue rounded-full blur-[128px]" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[128px]" />
            </div>

            <Card className="w-full max-w-md bg-black/40 backdrop-blur-xl border-white/10 text-white relative z-10">
                <CardHeader>
                    <div className="w-12 h-12 bg-neon-blue/20 rounded-xl flex items-center justify-center mb-4">
                        <ShieldCheck className="w-6 h-6 text-neon-blue" />
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">You've been invited!</CardTitle>
                    <p className="text-gray-400">
                        Join <strong>{orgName}</strong> as a <span className="text-white font-bold uppercase text-xs bg-white/10 px-2 py-0.5 rounded">{invite.role}</span>
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="p-4 rounded-lg bg-white/5 border border-white/5 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">From</span>
                            <span className="font-medium">Admin</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">To</span>
                            <span className="font-medium">{invite.email}</span>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        onClick={handleJoin}
                        disabled={status === 'accepting'}
                        className="w-full h-12 text-lg font-bold bg-gradient-to-r from-neon-blue to-purple-600 hover:opacity-90 transition-opacity"
                    >
                        {status === 'accepting' ? <Loader2 className="animate-spin" /> : <>Accept & Join <ArrowRight className="ml-2 w-5 h-5" /></>}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function JoinPage() {
    return (
        <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-[#050510]">
                <Loader2 className="animate-spin text-neon-blue w-8 h-8" />
            </div>
        }>
            <Join />
        </Suspense>
    );
}
