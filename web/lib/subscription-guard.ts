import { createClient } from '@supabase/supabase-js';
import { cached, TTL, invalidateCache } from './server-cache';

// Server-side subscription guard for API routes
// Validates that a tenant's subscription is active before allowing operations
// Use in tenant-facing API routes (not admin routes)

interface SubscriptionStatus {
    hasAccess: boolean;
    status: string;
    daysRemaining: number | null;
    isWarning: boolean;
    expiresAt: string | null;
    message: string;
}

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Call after renewal/activation to bust cache immediately
export function invalidateSubscriptionCache(orgId: string): void {
    invalidateCache(`sub_status:${orgId}`);
}

export async function checkSubscriptionStatus(orgId: string): Promise<SubscriptionStatus> {
    if (!orgId) {
        return {
            hasAccess: false,
            status: 'none',
            daysRemaining: null,
            isWarning: false,
            expiresAt: null,
            message: 'No organization ID provided'
        };
    }

    try {
        // Cached RPC call — same org checked many times per request cycle
        const { data, error } = await cached(
            `sub_status:${orgId}`,
            async () => supabaseAdmin.rpc('get_tenant_expiry_status', { p_org_id: orgId }),
            TTL.SHORT // 10s — subscription status can change on payment
        );

        if (error) {
            console.error('[SubscriptionGuard] RPC error:', error);
            // Fail open to not break existing functionality
            return {
                hasAccess: true,
                status: 'unknown',
                daysRemaining: null,
                isWarning: false,
                expiresAt: null,
                message: 'Subscription check temporarily unavailable'
            };
        }

        const status = data?.status || 'none';

        // Determine access based on status
        const activeStatuses = ['active', 'trial'];
        const hasAccess = activeStatuses.includes(status);

        return {
            hasAccess,
            status,
            daysRemaining: data?.days_remaining ?? null,
            isWarning: data?.is_warning ?? false,
            expiresAt: data?.expires_at ?? null,
            message: hasAccess
                ? (data?.is_warning
                    ? `Subscription expires in ${data.days_remaining} days`
                    : 'Subscription active')
                : status === 'expired'
                    ? 'Subscription expired. Please renew to continue.'
                    : status === 'suspended'
                        ? 'Account suspended due to non-payment.'
                        : 'No active subscription found.'
        };
    } catch (e: any) {
        console.error('[SubscriptionGuard] Error:', e);
        return {
            hasAccess: true,
            status: 'error',
            daysRemaining: null,
            isWarning: false,
            expiresAt: null,
            message: 'Subscription check failed'
        };
    }
}

// Quick check - returns boolean only (for use in middleware or guards)
export async function isSubscriptionActive(orgId: string): Promise<boolean> {
    const result = await checkSubscriptionStatus(orgId);
    return result.hasAccess;
}
