'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';
import { Lock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';

export function SubscriptionEnforcer() {
    const { user, profile, loading } = useAuth();
    const [hasAccess, setHasAccess] = useState(true);
    const [checking, setChecking] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && user && profile) {
            checkAccess();
        }
    }, [user, profile, loading, pathname]);

    const checkAccess = async () => {
        // Skip check for Admin Portal or Public Pages
        if (pathname?.startsWith('/admin') || pathname?.startsWith('/public') || pathname === '/login' || pathname === '/signup' || pathname === '/suspended') return;

        // Super Admin Org (Mandi HQ) is exempt
        if (profile?.organization?.name === "Mandi HQ") return;

        const orgId = profile?.organization_id || user?.user_metadata?.organization_id;
        if (!orgId) return;

        setChecking(true);
        try {
            const { data, error } = await supabase.rpc('check_subscription_access', { p_org_id: orgId });

            if (error) {
                console.warn("Subscription check failed:", error);
                // Fail friendly: allow access if check fails due to RPC error, 
                // but keep trying on next nav.
                return;
            }

            // If data is false, block.
            if (data === false) {
                setHasAccess(false);
            } else {
                setHasAccess(true);
            }
        } catch (e) {
            console.error("Subscription check error:", e);
        } finally {
            setChecking(false);
        }
    };

    if (hasAccess) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center text-center p-4">
            <div className="bg-[#111] border border-red-500/30 p-8 rounded-2xl max-w-md shadow-2xl animate-in fade-in zoom-in">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-2xl font-black text-white mb-2">SUBSCRIPTION PAUSED</h1>
                <p className="text-gray-400 mb-6">
                    Your organization's access has been restricted due to an overdue payment or lapsed subscription.
                </p>
                <Button className="w-full bg-neon-blue text-black font-bold h-12" onClick={() => window.open('/settings/billing', '_blank')}>
                    <CreditCard className="w-4 h-4 mr-2" /> Pay Now to Restore Access
                </Button>
                <p className="text-xs text-gray-600 mt-4">Contact support@mandi.com if this is an error.</p>
            </div>
        </div>
    );
}
