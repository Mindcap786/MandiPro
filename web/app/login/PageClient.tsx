'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase, getAuthRedirectUrl, isNative } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowRight, ShieldCheck, AlertTriangle, Mail, Lock, Key, User, Building2, CheckCircle2, XCircle, Eye, EyeOff, ShieldAlert, LogOut } from 'lucide-react'
import { useLanguage } from '@/components/i18n/language-provider'
import { LanguageSwitcher } from '@/components/i18n/language-switcher'
import { cn } from '@/lib/utils'
import { HeroTitle } from '@/components/i18n/hero-title'
import { OTPInput } from '@/components/auth/otp-input'


type AuthStep = 'info' | 'otp' | 'locked' | 'reset';

export default function LoginClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { t, dir } = useLanguage()

    // Platform detection (WebView/Capacitor)
    const [isNativePlatform, setIsNativePlatform] = useState(false)
    useEffect(() => {
        setIsNativePlatform(isNative())
    }, [])

    // Form States
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [orgName, setOrgName] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [phone, setPhone] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [otpValue, setOtpValue] = useState('')

    // Uniqueness States
    const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

    // UI States
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mode, setMode] = useState<'login' | 'signup' | 'unlock' | 'forgot_password'>('login')
    const [authStep, setAuthStep] = useState<AuthStep>('info')
    const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
    const [actualEmail, setActualEmail] = useState('')
    const [tapCount, setTapCount] = useState(0)
    const [showDebug, setShowDebug] = useState(false)
    const [debugLog, setDebugLog] = useState<string[]>([])
    const [trialDays, setTrialDays] = useState<number>(14)

    // Single Session Conflict State
    const [conflictAuthData, setConflictAuthData] = useState<any>(null)
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)

    const consentReady = true   // implied — notice shown below submit button

    const logDebug = (msg: string) => {
        setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20))
    }

    useEffect(() => {
        // We've removed the blocking checkConnection to prevent UI hangs.
        // The app will now attempt to connect directly upon login.
        fetchPlans()
    }, [])

    // Show a friendly message when this session was replaced by a new login elsewhere
    useEffect(() => {
        const reason = searchParams.get('reason')
        if (reason === 'session_replaced') {
            setError('You were signed in on another device. This session has ended. Please log in again.')
        }
    }, [searchParams])

    const fetchPlans = async () => {
        const { data: settingsRes } = await supabase
            .schema('core').from('app_settings').select('value').eq('key', 'global_trial_days').maybeSingle();
        
        const rawValue: any = settingsRes?.value;
        if (rawValue) {
            // Robustly extract numeric value from potential { value: N } object structure
            let finalVal: number | NaN = NaN;
            if (typeof rawValue === 'object' && rawValue.value !== undefined) {
                finalVal = Number(rawValue.value);
            } else {
                finalVal = Number(rawValue);
            }
            
            if (!isNaN(finalVal)) setTrialDays(finalVal);
        }
    }

    // Debounced uniqueness check for email
    useEffect(() => {
        if (isNative() || mode !== 'signup' || !identifier || !identifier.includes('@')) {
            setEmailStatus('idle')
            return
        }
        const timer = setTimeout(async () => {
            setEmailStatus('checking')
            try {
                const res = await fetch('/api/auth/check-unique', { // Standard lookup for uniqueness
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: identifier.trim() })
                })
                const data = await res.json()
                setEmailStatus(data.emailTaken ? 'taken' : 'available')
            } catch {
                setEmailStatus('idle')
            }
        }, 600)
        return () => clearTimeout(timer)
    }, [identifier, mode])

    // Debounced uniqueness check for username
    useEffect(() => {
        if (isNative() || mode !== 'signup' || !username || username.trim().length < 3) {
            setUsernameStatus('idle')
            return
        }
        const timer = setTimeout(async () => {
            setUsernameStatus('checking')
            try {
                const res = await fetch('/api/auth/check-unique', { // Reuse lookup for username
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.trim() })
                })
                const data = await res.json()
                setUsernameStatus(data.usernameTaken ? 'taken' : 'available')
            } catch {
                setUsernameStatus('idle')
            }
        }, 600)
        return () => clearTimeout(timer)
    }, [username, mode])



    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            if (mode === 'login') {
                await handleLogin();
            } else if (mode === 'signup') {
                if (authStep === 'info') {
                    await handleSignupStep1();
                } else {
                    await handleVerifyOtp();
                }
            } else if (mode === 'forgot_password') {
                if (authStep === 'info') {
                    await handleRequestPasswordReset();
                } else if (authStep === 'otp') {
                    await handleVerifyOtp();
                } else if (authStep === 'reset') {
                    await handleUpdatePassword();
                }
            } else if (mode === 'unlock') {
                if (authStep === 'info') {
                    await handleRequestUnlock();
                } else {
                    await handleVerifyOtp();
                }
            }
        } catch (err: any) {
            console.error('Auth error:', err)
            setError(err?.message || (typeof err === 'string' ? err : null) || t('auth.errors.generic'))
        } finally {
            setLoading(false)
        }
    }

    const handleLogin = async () => {
        let loginEmail = identifier;
        logDebug(`Starting login for: ${identifier}`)

        if (!identifier.includes('@')) {
            logDebug('Performing username lookup...')
            const res = await fetch('/api/auth/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: identifier })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'User not found.');
            loginEmail = json.email;
        }
        setActualEmail(loginEmail);

        // NATIVE FAST PATH: Skip pre-checks and tracking on native to prevent hangs
        if (!isNative()) {
            logDebug('Checking for account lock status...')
            try {
                const lockCheckTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
                const lockCheckResult: any = await Promise.race([
                    supabase.schema('core').from('profiles')
                        .select('locked_until').eq('email', loginEmail).maybeSingle(),
                    lockCheckTimeout
                ]);
                const profileCheck = lockCheckResult?.data;
                if (profileCheck?.locked_until && new Date(profileCheck.locked_until) > new Date()) {
                    setMode('unlock');
                    setAuthStep('info');
                    throw new Error(t('auth.errors.account_locked'));
                }
            } catch (lockErr: any) {
                if (lockErr?.message?.includes('account_locked')) throw lockErr;
                logDebug('Lock check timed out, continuing...');
            }
        }

        logDebug('Attempting sign in with password...')
        
        // 15-second hard timeout for native devices that silently drop blocked requests
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Network Timeout: Could not reach Supabase. Check internet or CORS.")), 15000)
        );

        let authData: any = null;
        let loginErr: any = null;

        try {
            const result: any = await Promise.race([
                supabase.auth.signInWithPassword({ email: loginEmail, password }),
                timeoutPromise
            ]);
            authData = result.data;
            loginErr = result.error;
        } catch (e: any) {
            loginErr = e;
        }

        if (loginErr) {
            logDebug(`Login Failed: ${loginErr?.message || String(loginErr)}`)
            if (!isNative()) {
                await supabase.rpc('record_login_failure', { p_email: loginEmail });
            }
            throw loginErr;
        }

        logDebug('Login successful! Checking for session conflicts...')
        
        // ── Proactive Session Conflict Detection (Migration-Free) ───────────
        // Reads active_session_token from user_metadata via getUser().
        // This is stored by /api/auth/new-session on every login — no DB column needed.
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            const existingToken = currentUser?.user_metadata?.active_session_token;

            if (existingToken) {
                logDebug('Active session token found in metadata — pausing for user confirmation.');
                setConflictAuthData(authData);
                setIsConflictModalOpen(true);
                setLoading(false);
                return;
            }
            logDebug('No active session token found — proceeding directly.');
        } catch (conflictErr) {
            logDebug(`Conflict check failed: ${conflictErr}. Proceeding with default logic.`);
        }
        
        // No conflict or check failed? Proceed to finish
        await finalizeLogin(authData);
    }

    const finalizeLogin = async (authData: any) => {
        setLoading(true);
        setIsConflictModalOpen(false);
        logDebug('Finalizing session consolidation...');

        let profile: any = null;
        
        try {
            // High-Performance Atomic Handshake
            const { data: bundle, error: bundleErr } = await supabase.rpc('finalize_login_bundle', { 
                p_user_id: authData.user?.id 
            });

            if (bundleErr) throw bundleErr;

            profile = bundle.profile;
            const organization = bundle.organization;

            // Update local cache immediately to prevent hydration flickering
            if (profile) {
                if (profile.session_version) {
                    localStorage.setItem('mandi_session_v', profile.session_version.toString());
                }
                const profileCache = { ...profile, organization, _fetchedAt: Date.now() };
                localStorage.setItem('mandi_profile_cache', JSON.stringify(profileCache));
            }
        } catch (bundleErr: any) {
            logDebug(`Session consolidation failed: ${bundleErr.message}`);
            // Fallback for safety
            logDebug('Attempting fallback profile fetch...');
            try {
                const { data: directProfile } = await supabase.schema('core').from('profiles').select('*, organization:organization_id(*)').eq('id', authData?.user?.id).maybeSingle();
                if (directProfile) {
                    profile = directProfile;
                    const organization = directProfile.organization;
                    if (profile.session_version) {
                        localStorage.setItem('mandi_session_v', profile.session_version.toString());
                    }
                    const profileCache = { ...profile, organization, _fetchedAt: Date.now() };
                    localStorage.setItem('mandi_profile_cache', JSON.stringify(profileCache));
                }
            } catch (fallbackErr: any) {
                logDebug(`Fallback also failed: ${fallbackErr.message}`);
            }
        }

        // ── Single-Session Enforcement (Rotate Token & Revoke Others) ─────────
        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.access_token) {
                const sessionRes = await fetch('/api/auth/new-session', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${currentSession.access_token}` },
                });
                if (sessionRes.ok) {
                    const { session_token } = await sessionRes.json();
                    if (session_token) {
                        localStorage.setItem('mandi_active_token', session_token);
                        logDebug('Single-session enforced. Other sessions revoked.');
                    }
                } else {
                    logDebug('Single-session API returned non-ok — continuing safely.');
                }
            }
        } catch (sessionErr: any) {
            logDebug(`Session enforcement skipped: ${sessionErr.message}`);
        }

        if (profile && profile.role !== 'super_admin' && profile.business_domain && profile.business_domain !== 'mandi') {
            await supabase.auth.signOut();
            throw new Error(t('auth.errors.decommissioned'));
        }

        const redirectTo = searchParams.get('redirectedFrom') || (profile?.role === 'super_admin' ? '/admin' : '/dashboard');
        logDebug(`Redirecting to: ${redirectTo}`);
        
        if (isNative()) {
            router.replace(redirectTo);
        } else {
            window.location.href = redirectTo;
        }
    }

    const handleCancelTakeover = async () => {
        setIsConflictModalOpen(false);
        setConflictAuthData(null);
        setLoading(false);
        await supabase.auth.signOut();
    }

    // ── Password Strength Checker ────────────────────────────────────────────
    const getPasswordStrength = (pw: string): { score: number; label: string; color: string } => {
        if (!pw) return { score: 0, label: '', color: '' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score++;
        if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
        if (score <= 2) return { score, label: 'Fair', color: 'bg-orange-400' };
        if (score <= 3) return { score, label: 'Good', color: 'bg-yellow-400' };
        return { score, label: 'Strong', color: 'bg-emerald-500' };
    };
    const passwordStrength = getPasswordStrength(password);

    const handleSignupStep1 = async () => {
        // ── Validation ──────────────────────────────────────────────────────────
        if (!fullName.trim()) throw new Error('Full name is required.');
        if (!username.trim()) throw new Error('Username is required.');
        if (username.trim().length < 6) throw new Error('Username must be at least 6 characters.');
        if (username.trim().length > 30) throw new Error('Username must be 30 characters or less.');
        if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) throw new Error('Username can only contain letters, numbers, and underscores.');
        if (!identifier.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new Error('Please enter a valid email address.');
        if (!orgName.trim()) throw new Error('Business name is required.');
        if (!phone.trim()) throw new Error('Mobile number is required.');
        if (!/^[6-9]\d{9}$/.test(phone.replace(/\s|-/g, ''))) throw new Error('Please enter a valid 10-digit Indian mobile number.');
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');

        // ── Pre-flight Uniqueness Check ─────────────────────────────────────────
        if (!isNativePlatform) {
            // Inline status already checked via debounced API, but do a hard server-side check too
            const checkRes = await fetch('/api/auth/check-unique', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: identifier.trim(), username: username.trim() })
            });
            const checkData = await checkRes.json();
            if (checkData.emailTaken) {
                throw new Error('This email is already registered. Please sign in instead.');
            }
            if (checkData.usernameTaken) {
                throw new Error('This username is already taken. Please choose another.');
            }
        }

        // ── Guard: consent must be given ──────────────────────────────────────
        if (!consentReady) throw new Error('Please accept the Terms of Service and Privacy Policy to continue.');

        // ── Supabase SignUp ────────────────────────────────────────────────────
        const { data, error } = await supabase.auth.signUp({
            email: identifier.trim(),
            password,
            options: {
                emailRedirectTo: getAuthRedirectUrl(),
                data: {
                    full_name: fullName.trim(),
                    username: username.trim().toLowerCase(),
                    org_name: orgName.trim(),
                    phone: phone.replace(/\s|-/g, ''),
                    consent_version: 'v1.0',
                    consented_at: new Date().toISOString(),
                }
            }
        });

        if (error) {
            if (error.message.toLowerCase().includes('already registered')) {
                const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: identifier });
                if (resendError) throw resendError;
            } else if (error.message.toLowerCase().includes('error sending confirmation email')) {
                throw new Error('Failed to send verification email. Please try again or contact support.');
            } else {
                throw error;
            }
        }

        // ── Record consent in audit log (fire-and-forget, never block signup) ─
        const consentedTo = ['terms', 'privacy', 'data_processing'];
        fetch('/api/auth/record-consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: data?.user?.id || null,
                email: identifier.trim(),
                consented_to: consentedTo,
            }),
        }).catch(() => {}); // silent — consent stored in user_metadata as fallback

        if (data?.session) {
            // Email confirmation is OFF — take user straight to dashboard in trial
            router.push('/dashboard');
            return;
        }

        setActualEmail(identifier);
        setAuthStep('otp');
    }

    const handleRequestUnlock = async () => {
        if (!identifier.includes('@')) throw new Error('Please enter your email address to unlock.');

        const { error } = await supabase.auth.signInWithOtp({
            email: identifier,
            options: { 
                shouldCreateUser: false,
                emailRedirectTo: getAuthRedirectUrl()
            }
        })
        if (error) throw error;

        setActualEmail(identifier);
        setAuthStep('otp');
    }

    const handleRequestPasswordReset = async () => {
        let loginEmail = identifier;
        
        // Ensure email/username is registered before doing anything.
        if (isNativePlatform && !identifier.includes('@')) {
            throw new Error("Unable to perform username lookup on mobile. Please use your email address.");
        }

        const res = await fetch('/api/auth/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });
        
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'No account found with this email/username.');
        
        loginEmail = json.email;
        setActualEmail(loginEmail);

        const { error } = await supabase.auth.resetPasswordForEmail(loginEmail);
        if (error) {
            throw error;
        }
        setAuthStep('otp');
    }

    const handleUpdatePassword = async () => {
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        // Password updated and user logged in
        router.push('/dashboard');
    }

    const handleVerifyOtp = async () => {
        if (otpValue.length < 6) throw new Error('Please enter the 6-digit code.');

        const typeMap: Record<string, 'signup' | 'magiclink' | 'recovery'> = {
            'signup': 'signup',
            'unlock': 'magiclink',
            'forgot_password': 'recovery'
        };

        const { error } = await supabase.auth.verifyOtp({
            email: actualEmail,
            token: otpValue,
            type: typeMap[mode] || 'magiclink'
        })

        if (error) throw new Error(t('auth.errors.invalid_otp') || 'Invalid OTP');

        if (mode === 'unlock') {
            await supabase.rpc('unlock_account', { p_email: actualEmail });
            setError(null);
            setMode('login');
            setAuthStep('info');
            router.push('/dashboard');
        } else if (mode === 'forgot_password') {
            setAuthStep('reset');
            setPassword('');
            setConfirmPassword('');
        } else {
            router.push('/dashboard');
        }
    }

    const StatusIcon = ({ status }: { status: 'idle' | 'checking' | 'available' | 'taken' }) => {
        if (status === 'idle') return null;
        if (status === 'checking') return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
        if (status === 'available') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        return <XCircle className="w-4 h-4 text-red-500" />;
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[#dce7c8] font-sans selection:bg-emerald-600 selection:text-white" dir={dir}>
            {/* Left Side: Branding / Hero */}
            <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-emerald-900 text-white">
                <div className="absolute inset-0 bg-emerald-950 opacity-20"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-900/80 to-transparent"></div>

                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-3 mb-12 hover:opacity-80 transition-opacity w-fit">
                        <div className="w-10 h-10 rounded-xl bg-white text-emerald-900 flex items-center justify-center font-black text-2xl shadow-lg">M</div>
                        <span className="text-2xl font-black tracking-tight text-white italic">Mandi<span className="text-emerald-400 not-italic">Grow</span></span>
                    </Link>

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/50 bg-emerald-900/50 text-xs font-bold text-emerald-300 mb-6 backdrop-blur-sm self-start">
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        {t('auth.enterprise_live')}
                    </div>

                    <HeroTitle text={t('auth.hero_title')} className="mb-6" />
                    <p className="text-emerald-100/80 text-lg max-w-md font-medium leading-relaxed">
                        {t('auth.hero_description')}
                    </p>
                </div>

                <div className="relative z-10 flex items-center gap-4 text-emerald-200/60 text-sm font-medium">
                    <ShieldCheck className="w-5 h-5" />
                    <span>{t('auth.security_certified')}</span>
                </div>
            </div>

            {/* Right Side: Auth Form */}
            <div className="relative flex flex-col items-center p-8 sm:p-12 bg-[#dce7c8] overflow-y-auto min-h-screen">
                <div className="absolute top-6 right-6 sm:top-8 sm:right-8 z-20">
                    <LanguageSwitcher />
                </div>

                <div className="w-full max-w-[480px] my-auto py-12">
                    <div className="text-center mb-8">
                        <Link href="/" className="inline-flex lg:hidden items-center gap-3 mb-8 text-emerald-900" onClick={(e) => {
                            if (isNativePlatform) {
                                e.preventDefault();
                                const newCount = tapCount + 1;
                                setTapCount(newCount);
                                if (newCount >= 5) {
                                    setShowDebug(true);
                                    setTapCount(0);
                                }
                            }
                        }}>
                            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-black text-2xl shadow-lg">M</div>
                            <span className="text-2xl font-black tracking-tight">Mandi<span className="text-emerald-600">Grow</span></span>
                        </Link>

                        <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                            {mode === 'forgot_password' ? 'Reset Password' : mode === 'unlock' ? t('auth.unlock_title') : authStep === 'otp' ? t('auth.verify_otp_title') : authStep === 'reset' ? 'Set New Password' : (mode === 'login' ? t('auth.login_welcome') : 'Create Your Account')}
                        </h2>
                        <p className="text-gray-500 font-medium px-4 text-center">
                            {authStep === 'otp' ? `${t('auth.verify_otp_subtitle')} ${actualEmail}` : authStep === 'reset' ? 'Choose a strong new password.' : mode === 'forgot_password' ? 'Enter your email or username to get a reset OTP.' : (mode === 'login' ? t('auth.login_subtitle') : 'Register with your email and pick a plan')}
                        </p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(4,120,87,0.15)] border border-[#c8d6b0]">
                        {authStep === 'info' && mode !== 'unlock' && mode !== 'forgot_password' && (
                            <div className="flex mb-8 bg-[#f4f7ee] rounded-2xl p-1.5 border border-[#c8d6b0]">
                                <button type="button" onClick={() => { setMode('login'); setError(null); }} className={cn("flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all", mode === 'login' ? "bg-emerald-700 text-white shadow-md" : "text-gray-500 hover:text-emerald-700")}>
                                    {t('auth.sign_in_btn')}
                                </button>
                                <button type="button" onClick={() => { setMode('signup'); setError(null); }} className={cn("flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all", mode === 'signup' ? "bg-emerald-700 text-white shadow-md" : "text-gray-500 hover:text-emerald-700")}>
                                    {t('auth.sign_up_btn')}
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleAuth} className="space-y-5">
                            {authStep === 'info' ? (
                                <>
                                    {mode === 'signup' && (
                                        <div className="space-y-4 mb-2">
                                            {/* Full Name */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                                    <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rajesh Kumar" className="auth-input pl-12" />
                                                </div>
                                            </div>

                                            {/* Username */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                    Username
                                                    <StatusIcon status={usernameStatus} />
                                                    {usernameStatus === 'available' && <span className="text-emerald-500 normal-case font-bold">Available</span>}
                                                    {usernameStatus === 'taken' && <span className="text-red-500 normal-case font-bold">Already taken</span>}
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400/80 text-sm font-bold">@</span>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={username}
                                                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                                                        placeholder="rajesh_kumar"
                                                        className={cn("auth-input pl-12", usernameStatus === 'taken' && "border-red-300 bg-red-50", usernameStatus === 'available' && "border-emerald-300 bg-emerald-50/30")}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-400 ml-1">Letters, numbers, underscores only. Min 6 characters.</p>
                                            </div>

                                            {/* Business Name */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Business Name</label>
                                                <div className="relative">
                                                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                                    <input type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Sharma Mandi" className="auth-input pl-12" />
                                                </div>
                                            </div>

                                            {/* Mobile Number — mandatory */}
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1">
                                                    Mobile Number <span className="text-red-500">*</span>
                                                </label>
                                                <div className="relative flex items-stretch">
                                                    <span className="flex items-center justify-center bg-[#f4f7ee] border border-r-0 border-[#c8d6b0] rounded-l-xl px-3 text-sm font-bold text-gray-500 select-none whitespace-nowrap">+91</span>
                                                    <input
                                                        type="tel"
                                                        required
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                                                        placeholder="9876543210"
                                                        className="auth-input rounded-l-none border-l-0 pl-4 flex-1"
                                                        maxLength={10}
                                                        inputMode="numeric"
                                                    />
                                                    {phone.length === 10 && /^[6-9]\d{9}$/.test(phone) && (
                                                        <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-400 ml-1">10-digit Indian mobile number (starts with 6–9)</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Email */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            {mode === 'unlock' ? 'Email Address' : (mode === 'login' || mode === 'forgot_password' ? 'Email / Username' : 'Email Address')}
                                            {mode === 'signup' && <StatusIcon status={emailStatus} />}
                                            {mode === 'signup' && emailStatus === 'available' && <span className="text-emerald-500 normal-case font-bold">Available</span>}
                                            {mode === 'signup' && emailStatus === 'taken' && (
                                                <span className="text-red-500 normal-case font-bold">
                                                    Registered — <button type="button" onClick={() => { setMode('login'); setError(null); }} className="underline hover:text-red-700">Sign in instead?</button>
                                                </span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                            <input
                                                type={mode === 'signup' ? 'email' : 'text'}
                                                required
                                                value={identifier}
                                                onChange={(e) => setIdentifier(e.target.value)}
                                                className={cn("auth-input pl-12", mode === 'signup' && emailStatus === 'taken' && "border-red-300 bg-red-50", mode === 'signup' && emailStatus === 'available' && "border-emerald-300 bg-emerald-50/30")}
                                                placeholder="name@company.com"
                                            />
                                        </div>
                                    </div>

                                    {/* Password */}
                                    {mode !== 'unlock' && mode !== 'forgot_password' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                                <span>{t('auth.password_label')}</span>
                                                {mode === 'login' && (
                                                    <button type="button" tabIndex={-1} onClick={() => { setMode('forgot_password'); setError(null); }} className="text-emerald-600 hover:text-emerald-700 normal-case hover:underline">Forgot password?</button>
                                                )}
                                                {mode === 'signup' && password && (
                                                    <span className={cn('text-[10px] font-bold normal-case', passwordStrength.score >= 4 ? 'text-emerald-600' : passwordStrength.score >= 3 ? 'text-yellow-600' : 'text-red-500')}>
                                                        {passwordStrength.label}
                                                    </span>
                                                )}
                                            </label>
                                            <div className="relative">
                                                <Key className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="auth-input pl-12 pr-12"
                                                    placeholder={mode === 'signup' ? 'Min 6 characters' : 'Your password'}
                                                />
                                                <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {mode === 'signup' && password && (
                                                <div className="flex gap-1 mt-1">
                                                    {[1,2,3,4,5].map(i => (
                                                        <div key={i} className={cn('h-1 flex-1 rounded-full transition-all duration-300', i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200')} />
                                                    ))}
                                                </div>
                                            )}
                                            {mode === 'signup' && <p className="text-[10px] text-gray-400 ml-1">Min 6 characters</p>}
                                        </div>
                                    )}

                                    {/* Confirm Password */}
                                    {mode === 'signup' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                Confirm Password
                                                {confirmPassword && (
                                                    password === confirmPassword
                                                        ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500 normal-case font-bold">Match</span></>
                                                        : <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500 normal-case font-bold">Mismatch</span></>
                                                )}
                                            </label>
                                            <div className="relative">
                                                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                                <input
                                                    type={showConfirmPassword ? 'text' : 'password'}
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    className={cn("auth-input pl-12 pr-12", confirmPassword && (password === confirmPassword ? "border-emerald-300 bg-emerald-50/30" : "border-red-300 bg-red-50"))}
                                                    placeholder="Re-enter password"
                                                />
                                                <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Free Trial Badge — replaces plan selection */}
                                    {mode === 'signup' && (
                                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
                                                <span className="text-white text-lg">🎁</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-emerald-800">{trialDays}-Day Free Trial — All Features Included</p>
                                                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">No credit card required. Upgrade anytime from inside the app.</p>
                                            </div>
                                        </div>
                                    )}

                                </>
                            ) : authStep === 'otp' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <OTPInput value={otpValue} onChange={setOtpValue} error={!!error} disabled={loading} />
                                    <div className="text-center">
                                        <button type="button" onClick={mode === 'forgot_password' ? handleRequestPasswordReset : undefined} disabled={loading} className="text-xs font-black text-emerald-700 uppercase tracking-widest hover:text-emerald-800 disabled:opacity-50">
                                            {t('auth.resend_code')}
                                        </button>
                                    </div>
                                </div>
                            ) : authStep === 'reset' ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                            <span>New Password</span>
                                            {password && (
                                                <span className={cn('text-[10px] font-bold normal-case', passwordStrength.score >= 4 ? 'text-emerald-600' : passwordStrength.score >= 3 ? 'text-yellow-600' : 'text-red-500')}>
                                                    {passwordStrength.label}
                                                </span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="auth-input pl-12 pr-12"
                                                placeholder="Min 6 characters"
                                            />
                                            <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-400 ml-1">Must be at least 6 characters long.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            Confirm New Password
                                            {confirmPassword && (
                                                password === confirmPassword
                                                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500 normal-case font-bold">Match</span></>
                                                    : <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500 normal-case font-bold">Mismatch</span></>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400/80" />
                                            <input
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                required
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className={cn("auth-input pl-12 pr-12", confirmPassword && (password === confirmPassword ? "border-emerald-300 bg-emerald-50/30" : "border-red-300 bg-red-50"))}
                                                placeholder="Re-enter new password"
                                            />
                                            <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {error && (
                                <div className={cn("p-4 rounded-2xl text-sm font-bold flex gap-3 animate-in shake-in duration-300",
                                    mode === 'unlock' ? "bg-amber-50 border border-amber-100 text-amber-700" : "bg-red-50 border border-red-100 text-red-600"
                                )}>
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <span className="flex-1">{error}</span>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    type="submit"
                                    disabled={loading || (mode === 'signup' && authStep === 'info' && (emailStatus === 'taken' || usernameStatus === 'taken' || (confirmPassword !== '' && password !== confirmPassword)))}
                                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                        <>
                                            {authStep === 'otp' ? t('auth.verify_btn') : authStep === 'reset' ? 'Update Password' : (mode === 'unlock' ? t('auth.unlock_btn') : (mode === 'forgot_password' ? 'Send OTP' : (mode === 'login' ? t('auth.sign_in_btn') : 'Create Free Account')))}
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>

                                {/* Consent notice — inside the card, directly below the button */}
                                {mode === 'signup' && authStep === 'info' && (
                                    <p className="text-center text-[11px] text-gray-500 leading-relaxed">
                                        By clicking <span className="font-bold text-gray-700">"Create Free Account"</span>, you agree to our{' '}
                                        <Link href="/terms" target="_blank" className="text-emerald-700 font-semibold underline underline-offset-2">Terms of Service</Link>
                                        {' '}and{' '}
                                        <Link href="/privacy" target="_blank" className="text-emerald-700 font-semibold underline underline-offset-2">Privacy Policy</Link>.
                                    </p>
                                )}
                            </div>

                            {(mode === 'unlock' || mode === 'forgot_password') && (
                                <button type="button" onClick={() => { setMode('login'); setAuthStep('info'); setError(null); }} className="w-full text-center text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">
                                    {t('auth.back_to_login')}
                                </button>
                            )}
                        </form>
                    </div>

                    <p className="mt-8 text-center text-[10px] font-black text-emerald-900/40 uppercase tracking-[0.2em] px-8 leading-relaxed">
                        {t('auth.security_warning') || "Unauthorized access attempts are logged for audit."}
                    </p>
                </div>

                {/* ── Active Session Conflict Modal ─────────────────────────── */}
                {isConflictModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                            {/* Header / Brand Spot */}
                            <div className="h-2 bg-amber-500 w-full" />
                            
                            <div className="p-8">
                                <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <ShieldAlert className="w-8 h-8 text-amber-600" />
                                </div>

                                <h3 className="text-2xl font-black text-gray-900 text-center mb-2">
                                    Active Session Found
                                </h3>
                                <p className="text-gray-500 text-center text-sm leading-relaxed mb-8">
                                    Your account is currently signed in on another device or browser. 
                                    Do you want to sign out from there and log in here?
                                </p>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => finalizeLogin(conflictAuthData)}
                                        disabled={loading}
                                        className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <>
                                                <LogOut className="w-5 h-5" />
                                                Log Out Other Device
                                            </>
                                        )}
                                    </button>
                                    
                                    <button
                                        onClick={handleCancelTakeover}
                                        disabled={loading}
                                        className="w-full h-14 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>

                                <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                    Security Enforced by MandiPro
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {/* ───────────────────────────────────────────────────────────── */}

                {/* Hidden Diagnostic Overlay */}
                {showDebug && (
                    <div className="fixed inset-0 z-[100] bg-black/90 p-6 font-mono text-[10px] overflow-y-auto text-emerald-400">
                        <div className="flex justify-between items-center mb-4 border-b border-emerald-800 pb-2">
                            <span className="font-bold uppercase tracking-widest text-white">Diagnostics Panel</span>
                            <button onClick={() => setShowDebug(false)} className="text-white bg-emerald-800 px-2 py-1 rounded">CLOSE</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="text-emerald-600 mb-1">PLATFORM:</div>
                                <div>NATIVE WebView (Capacitor)</div>
                                <div>URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}</div>
                            </div>
                            <div>
                                <div className="text-emerald-600 mb-1">SESSION STATUS:</div>
                                <div>{connectionStatus === 'connected' ? '✅ Connected' : '❌ Disconnected'}</div>
                            </div>
                            <div>
                                <div className="text-emerald-600 mb-1">RECENT LOGS:</div>
                                <div className="bg-black p-2 border border-emerald-900 rounded space-y-1">
                                    {debugLog.map((log, i) => <div key={i}>{log}</div>)}
                                    {debugLog.length === 0 && <div className="text-gray-600 italic">No logs yet...</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx global>{`
                .auth-input {
                    width: 100%;
                    background: #f4f7ee;
                    border: 1.5px solid #c8d6b0;
                    border-radius: 0.875rem;
                    /* Only set top/bottom/right padding — left padding is controlled
                       by Tailwind's pl-12 / pl-4 utilities on each input element.
                       Setting 'padding' shorthand here would override those classes. */
                    padding-top: 0.875rem;
                    padding-bottom: 0.875rem;
                    padding-right: 1rem;
                    color: #1a202c;
                    font-weight: 500;
                    font-size: 0.9375rem;
                    line-height: 1.5;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
                }
                .auth-input:focus {
                    outline: none;
                    border-color: #059669;
                    background: #ffffff;
                    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12), inset 0 1px 2px rgba(0,0,0,0.02);
                }
                .auth-input::placeholder {
                    color: #9ca3af;
                    font-weight: 400;
                }
            `}</style>
        </div>
    )
}


