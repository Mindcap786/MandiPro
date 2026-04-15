'use client';

import { useAuth } from '@/components/auth/auth-provider';
import Link from 'next/link';
import { X, Zap, Clock } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function TrialBanner() {
    const { profile } = useAuth();
    const [dismissed, setDismissed] = useState(false);

    const org = profile?.organization;
    if (!org || org.status !== 'trial' || dismissed) return null;

    const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
    const daysLeft = trialEnd
        ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
        : null;

    const isUrgent = daysLeft !== null && daysLeft <= 3;
    const isExpiring = daysLeft !== null && daysLeft <= 7;

    return (
        <div
            className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold print:hidden',
                isUrgent
                    ? 'bg-red-600 text-white'
                    : isExpiring
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-700 text-white'
            )}
        >
            {/* Left: icon + message */}
            <div className="flex items-center gap-2.5 min-w-0">
                {isUrgent ? (
                    <Clock className="w-4 h-4 flex-shrink-0 animate-pulse" />
                ) : (
                    <Zap className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="truncate">
                    {daysLeft === null ? (
                        <>You are on a free trial. Activate a plan to keep full access.</>
                    ) : daysLeft === 0 ? (
                        <>Your trial ends <strong>today</strong> — activate now to avoid losing access.</>
                    ) : (
                        <>
                            {isUrgent ? '⚠️ ' : ''}Free trial: <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</strong>
                            {isUrgent ? ' — activate now!' : ' — upgrade anytime, no card needed during trial.'}
                        </>
                    )}
                </span>
            </div>

            {/* Right: CTA + dismiss */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                    href="/settings/billing"
                    className={cn(
                        'px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                        isUrgent
                            ? 'bg-white text-red-600 hover:bg-red-50'
                            : isExpiring
                            ? 'bg-white text-amber-600 hover:bg-amber-50'
                            : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                    )}
                >
                    {isUrgent ? 'Activate Now' : 'View Plans'}
                </Link>
                {!isUrgent && (
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
