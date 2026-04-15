"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, Plus, Trash2, Key, RefreshCw, Shield, ToggleLeft, ToggleRight, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { format } from "date-fns";
import { nanoid } from "nanoid";

const DEFAULT_FLAGS = [
    { name: "bank_reconciliation", label: "Bank Reconciliation", description: "Match bank statements to ledger entries" },
    { name: "gst_billing", label: "GST-Ready Invoices", description: "HSN codes, GSTIN, CGST/SGST on invoices" },
    { name: "advance_payments", label: "Advance / Dadani System", description: "Pre-payments to farmers/suppliers" },
    { name: "api_access", label: "REST API Access", description: "External API with API key authentication" },
    { name: "multi_mandi", label: "Multi-Mandi Dashboard", description: "Consolidated cross-branch analytics" },
    { name: "balance_sheet", label: "Balance Sheet Report", description: "Assets, Liabilities & Equity report" },
];

export default function FeatureFlagsPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [flags, setFlags] = useState<any[]>([]);
    const [apiKeys, setApiKeys] = useState<any[]>([]);
    const [orgs, setOrgs] = useState<any[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState("");
    const [revealedKeys, setRevealedKeys] = useState<string[]>([]);

    const isSuperAdmin = profile?.role === "super_admin";

    useEffect(() => {
        if (profile?.organization_id) {
            fetchData();
        }
    }, [profile, selectedOrg]);

    const fetchData = async () => {
        setLoading(true);
        const orgId = selectedOrg || profile?.organization_id;

        const [flagsRes, keysRes, orgsRes] = await Promise.all([
            supabase.from("feature_flags").select("*").eq("organization_id", orgId),
            supabase.from("api_keys").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
            isSuperAdmin ? supabase.from("organizations").select("id, name").limit(50) : { data: null },
        ]);

        setFlags(flagsRes.data || []);
        setApiKeys(keysRes.data || []);
        if (orgsRes.data) setOrgs(orgsRes.data);
        setLoading(false);
    };

    const toggleFlag = async (flagName: string, currentValue: boolean) => {
        const orgId = selectedOrg || profile?.organization_id;
        const { error } = await supabase.from("feature_flags").upsert({
            organization_id: orgId,
            flag_name: flagName,
            is_enabled: !currentValue,
            set_by: profile?.id,
        }, { onConflict: "organization_id,flag_name" });

        if (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } else {
            toast({ title: `${flagName} ${!currentValue ? "enabled" : "disabled"}` });
            fetchData();
        }
    };

    const createApiKey = async () => {
        if (!newKeyName.trim()) return;
        const rawKey = `mnd_${nanoid(32)}`;
        const keyPrefix = rawKey.substring(0, 10);
        const orgId = selectedOrg || profile?.organization_id;

        // In a real app, hash the key with bcrypt before storing
        const { error } = await supabase.from("api_keys").insert({
            organization_id: orgId,
            name: newKeyName,
            key_hash: rawKey, // In production: hash this
            key_prefix: keyPrefix,
            scopes: ["read", "write"],
            created_by: profile?.id,
        });

        if (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } else {
            toast({ title: "API Key created", description: `Key: ${rawKey} — copy this now, it won't be shown again.` });
            await navigator.clipboard.writeText(rawKey);
            setNewKeyName("");
            fetchData();
        }
    };

    const revokeKey = async (keyId: string) => {
        await supabase.from("api_keys").update({ is_active: false }).eq("id", keyId);
        fetchData();
    };

    const getFlagState = (flagName: string) => {
        const flag = flags.find(f => f.flag_name === flagName);
        return flag?.is_enabled ?? false;
    };

    if (!isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <Shield className="w-16 h-16 text-slate-200" />
                <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Super Admin Only</p>
            </div>
        );
    }

    return (
        <ProtectedRoute requiredPermission="manage_settings">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                    <div className="max-w-5xl mx-auto flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                                <Zap className="w-7 h-7 text-amber-500" /> Feature Flags & API Keys
                            </h1>
                            <p className="text-slate-400 font-bold text-sm mt-0.5">Control per-organization feature access</p>
                        </div>
                        <div className="flex gap-3">
                            {orgs.length > 0 && (
                                <select
                                    value={selectedOrg}
                                    onChange={e => setSelectedOrg(e.target.value)}
                                    className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
                                >
                                    <option value="">My Organization</option>
                                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            )}
                            <Button onClick={fetchData} variant="outline" size="icon" className="rounded-xl">
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                        </div>
                    ) : (
                        <>
                            {/* Feature Flags */}
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4">Feature Flags</h3>
                                <div className="space-y-3">
                                    {DEFAULT_FLAGS.map(flag => {
                                        const enabled = getFlagState(flag.name);
                                        return (
                                            <div key={flag.name}
                                                className={cn("bg-white rounded-2xl border p-5 flex items-center justify-between transition-all shadow-sm",
                                                    enabled ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
                                                )}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                                                        enabled ? "bg-emerald-100" : "bg-slate-100")}>
                                                        <Zap className={cn("w-5 h-5", enabled ? "text-emerald-600" : "text-slate-400")} />
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-800 text-sm">{flag.label}</p>
                                                        <p className="text-xs font-bold text-slate-400 mt-0.5">{flag.description}</p>
                                                        <code className="text-[9px] font-mono text-slate-300">{flag.name}</code>
                                                    </div>
                                                </div>
                                                <button onClick={() => toggleFlag(flag.name, enabled)}>
                                                    {enabled
                                                        ? <ToggleRight className="w-10 h-10 text-emerald-500 hover:text-emerald-600 transition-colors" />
                                                        : <ToggleLeft className="w-10 h-10 text-slate-300 hover:text-slate-400 transition-colors" />
                                                    }
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* API Keys */}
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4">API Keys</h3>
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <div className="flex gap-3">
                                        <Input
                                            value={newKeyName}
                                            onChange={e => setNewKeyName(e.target.value)}
                                            placeholder="Key name (e.g., External App, Webhook)"
                                            className="rounded-xl border-slate-200 bg-slate-50 text-black"
                                            onKeyDown={e => { if (e.key === "Enter") createApiKey(); }}
                                        />
                                        <Button onClick={createApiKey} disabled={!newKeyName.trim()}
                                            className="bg-slate-900 text-white rounded-xl font-black gap-2 px-5">
                                            <Plus className="w-4 h-4" /> Generate
                                        </Button>
                                    </div>

                                    {apiKeys.length === 0 ? (
                                        <div className="py-8 text-center text-slate-400 font-bold text-sm">
                                            <Key className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                                            No API keys yet
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {apiKeys.map(key => (
                                                <div key={key.id} className={cn(
                                                    "flex items-center justify-between p-4 rounded-xl border",
                                                    key.is_active ? "border-slate-100 bg-slate-50" : "border-red-100 bg-red-50 opacity-60"
                                                )}>
                                                    <div className="flex items-center gap-3">
                                                        <Key className={cn("w-4 h-4", key.is_active ? "text-slate-400" : "text-red-400")} />
                                                        <div>
                                                            <p className="font-black text-slate-700 text-sm">{key.name}</p>
                                                            <code className="text-xs font-mono text-slate-400">
                                                                {revealedKeys.includes(key.id)
                                                                    ? key.key_hash
                                                                    : `${key.key_prefix}${"•".repeat(20)}`}
                                                            </code>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn("text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full",
                                                            key.is_active ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                                                        )}>
                                                            {key.is_active ? "Active" : "Revoked"}
                                                        </span>
                                                        <p className="text-xs text-slate-300 font-mono">{format(new Date(key.created_at), "dd MMM")}</p>
                                                        <button onClick={() => {
                                                            setRevealedKeys(prev => prev.includes(key.id) ? prev.filter(k => k !== key.id) : [...prev, key.id]);
                                                        }} className="p-1.5 hover:bg-slate-200 rounded-lg">
                                                            {revealedKeys.includes(key.id)
                                                                ? <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                                                                : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                                                        </button>
                                                        <button onClick={() => navigator.clipboard.writeText(key.key_hash)}
                                                            className="p-1.5 hover:bg-slate-200 rounded-lg">
                                                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                                                        </button>
                                                        {key.is_active && (
                                                            <button onClick={() => revokeKey(key.id)}
                                                                className="p-1.5 hover:bg-red-100 rounded-lg text-red-400">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
