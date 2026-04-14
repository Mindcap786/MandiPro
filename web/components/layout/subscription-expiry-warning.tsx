'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertOctagon, Clock, CreditCard } from 'lucide-react';
import Link from 'next/link';

export function SubscriptionExpiryWarning() {
    const { profile } = useAuth();
    const [status, setStatus] = useState<any>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.organization_id) return;
        checkExpiry();
    }, [profile]);

    const checkExpiry = async () => {
        try {
            const { data, error } = await supabase.rpc('get_tenant_expiry_status', {
                p_org_id: profile?.organization_id
            });

            if (!error && data) {
                setStatus(data);
                if (data.is_warning || data.status === 'expired') {
                    // Always show the popup on every fresh load if they are in warning/expired state
                    setIsOpen(true);
                }
            }
        } catch (error) {
            console.error('Failed to resolve tenant expiry:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !status) return null;

    // We allow them to close the popup if it's just a warning. If it's expired, we might want to force them (but we'll allow closing for now to prevent hard locks just in case, or we make it non-closable).
    const isExpired = status.status === 'expired';

    return (
        <Dialog open={isOpen} onOpenChange={isExpired ? () => {} : setIsOpen}>
            <DialogContent className="sm:max-w-md border-red-500/20 bg-white shadow-2xl p-0 overflow-hidden">
                <div className="bg-red-50 border-b border-red-100 p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm animate-pulse">
                        {isExpired ? <AlertOctagon className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
                    </div>
                    <DialogTitle className="text-xl font-black text-red-700 tracking-tight">
                        {isExpired ? 'Subscription Expired' : 'Subscription Expiring Soon'}
                    </DialogTitle>
                    <DialogDescription className="text-red-600/80 font-medium mt-1">
                        Action Required for your Organization
                    </DialogDescription>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-center text-sm text-slate-600">
                        {isExpired ? (
                            <span className="font-bold">Your subscription has officially ended.</span>
                        ) : (
                            <span>Your current plan will expire in exactly <span className="font-black text-red-600 text-lg mx-1">{status.days_remaining}</span> days on <span className="font-bold">{new Date(status.expires_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}</span>.</span>
                        )}
                    </p>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 text-center">
                        To ensure uninterrupted access to your POS, Invoicing, and Inventory modules, please renew your subscription or upgrade to a higher tier.
                    </div>
                </div>

                <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-center sm:justify-between items-center">
                    {!isExpired ? (
                        <Button variant="ghost" className="text-slate-500" onClick={() => setIsOpen(false)}>
                            Remind Me Later
                        </Button>
                    ) : (
                        <div></div>
                    )}
                    <Link href="/settings/billing" onClick={() => setIsOpen(false)}>
                        <Button className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
                            <CreditCard className="w-4 h-4" />
                            {isExpired ? 'Renew Now to Restore Access' : 'Renew Subscription'}
                        </Button>
                    </Link>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
