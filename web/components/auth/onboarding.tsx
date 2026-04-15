"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Loader2, Store, MapPin, CheckCircle2, ArrowRight, UserPlus, ShieldCheck, UserCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export function Onboarding({ onComplete }: { onComplete: () => void }) {
    const [domain, setDomain] = useState<'mandi'>('mandi')
    const [name, setName] = useState("")
    const [city, setCity] = useState("")
    const [username, setUsername] = useState("")
    const [phone, setPhone] = useState("")
    const [joinCode, setJoinCode] = useState("")
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState(1) // 1: Mode Selection, 2: Details, 3: Success
    const [mode, setMode] = useState<'create' | 'join'>('create')
    
    // Global Username Uniqueness Guard
    const [isUsernameTaken, setIsUsernameTaken] = useState(false)
    const [checkingUsername, setCheckingUsername] = useState(false)

    useEffect(() => {
        if (!username || username.length < 3) {
            setIsUsernameTaken(false)
            return
        }

        const timer = setTimeout(async () => {
            setCheckingUsername(true)
            const { count } = await supabase.schema('core')
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .ilike('full_name', username.trim())

            setIsUsernameTaken(!!count && count > 0)
            setCheckingUsername(false)
        }, 500)

        return () => clearTimeout(timer)
    }, [username])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (step === 1 && mode === 'create') {
            setStep(2)
            return
        }

        if (isUsernameTaken) {
            alert("Username already taken. Please choose a unique user identity.")
            return
        }

        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("No session found. Please log in again.")

            if (mode === 'create') {
                const storedPlan = localStorage.getItem('mandi_intent_plan');
                const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
                const planId = storedPlan && isValidUUID(storedPlan) ? storedPlan : null;

                const { error: rpcError } = await supabase.schema('core').rpc('initialize_organization', {
                    p_name: name,
                    p_city: city,
                    p_full_name: username.trim() || user.email?.split('@')[0] || 'Merchant',
                    p_business_domain: domain,
                    p_plan_id: planId
                })
                if (rpcError) throw rpcError
                
                // Add the phone number to the profile if provided
                if (phone.trim()) {
                    await supabase.schema('core').from('profiles').update({ phone: phone.trim() }).eq('id', user.id);
                }
                
                localStorage.removeItem('mandi_intent_plan');
            } else {
                const limitRes = await fetch('/api/organization/check-limit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ joinCode: joinCode.trim() })
                });

                const limitData = await limitRes.json();
                if (!limitRes.ok) throw new Error(limitData.error || "Failed to verify organization.");
                if (!limitData.allowed) throw new Error(`Cannot join: Plan limit reached (${limitData.currentCount}/${limitData.limit}). Ask admin to upgrade.`);

                const { data, error } = await supabase.schema('core').rpc('join_organization', {
                    p_join_code: joinCode.trim(),
                    p_full_name: username.trim()
                })
                if (error) throw error
                if (data && !data.success) throw new Error(data.message)
            }

            setStep(3)
            setTimeout(() => {
                onComplete()
            }, 2000)
        } catch (error: any) {
            alert(error.message || "Onboarding failed. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-lg">
                <AnimatePresence mode="wait">
                    {step === 1 ? (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-panel p-10 rounded-[40px] border-white/10 relative overflow-hidden"
                        >
                            <div className="mb-8">
                                <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">Initialize <span className="text-emerald-500">MindT</span></h1>
                                <p className="text-gray-400 font-medium italic tracking-tight">Access the next-generation ERP ecosystem.</p>
                            </div>

                            <div className="flex p-1 bg-white/5 rounded-2xl mb-8 border border-white/5">
                                <button
                                    onClick={() => setMode('create')}
                                    className={cn(
                                        "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        mode === 'create' ? 'bg-neon-green text-black' : 'text-gray-500 hover:text-white'
                                    )}
                                >
                                    <Store className="w-3 h-3 inline mr-2" /> Start New Business
                                </button>
                                <button
                                    onClick={() => setMode('join')}
                                    className={cn(
                                        "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        mode === 'join' ? 'bg-neon-blue text-white' : 'text-gray-500 hover:text-white'
                                    )}
                                >
                                    <UserPlus className="w-3 h-3 inline mr-2" /> Join as Staff
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* UNIQUE USERNAME FIELD - ALWAYS REQUIRED */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center justify-between">
                                        Choose Unique Username
                                        {checkingUsername && <Loader2 className="w-3 h-3 animate-spin text-neon-green" />}
                                        {isUsernameTaken && <span className="text-red-500 lowercase font-bold">already taken</span>}
                                        {!isUsernameTaken && username.length >= 3 && <span className="text-neon-green lowercase font-bold">available</span>}
                                    </label>
                                    <div className="relative">
                                        <UserCircle className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5", isUsernameTaken ? "text-red-500" : "text-gray-400")} />
                                        <input
                                            required
                                            placeholder="e.g. mandi_owner_1"
                                            className={cn(
                                                "w-full pl-14 bg-black/40 border h-16 rounded-2xl text-white text-lg font-bold transition-all",
                                                isUsernameTaken ? "border-red-500/50 focus:border-red-500" : "border-white/10 focus:border-neon-green"
                                            )}
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {mode === 'create' ? (
                                    <div className="space-y-4">
                                        <div className="p-8 rounded-[40px] bg-emerald-500/5 border border-emerald-500/20 text-center relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <div className="relative z-10 flex flex-col items-center gap-4">
                                                <div className="p-4 rounded-3xl bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                                                    <Store className="w-8 h-8" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-[1000] text-emerald-500 tracking-tighter uppercase italic">Mandi Pro ERP</h3>
                                                    <p className="text-[10px] text-gray-500 font-bold mt-1 leading-relaxed max-w-[200px] mx-auto uppercase tracking-widest">
                                                        Next-gen ecosystem for commission agents, traders & mandis.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-neon-blue tracking-widest">Enter Admin Join Code</label>
                                        <div className="relative">
                                            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neon-blue" />
                                            <input
                                                required
                                                placeholder="e.g. a1b2c3d4"
                                                className="w-full pl-14 bg-black/40 border border-neon-blue/30 h-16 rounded-2xl text-white text-xl font-mono tracking-widest font-black focus:border-neon-blue transition-all uppercase"
                                                value={joinCode}
                                                onChange={(e) => setJoinCode(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || isUsernameTaken || username.length < 3}
                                    className={cn(
                                        "w-full h-16 rounded-2xl text-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg transition-all",
                                        mode === 'create' ? 'bg-neon-green text-black shadow-neon-green/10' : 'bg-neon-blue text-white shadow-neon-blue/10',
                                        (isUsernameTaken || username.length < 3) && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                        <>{mode === 'create' ? 'Continue' : 'Request Access'} <ArrowRight className="w-6 h-6" /></>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    ) : step === 2 ? (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="glass-panel p-10 rounded-[40px] border-white/10 relative overflow-hidden"
                        >
                            <div className="mb-8">
                                <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-2">Finalize <span className={domain === 'mandi' ? 'text-neon-green' : 'text-neon-blue'}>Setup</span></h1>
                                <p className="text-gray-400 font-medium italic tracking-tight">Tell us about your organization.</p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Business Name</label>
                                    <div className="relative">
                                        <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            required
                                            autoFocus
                                            placeholder="e.g. Acme Distribution"
                                            className="w-full pl-14 bg-black/40 border border-white/10 h-16 rounded-2xl text-white text-lg font-bold focus:border-neon-green transition-all"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Base Operation City</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            required
                                            placeholder="e.g. New Delhi"
                                            className="w-full pl-14 bg-black/40 border border-white/10 h-16 rounded-2xl text-white text-lg font-bold focus:border-neon-green transition-all"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Phone Number (Optional)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">+91</span>
                                        <input
                                            type="tel"
                                            placeholder="9876543210"
                                            className="w-full pl-14 bg-black/40 border border-white/10 h-16 rounded-2xl text-white text-lg font-mono font-bold focus:border-neon-green transition-all"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="h-16 px-8 rounded-2xl border border-white/10 text-white font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                                    >
                                        Back
                                    </button>
                                    <button
                                        disabled={loading}
                                        className={cn(
                                            "flex-1 h-16 rounded-2xl text-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg transition-all",
                                            domain === 'mandi' ? 'bg-neon-green text-black' : 'bg-neon-blue text-white'
                                        )}
                                    >
                                        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                            <>Deploy <ArrowRight className="w-6 h-6" /></>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center"
                        >
                            <CheckCircle2 className={cn(
                                "w-24 h-24 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]",
                                domain === 'mandi' ? 'text-neon-green' : 'text-neon-blue'
                            )} />
                            <h2 className="text-3xl font-black text-white uppercase tracking-tight">Cloud Finalized.</h2>
                            <p className="text-gray-400 mt-2">Redirecting to your {domain} dashboard...</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
