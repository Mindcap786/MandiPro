'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { supabase } from '@/lib/supabaseClient';
import { usePathname, useRouter } from 'next/navigation';
import { X, AlertTriangle, CreditCard, Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type SubscriptionStatus = {
    status: string;
    is_active: boolean;
    trial_ends_at: string | null;
    current_period_end: string | null;
    grace_ends_at: string | null;
    days_left: number | null;
    grace_period_days: number;
    show_reminder: boolean;
    org_id: string;
    org_name: string;
    subscription_tier: string;
};

type BannerConfig = {
    type: 'info' | 'warning' | 'danger';
    icon: React.ElementType;
    message: string;
    cta: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    ctaBg: string;
};

function getBannerConfig(status: SubscriptionStatus): BannerConfig | null {
    const { status: s, days_left, grace_period_days } = status;

    if (s === 'active') {
        const daysLeftInt = Math.max(0, Math.ceil(days_left ?? 0));
        if (daysLeftInt <= 7) {
            return {
                type: 'warning',
                icon: AlertTriangle,
                message: daysLeftInt === 0 
                    ? '⚠️ Your subscription expires today! Renew now to avoid interruption.'
                    : `⚠️ Your subscription expires in ${daysLeftInt} day${daysLeftInt > 1 ? 's' : ''}. Renew early to ensure uninterrupted access.`,
                cta: 'Renew Now',
                bgClass: 'bg-amber-950/90',
                borderClass: 'border-amber-500/40',
                textClass: 'text-amber-200',
                ctaBg: 'bg-amber-500 hover:bg-amber-400 text-white',
            };
        }
        return null;
    }
    
    if (!status.is_active && !['trial', 'grace_period', 'suspended'].includes(s)) return null;

    if (s === 'suspended') {
        return {
            type: 'danger',
            icon: AlertTriangle,
            message: 'Your account has been suspended due to non-payment. Complete payment to restore access.',
            cta: 'Restore Now',
            bgClass: 'bg-red-950/90',
            borderClass: 'border-red-500/40',
            textClass: 'text-red-200',
            ctaBg: 'bg-red-500 hover:bg-red-400 text-white',
        };
    }

    if (s === 'grace_period') {
        const daysLeft = Math.max(0, Math.ceil(days_left ?? 0));
        return {
            type: 'danger',
            icon: AlertTriangle,
            message: daysLeft <= 1
                ? '⚠️ Final warning: Your subscription has expired. Upgrade now to avoid suspension!'
                : `Your subscription has expired. You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your grace period before suspension.`,
            cta: 'Upgrade Now',
            bgClass: 'bg-orange-950/90',
            borderClass: 'border-orange-500/40',
            textClass: 'text-orange-200',
            ctaBg: 'bg-orange-500 hover:bg-orange-400 text-white',
        };
    }

    return null;
}

export function PaymentReminderBanner() {
    const { user, profile, subscription: subStatus, loading } = useAuth();
    const [dismissed, setDismissed] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    // Fields to skip the banner on
    const exactSkipPaths = ['/'];
    const wildcardSkipPaths = ['/login', '/checkout', '/suspended', '/admin'];
    const shouldSkip = exactSkipPaths.includes(pathname || '') || wildcardSkipPaths.some(p => pathname === p || pathname?.startsWith(p));

    useEffect(() => {
        if (loading || !user || !profile || shouldSkip) return;

        // Check if dismissed this session
        const dismissKey = `mandi_banner_dismissed_${user.id}`;
        const dismissedAt = sessionStorage.getItem(dismissKey);
        if (dismissedAt && Date.now() - parseInt(dismissedAt) < 3_600_000) {
            setDismissed(true);
        }
    }, [user, profile, loading, shouldSkip]);

    const handleDismiss = () => {
        if (user) {
            sessionStorage.setItem(`mandi_banner_dismissed_${user.id}`, Date.now().toString());
        }
        setDismissed(true);
    };

    const handleCTA = () => {
        router.push('/settings/billing');
    };

    if (loading || !subStatus || dismissed || shouldSkip) return null;

    const config = getBannerConfig(subStatus);
    if (!config) return null;

    const Icon = config.icon;

    return (
        <div
            className={cn(
                'relative w-full border-b px-4 py-3 flex items-center gap-3 text-sm z-40',
                config.bgClass,
                config.borderClass,
                config.textClass,
                'animate-in slide-in-from-top-1 duration-300'
            )}
        >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <p className="flex-1 font-medium">{config.message}</p>
            <button
                onClick={handleCTA}
                className={cn(
                    'flex-shrink-0 text-xs font-bold px-4 py-1.5 rounded-full transition-all',
                    config.ctaBg
                )}
            >
                {config.cta}
            </button>
            <button
                onClick={handleDismiss}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
