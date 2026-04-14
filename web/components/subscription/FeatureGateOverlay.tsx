'use client';

import { useSubscription } from '@/hooks/use-subscription';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Lock, ArrowRight, CheckCircle, Sparkles } from 'lucide-react';

interface FeatureGateOverlayProps {
    featureName: string;
    requiredPlan?: string;
    currentPlanName?: string;
    description?: string;
    children?: React.ReactNode;
    className?: string;
    compact?: boolean;
}

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
    standard: [
        'Advanced financial reports',
        'TDS management',
        'GST filing reports',
        'WhatsApp payment alerts',
        'Bulk import commodities',
        'Audit logs',
    ],
    enterprise: [
        'Everything in Standard',
        'Multi-location management',
        'API access for integrations',
        'Custom fields & workflows',
        'White-label branding',
        'Priority 24/7 support',
    ],
};

// FeatureGateOverlay — shown when a plan-locked feature is accessed
// Shows: lock icon, current plan, required plan, feature diff, upgrade CTA
// Rendered INSIDE the page (not a redirect) — industry standard UX

export function FeatureGateOverlay({
    featureName,
    requiredPlan = 'standard',
    currentPlanName,
    description,
    children,
    className,
    compact = false,
}: FeatureGateOverlayProps) {
    const sub = useSubscription();
    const planDisplayNames: Record<string, string> = {
        basic: 'Basic',
        standard: 'Standard',
        enterprise: 'Enterprise',
    };
    const requiredPlanDisplay = planDisplayNames[requiredPlan] || 'Standard';
    const highlights = PLAN_HIGHLIGHTS[requiredPlan] || PLAN_HIGHLIGHTS.standard;

    if (compact) {
        return (
            <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 cursor-pointer',
                'hover:border-violet-400 hover:bg-violet-50/50 transition-all group',
                className
            )}>
                <Lock className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-500 flex-shrink-0" />
                <span className="text-xs text-slate-500 group-hover:text-violet-700 font-medium">
                    {featureName} · Available in {requiredPlanDisplay}
                </span>
                <Link href="/settings/billing" className="ml-auto text-[10px] font-black uppercase tracking-wider text-violet-600 hover:text-violet-800">
                    Upgrade
                </Link>
            </div>
        );
    }

    return (
        <div className={cn(
            'relative flex flex-col items-center justify-center min-h-[320px] px-6 py-12 rounded-2xl',
            'bg-gradient-to-b from-slate-50 to-white border-2 border-dashed border-slate-200',
            className
        )}>
            {/* Lock Badge */}
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-lg border border-slate-100 mb-5">
                <Lock className="w-7 h-7 text-violet-500" />
            </div>

            {/* Feature Name */}
            <h3 className="text-xl font-black text-slate-800 text-center mb-1">{featureName}</h3>
            <p className="text-sm text-slate-500 text-center mb-1 max-w-sm">
                {description || `This feature is available on the ${requiredPlanDisplay} plan and above.`}
            </p>
            {currentPlanName && (
                <p className="text-xs text-slate-400 text-center mb-6">
                    Your plan: <span className="font-bold text-slate-600">{currentPlanName}</span>
                </p>
            )}

            {/* What You Get Card */}
            <div className="w-full max-w-sm bg-white rounded-2xl border border-violet-100 shadow-sm p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="text-xs font-black uppercase tracking-wider text-violet-700">
                        {requiredPlanDisplay} Plan Includes
                    </span>
                </div>
                <ul className="space-y-1.5">
                    {highlights.slice(0, 5).map((h, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            {h}
                        </li>
                    ))}
                </ul>
            </div>

            {/* CTA */}
            <Link
                href="/settings/billing"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm transition-all shadow-lg shadow-violet-200"
            >
                Upgrade to {requiredPlanDisplay}
                <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="mt-3 text-[10px] text-slate-400 text-center">
                Cancel anytime · All your data stays exactly as-is
            </p>
        </div>
    );
}
