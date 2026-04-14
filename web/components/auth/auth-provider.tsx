'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, usePathname } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Onboarding } from '@/components/auth/onboarding'
import { cacheClear, cacheClearForSession, cacheFlushExcept, setActiveCacheUser } from '@/lib/data-cache'
import { useIdleTimeout } from '@/lib/hooks/useIdleTimeout'
import { LogOut } from 'lucide-react'
import { useLanguage } from '@/components/i18n/language-provider'
import { cn } from '@/lib/utils'


interface Profile {
    id: string
    organization_id: string
    role: string
    full_name: string | null
    business_domain: 'mandi' | 'wholesaler'
    rbac_matrix?: any
    session_version?: number
    _fetchedAt?: number
    organization: {
        id: string
        name: string
        subscription_tier: string
        status: 'trial' | 'active' | 'grace_period' | 'suspended' | 'expired'
        trial_ends_at: string | null
        is_active?: boolean
        enabled_modules?: string[]
        brand_color?: string
        brand_color_secondary?: string
        logo_url?: string
        address?: string
        city?: string
        gstin?: string
        phone?: string
        settings?: any
    }
    subscription?: {
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
    }
    alerts?: any[]
}

interface AuthContextType {
    session: Session | null
    user: User | null
    profile: Profile | null
    subscription: any | null
    isComplianceVisible: boolean
    loading: boolean
    signOut: (options?: { confirm?: boolean }) => Promise<void>
    refreshOrg: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    profile: null,
    subscription: null,
    isComplianceVisible: false,
    loading: true,
    signOut: async () => { },
    refreshOrg: async () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    
    // INSTANT HYDRATION: Synchronously load profile from cache during first render
    const [profile, setProfile] = useState<Profile | null>(null);

    const [isComplianceVisible, setIsComplianceVisible] = useState(() => {
        if (typeof window === 'undefined') return false;
        return sessionStorage.getItem('mandi_compliance_visible') === 'true';
    })

    // ONLY show loading if we have no session AND no cached profile
    const [loading, setLoading] = useState(true);

    const [fetchingProf, setFetchingProf] = useState(false)
    const [profileNotFound, setProfileNotFound] = useState(false)

    // Track the previous user so we can flush their cache when a different user signs in
    // (shared device / multi-account scenario)
    const prevUserIdRef = { current: null as string | null };

    // Idle logout warning state — shown 1 minute before auto-logout fires
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [idleWarning, setIdleWarning] = useState<{ secondsLeft: number } | null>(null);

    const router = useRouter()
    const pathname = usePathname()
    const { toast } = useToast()

    // Language context is provided by parent, so this is safe to call directly
    const { t } = useLanguage()

    // Derived subscription for easy consumption
    const subscription = profile?.subscription ?? null;

    const fetchProfile = async (userId: string, isRetry = false): Promise<Profile | null> => {
        if (fetchingProf && !isRetry) return null;
        setFetchingProf(true);

        try {
            const { data: context, error } = await supabase.rpc('get_full_user_context', {
                p_user_id: userId
            });

            if (error) {
                console.warn("[Auth] Context bundle fetch failed:", error.message);
            }

            if (!context) {
                console.log("[Auth] No context via RPC. Falling back to direct Profile lookup...");

                // FALLBACK 1: Direct Table Query (Bypass RPC complexity, single query)
                const { data: directProfile, error: directError } = await supabase
                    .schema('core')
                    .from('profiles')
                    .select('*, organization:organization_id(*)')
                    .eq('id', userId)
                    .maybeSingle();

                if (directProfile && !directError) {
                    console.log("[Auth] Recovered profile via Direct Lookup.");
                    setProfileNotFound(false);
                    return directProfile as unknown as Profile;
                }

                // If direct lookup fails and this is first retry, try metadata healing ONCE
                if (!isRetry) {
                    const { data: { user } } = await supabase.auth.getUser();
                    const metadataOrg = user?.user_metadata?.organization_id;

                    if (metadataOrg) {
                        console.log("[Auth] Auto-healing link from Admin Metadata:", metadataOrg);
                        const { error: repairError } = await supabase.schema('core').from('profiles').insert({
                            id: userId,
                            organization_id: metadataOrg,
                            role: user?.user_metadata?.role || 'staff',
                            full_name: user?.email?.split('@')[0] || 'Member'
                        });

                        if (!repairError) return fetchProfile(userId, true);
                    }
                }

                // Give up on aggressive fallbacks after one retry - they're too expensive
                setProfileNotFound(true);
                return null;
            }

            // V3 Patch: The RPC may omit organization.rbac_matrix, so we explicitly fetch it to ensure the UI enforces Tenant Subscriptions
            if (context && context.organization) {
                if (context.organization.rbac_matrix === undefined) {
                    const { data: orgExtra } = await supabase.schema('core').from('organizations')
                        .select('rbac_matrix').eq('id', context.organization.id).maybeSingle();
                    if (orgExtra) {
                        context.organization.rbac_matrix = orgExtra.rbac_matrix || {};
                    }
                }
            }

            setProfileNotFound(false);
            return context as unknown as Profile;
        } catch (err: any) {
            console.error("[Auth] Profile fetch failed:", err);
            return null;
        } finally {
            setFetchingProf(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            // 1. Immediate cache hydration (Safe because it's in useEffect)
            const cached = localStorage.getItem('mandi_profile_cache');
            if (cached && isMounted) {
                try { 
                    const p = JSON.parse(cached);
                    setProfile(p);
                    setLoading(false);
                } catch (e) {}
            }

            // 2. Refresh session and profile
            const { data: { session: initialSession } } = await supabase.auth.getSession();
            if (!isMounted) return;

            // Validate the user object with getUser() instead of trusting getSession()
            // getUser() authenticates against the Supabase server for accuracy
            const { data: { user: authenticatedUser } } = await supabase.auth.getUser();

            setSession(initialSession);
            setUser(authenticatedUser);

            if (authenticatedUser) {
                // Bind the active user to the cache module so all reads/writes are user-scoped
                setActiveCacheUser(authenticatedUser.id);
                prevUserIdRef.current = authenticatedUser.id;

                const freshProfile = await fetchProfile(authenticatedUser.id);
                if (isMounted && freshProfile) {
                    const profileToCache = { ...freshProfile, _fetchedAt: Date.now() };
                    setProfile(profileToCache);
                    localStorage.setItem('mandi_profile_cache', JSON.stringify(profileToCache));
                    localStorage.setItem('mandi_profile_cache_org_id', freshProfile.organization_id);
                    if (freshProfile.session_version) {
                        localStorage.setItem('mandi_session_v', freshProfile.session_version.toString());
                    }
                }
            } else {
                if (isMounted) {
                    // No authenticated session — clear any leftover cache from a previous user
                    setActiveCacheUser(null);
                    cacheClearForSession();
                    setProfile(null);
                    localStorage.removeItem('mandi_profile_cache');
                }
            }

            if (isMounted) setLoading(false);

            // 3. Background branding fetch
            const { data } = await supabase.schema('core')
                .from('platform_branding_settings')
                .select('is_compliance_visible_to_tenants')
                .maybeSingle();
            
            if (isMounted) {
                setIsComplianceVisible(!!data?.is_compliance_visible_to_tenants);
            }
        };

        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!isMounted) return;
            setSession(newSession);
            setUser(newSession?.user ?? null);

            if (event === 'SIGNED_IN') {
                if (newSession?.user) {
                    const incomingUserId = newSession.user.id;

                    // ── Multi-device / shared-device safety ──────────────────
                    // If a DIFFERENT user just signed in on this tab/device,
                    // flush the previous user's cached data so they never
                    // see each other's records. No manual cache-clearing needed.
                    if (prevUserIdRef.current && prevUserIdRef.current !== incomingUserId) {
                        console.log('[Auth] User switch detected — flushing previous session cache.');
                        cacheFlushExcept(incomingUserId);
                        localStorage.removeItem('mandi_profile_cache');
                    }

                    // Bind the new user to the cache module
                    setActiveCacheUser(incomingUserId);
                    prevUserIdRef.current = incomingUserId;

                    const fresh = await fetchProfile(incomingUserId);
                    if (isMounted && fresh) {
                        const profileToCache = { ...fresh, _fetchedAt: Date.now() };
                        setProfile(profileToCache);
                        localStorage.setItem('mandi_profile_cache', JSON.stringify(profileToCache));
                        localStorage.setItem('mandi_profile_cache_org_id', fresh.organization_id);
                        if (fresh.session_version) {
                            localStorage.setItem('mandi_session_v', fresh.session_version.toString());
                        }
                    }
                }
            } else if (event === 'TOKEN_REFRESHED') {
                // TOKEN_REFRESHED = JWT was refreshed, NOT a new login
                // Profile hasn't changed, so skip expensive refetch unless user ID changed
                if (newSession?.user && prevUserIdRef.current !== newSession.user.id) {
                    // Different user (multi-device scenario) - need to refetch
                    const incomingUserId = newSession.user.id;
                    setActiveCacheUser(incomingUserId);
                    prevUserIdRef.current = incomingUserId;
                    const fresh = await fetchProfile(incomingUserId);
                    if (isMounted && fresh) {
                        const profileToCache = { ...fresh, _fetchedAt: Date.now() };
                        setProfile(profileToCache);
                        localStorage.setItem('mandi_profile_cache', JSON.stringify(profileToCache));
                        localStorage.setItem('mandi_profile_cache_org_id', fresh.organization_id);
                        if (fresh.session_version) {
                            localStorage.setItem('mandi_session_v', fresh.session_version.toString());
                        }
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                // ── Session terminated (this tab, another tab, or server-side) ──
                // Wipe ALL cached data and unbind the user. The user will see
                // a fresh state when they log in again — no cache clearing needed.
                console.log('[Auth] SIGNED_OUT detected — clearing entire session cache.');
                setActiveCacheUser(null);
                prevUserIdRef.current = null;
                cacheClearForSession();
                setProfile(null);
                localStorage.removeItem('mandi_profile_cache');
                localStorage.removeItem('mandi_profile_cache_org_id');
            }
            setLoading(false);
        });

        initAuth();

        // ── Single-Session Enforcement (MIGRATION-FREE) ────────────────────────
        // Uses Supabase Auth's built-in user_metadata — NO custom DB column needed.
        //
        // Mechanism A (JWT revocation): When a new login fires /api/auth/new-session,
        //   admin.signOut(userId, 'others') physically invalidates the old refresh
        //   tokens. The next time the old session calls getUser(), it gets an auth
        //   error → we sign it out immediately.
        //
        // Mechanism B (token comparison): /api/auth/new-session also writes a new UUID
        //   to user_metadata.active_session_token. The old session's polling check
        //   reads this and sees a mismatch → signs out with a clear message.
        //
        // Both mechanisms work together. Polling runs every 30 seconds.
        // ────────────────────────────────────────────────────────────────────────

        let pollIntervalId: ReturnType<typeof setInterval> | null = null;

        // Shared eviction handler — redirects to login with reason
        const handleSessionEviction = (reason: 'replaced' | 'revoked') => {
            if (!isMounted) return;
            const isReplaced = reason === 'replaced';
            console.warn(`[Auth] Session ${reason} — signing out.`);
            toast({
                title: 'Signed Out',
                description: isReplaced
                    ? 'Your account was signed in on another device. This session has ended.'
                    : 'Your session was ended remotely.',
                variant: 'destructive',
                duration: 6000,
            });
            // Small delay so toast is visible
            setTimeout(() => {
                if (!isMounted) return;
                setActiveCacheUser(null);
                prevUserIdRef.current = null;
                cacheClearForSession();
                localStorage.removeItem('mandi_active_token');
                localStorage.removeItem('mandi_profile_cache');
                supabase.auth.signOut().then(() => {
                    router.push('/login?reason=session_replaced');
                });
            }, 800);
        };

        // ── Polling Check (every 30 seconds) ─────────────────────────────────
        // Uses getUser() which hits the Supabase Auth server directly, making it
        // the most reliable check possible. No DB column required.
        // Reduced from 15s to 30s to balance eviction detection vs performance.
        const startPollingEvictionCheck = () => {
            if (pollIntervalId) clearInterval(pollIntervalId);

            pollIntervalId = setInterval(async () => {
                const localToken = localStorage.getItem('mandi_active_token');
                if (!localToken) return; // This session doesn't have enforcement active yet

                try {
                    // getUser() validates the access token against Supabase Auth server.
                    // If our refresh token was revoked by admin.signOut('others'), this
                    // call will return an error — we catch it and sign out.
                    const { data: { user: freshUser }, error: userError } = await supabase.auth.getUser();

                    if (userError || !freshUser) {
                        // JWT was revoked server-side by admin.signOut('others')
                        console.warn('[Auth] JWT revoked by server:', userError?.message);
                        clearInterval(pollIntervalId!);
                        pollIntervalId = null;
                        handleSessionEviction('revoked');
                        return;
                    }

                    // Check if another device has logged in (metadata token mismatch)
                    const serverToken = freshUser.user_metadata?.active_session_token;
                    if (serverToken && serverToken !== localToken) {
                        console.warn('[Auth] Session token mismatch:', { serverToken: serverToken.slice(0, 8), localToken: localToken.slice(0, 8) });
                        clearInterval(pollIntervalId!);
                        pollIntervalId = null;
                        handleSessionEviction('replaced');
                    }
                } catch {
                    // Network error — skip this tick, try again in 30s
                }
            }, 30_000); // Every 30 seconds
        };

        // ── Wire polling to auth state ────────────────────────────────────────
        const unsubAuthForRealtime = supabase.auth.onAuthStateChange((event, newSess) => {
            if (event === 'SIGNED_IN' && newSess?.user) {
                startPollingEvictionCheck();
            } else if (event === 'SIGNED_OUT') {
                if (pollIntervalId) { clearInterval(pollIntervalId); pollIntervalId = null; }
            }
        });
        // ── End Single-Session Enforcement ────────────────────────────────────

        return () => {
            isMounted = false;
            authSub.unsubscribe();
            unsubAuthForRealtime.data.subscription.unsubscribe();
            if (pollIntervalId) clearInterval(pollIntervalId);
        };
    }, []); // Run ONLY once on mount

    const signOut = async (options?: { confirm?: boolean }) => {
        if (options?.confirm) {
            setIsLogoutModalOpen(true);
            return;
        }

        if (isLoggingOut) return;
        setIsLoggingOut(true);

        try {
            console.log('[Auth] Initiating sign out...');
            // Unbind user from cache BEFORE signOut so no stale reads can occur
            // during the brief window that signOut() is in-flight.
            setActiveCacheUser(null);
            prevUserIdRef.current = null;
            cacheClearForSession(); // Wipes in-memory store + localStorage cache
            
            // Attempt server-side signOut (soft fail allowed)
            const { error } = await supabase.auth.signOut();
            if (error) console.warn('[Auth] Server signout error:', error.message);
        } catch (err) {
            console.error('[Auth] Forced logout safety caught error:', err);
        } finally {
            // ALWAYS cleanup local state and redirect, even if network fails
            setProfile(null);
            localStorage.removeItem('mandi_profile_cache');
            localStorage.removeItem('mandi_profile_cache_org_id');
            localStorage.removeItem('mandi_active_token');
            localStorage.removeItem('mandi_impersonation_mode');
            localStorage.removeItem('mandi_session_v');
            
            setIsLogoutModalOpen(false);
            setIsLoggingOut(false);
            
            // Force return to login
            window.location.href = '/login';
        }
    }

    const refreshProfile = async () => {
        if (user) {
            const fresh = await fetchProfile(user.id);
            if (fresh) setProfile({ ...fresh, _fetchedAt: Date.now() });
        }
    };

    const isPublicPath = pathname === '/login' ||
                         pathname === '/' ||
                         pathname === '/subscribe' ||
                         pathname === '/checkout' ||
                         pathname === '/join' ||
                         pathname === '/faq' ||
                         pathname === '/privacy' ||
                         pathname === '/terms' ||
                         pathname === '/contact' ||
                         pathname === '/mandi-billing' ||
                         pathname === '/commission-agent-software' ||
                         pathname === '/mandi-khata-software' ||
                         pathname === '/blog' ||
                         pathname?.startsWith('/blog/') ||
                         pathname?.startsWith('/public') ||
                         pathname?.startsWith('/auth/callback');

    // Routing and Security Enforcement
    useEffect(() => {
        if (loading) return;

        const isSuperAdmin = profile?.role === 'super_admin';
        const isLandingPath = pathname === '/login' || pathname === '/';

        if (session && profile && isLandingPath) {
            router.push(isSuperAdmin ? '/admin' : '/dashboard');
            return;
        }

        if (session && profile) {
            const isAdminPath = pathname?.startsWith('/admin');
            const isImpersonating = localStorage.getItem('mandi_impersonation_mode') === 'true';

            if (isSuperAdmin && !isAdminPath && !isImpersonating && !isLandingPath) {
                router.push('/admin');
                return;
            }

            if (!isSuperAdmin && isAdminPath && !isLandingPath) {
                router.push('/dashboard');
                return;
            }
        }

        if (!session && !profile && !isPublicPath) {
            router.push('/login');
            return;
        }

        // Subscription Enforcement — Handles Trial → Grace → Lockout flow
        if (profile && !isSuperAdmin && profile.organization?.name !== "Mandi HQ") {
            const org = profile.organization as any;
            const now = new Date();
            const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
            const gracePeriodEnd = org.grace_period_ends_at ? new Date(org.grace_period_ends_at) : null;
            
            const isPastMainExpiry = trialEnd && now > trialEnd;
            const isPastGracePeriod = !gracePeriodEnd || now > gracePeriodEnd;

            // Trial expired — but check if we're still in grace period
            const isTrialExpired = org.status === 'trial' && isPastMainExpiry && isPastGracePeriod;
            const isManuallyExpired = org.status === 'expired' && isPastGracePeriod;

            if ((isTrialExpired || isManuallyExpired || org.is_active === false) && !isPublicPath) {
                if (org.is_active === false && pathname !== '/suspended') {
                    router.push('/suspended');
                } else if ((isTrialExpired || isManuallyExpired) && pathname !== '/admin/billing/renewal') {
                    router.push('/admin/billing/renewal');
                }
            }
        }

        // Versioning check — Forces logout if a security bump was triggered on the backend
        if (profile?.session_version && !isPublicPath) {
             const v = localStorage.getItem('mandi_session_v');
             const currentV = v ? parseInt(v) : 0;
             if (currentV > 0 && currentV < profile.session_version) {
                 console.warn(`[Auth] Session version mismatch (local:${currentV} < remote:${profile.session_version}). Logging out.`);
                 signOut();
             } else if (!v && profile.session_version) {
                 // No local version found but remote has one - initialize it instead of logging out
                 localStorage.setItem('mandi_session_v', profile.session_version.toString());
             }
        }
    }, [loading, session, profile, pathname, router, isPublicPath]);

    const showOnboarding = !loading && !!user && !profile && profileNotFound && !isPublicPath;

    // ── Idle Auto-Logout (10 minutes of zero activity) ──────────────────────
    // Only active when the user is logged in and on a protected page.
    // Any mouse move, key press, scroll, or touch resets the timer.
    useIdleTimeout({
        idleMs: 10 * 60 * 1000,   // 10 minutes
        warningMs: 60 * 1000,      // show warning 1 minute before logout
        enabled: !!session && !loading && !isPublicPath,
        onWarning: (secondsLeft) => {
            setIdleWarning({ secondsLeft });
        },
        onReset: () => {
            setIdleWarning(null);
        },
        onTimeout: () => {
            setIdleWarning(null);
            toast({
                title: 'Session Expired',
                description: 'You were automatically signed out due to inactivity.',
                duration: 5000,
            });
            signOut();
        },
    });
    // ────────────────────────────────────────────────────────────────────────

    return (
        <AuthContext.Provider value={{ session, user, profile, subscription, isComplianceVisible, loading, signOut, refreshOrg: refreshProfile }}>
            {showOnboarding ? <Onboarding onComplete={refreshProfile} /> : children}

            {/* ── Logout Confirmation Modal ────────────────────────────────── */}
            {isLogoutModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                >
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="h-1.5 bg-red-500 w-full" />
                        <div className="p-8">
                            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                <LogOut className={cn("w-8 h-8 text-red-500", isLoggingOut && "animate-pulse")} />
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 text-center mb-2">
                                {isLoggingOut ? t('common.signing_out') : t('common.logout') + '?'}
                            </h3>
                            <p className="text-gray-500 text-center text-sm leading-relaxed mb-8">
                                {isLoggingOut 
                                    ? t('common.please_wait_signing_out') 
                                    : "Are you sure you want to end your current session? You will need to sign in again to access your dashboard."
                                }
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={() => signOut()}
                                    disabled={isLoggingOut}
                                    className="w-full h-14 bg-red-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-200 disabled:opacity-50"
                                >
                                    {isLoggingOut ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>{t('common.processing')}...</span>
                                        </>
                                    ) : (
                                        "Yes, Log Me Out"
                                    )}
                                </button>
                                
                                <button
                                    onClick={() => setIsLogoutModalOpen(false)}
                                    disabled={isLoggingOut}
                                    className="w-full h-14 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─────────────────────────────────────────────────────────────── */}

            {/* ── Idle Timeout Warning Modal ───────────────────────────────── */}
            {/* Shown 1 minute before auto-logout. User can dismiss by clicking  */}
            {/* 'Stay Logged In' which resets the idle timer via activity event. */}
            {idleWarning && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Session expiry warning"
                    className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                >
                    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                        {/* Countdown bar */}
                        <div
                            className="h-1.5 bg-amber-400 transition-all duration-1000"
                            style={{ width: `${(idleWarning.secondsLeft / 60) * 100}%` }}
                        />
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-5">
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-black text-gray-900 text-base">Are you still there?</p>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        You'll be signed out in{' '}
                                        <span className="font-bold text-amber-600 tabular-nums">
                                            {idleWarning.secondsLeft}s
                                        </span>
                                        {' '}due to inactivity.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    id="idle-stay-logged-in"
                                    onClick={() => setIdleWarning(null)}
                                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 transition-colors active:scale-95"
                                >
                                    Stay Logged In
                                </button>
                                <button
                                    id="idle-sign-out-now"
                                    onClick={() => { setIdleWarning(null); signOut(); }}
                                    className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors active:scale-95"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ─────────────────────────────────────────────────────────────── */}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
