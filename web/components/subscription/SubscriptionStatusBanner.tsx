'use client';

import { useAuth } from '@/components/auth/auth-provider';
import { useSubscription } from '@/hooks/use-subscription';
import Link from 'next/link';
import { useState } from 'react';
import { X, Zap, Clock, AlertTriangle, CreditCard, RefreshCw, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// SubscriptionStatusBanner — handles ALL subscription states
// Shows appropriate message and CTA for every lifecycle stage
// Replaces TrialBanner and extends it with full lifecycle coverage

export function SubscriptionStatusBanner() {
    const { profile } = useAuth();
    const sub = useSubscription();
    const [dismissed, setDismissed] = useState(false);

    // Super admin and no-profile: never show
    if (!profile || profile.role === 'super_admin') return null;

    // If no banner needed, hide
    if (!sub.shouldShowBanner) return null;

    // Non-urgent states can be dismissed
    if (dismissed && sub.bannerUrgency !== 'danger') return null;

    const periodEnd = sub.currentPeriodEnd
        ? format(new Date(sub.currentPeriodEnd), 'dd MMM yyyy')
        : null;
    const graceEnd = sub.gracePeriodEnd
        ? format(new Date(sub.gracePeriodEnd), 'dd MMM yyyy')
        : null;

    // Build content based on status
    const content = (() => {
        // TRIAL ACTIVE
        if (sub.isTrialing) {
            const days = sub.trialDaysRemaining;
            if (days === 0) {
                return {
                    icon: <Clock className="w-4 h-4 animate-pulse flex-shrink-0" />,
                    message: <><strong>Trial expires today!</strong> Activate a plan now to keep full access and your data.</>,
                    cta: { label: 'Activate Now', href: '/settings/billing' },
                    dismissible: false,
                };
            }
            if (days !== null && days <= 3) {
                return {
                    icon: <AlertTriangle className="w-4 h-4 animate-pulse flex-shrink-0" />,
                    message: <><strong>⚠️ {days} day{days !== 1 ? 's' : ''} left</strong> in your free trial — activate now to avoid data loss.</>,
                    cta: { label: 'Upgrade Now', href: '/settings/billing' },
                    dismissible: false,
                };
            }
            if (days !== null && days <= 7) {
                return {
                    icon: <Clock className="w-4 h-4 flex-shrink-0" />,
                    message: <><strong>{days} days</strong> left in your trial. Upgrade to keep your data and full access.</>,
                    cta: { label: 'View Plans', href: '/settings/billing' },
                    dismissible: true,
                };
            }
            return {
                icon: <Zap className="w-4 h-4 flex-shrink-0" />,
                message: <>🎉 <strong>Free trial active</strong> · {days !== null ? `${days} days remaining` : ''} · No credit card needed.</>,
                cta: { label: 'View Plans', href: '/settings/billing' },
                dismissible: true,
            };
        }

        // TRIAL EXPIRED
        if (sub.isExpired && sub.status === 'trial_expired') {
            return {
                icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
                message: <><strong>Trial expired.</strong> Your data is safe for 30 days. Upgrade to continue.</>,
                cta: { label: 'Choose a Plan', href: '/settings/billing' },
                dismissible: false,
            };
        }

        // PAST DUE (payment failed, retrying)
        if (sub.isPastDue) {
            return {
                icon: <CreditCard className="w-4 h-4 flex-shrink-0" />,
                message: <><strong>Payment failed.</strong> Update your payment method to avoid service interruption.</>,
                cta: { label: 'Fix Now', href: '/settings/billing' },
                dismissible: false,
            };
        }

        // GRACE PERIOD (payment still outstanding)
        if (sub.isGracePeriod) {
            return {
                icon: <AlertTriangle className="w-4 h-4 animate-pulse flex-shrink-0" />,
                message: <><strong>🔴 URGENT:</strong> Update payment{graceEnd ? ` before ${graceEnd}` : ''} to keep full access.</>,
                cta: { label: 'Update Payment', href: '/settings/billing' },
                dismissible: false,
            };
        }

        // SOFT LOCKED (grace expired, reads only)
        if (sub.isSoftLocked || (sub.isExpired && sub.status !== 'trial_expired')) {
            return {
                icon: <Ban className="w-4 h-4 flex-shrink-0" />,
                message: <><strong>Account locked.</strong> Your data is in read-only mode. Renew to restore full access.</>,
                cta: { label: 'Renew Now', href: '/settings/billing' },
                dismissible: false,
            };
        }

        // CANCELLED (access till period end)
        if (sub.isCancelled) {
            return {
                icon: <RefreshCw className="w-4 h-4 flex-shrink-0" />,
                message: <>Subscription cancelled. Full access continues{periodEnd ? ` until ${periodEnd}` : ''}.</>,
                cta: { label: 'Resubscribe', href: '/settings/billing' },
                dismissible: true,
            };
        }

        return null;
    })();

    if (!content) return null;

    const bgClass = cn(
        'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold print:hidden',
        sub.bannerUrgency === 'danger'
            ? 'bg-red-600 text-white'
            : sub.bannerUrgency === 'warning'
            ? 'bg-amber-500 text-white'
            : 'bg-emerald-700 text-white'
    );

    return (
        <div className={bgClass} role="alert">
            <div className="flex items-center gap-2.5 min-w-0">
                {content.icon}
                <span className="truncate">{content.message}</span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                    href={content.cta.href}
                    className={cn(
                        'px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                        sub.bannerUrgency === 'danger'
                            ? 'bg-white text-red-600 hover:bg-red-50'
                            : sub.bannerUrgency === 'warning'
                            ? 'bg-white text-amber-700 hover:bg-amber-50'
                            : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                    )}
                >
                    {content.cta.label}
                </Link>
                {content.dismissible && (
                    <button
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        className="p-1 rounded hover:bg-white/20 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
