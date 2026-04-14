"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Building2, Percent, Receipt, MapPin, ShieldCheck, UserPlus, Lock, Unlock, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { useLanguage } from "@/components/i18n/language-provider";
import { isNativePlatform } from "@/lib/capacitor-utils";
import { cn } from "@/lib/utils";

// Native components
import { NativeCard } from "@/components/mobile/NativeCard";
import { NativeInput, NativeSectionLabel } from "@/components/mobile/NativeInput";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { snackbar } from "@/components/mobile/Snackbar";

// ──────────────────────────────────────────────────────────────────────────────
// ALL BUSINESS LOGIC IDENTICAL — only JSX render changes on native
// ──────────────────────────────────────────────────────────────────────────────

export default function Settings() {
    const { can, profile, loading: rbacLoading } = usePermission();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [orgData, setOrgData] = useState<any>(null);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [dialogConfig, setDialogConfig] = useState({ title: "", message: "", type: "success" as "success" | "error" });

    useEffect(() => {
        if (rbacLoading) return;
        if (profile?.organization_id) fetchOrgData();
        else setLoading(false);
    }, [profile, rbacLoading]);

    const fetchOrgData = async () => {
        try {
            const { data } = await supabase.schema("core").from("organizations").select("*").eq("id", profile?.organization_id).single();
            const { data: mandiSettings } = await supabase.schema("mandi").from("mandi_settings" as any).select("*").eq("organization_id", profile?.organization_id).single();
            if (data) setOrgData({ ...data, ...mandiSettings });
        } catch (error) {
            console.error("Error fetching org data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const { error: orgError } = await supabase.schema("core").from("organizations").update({ name: orgData.name, gstin: orgData.gstin, address_line1: orgData.address_line1, address_line2: orgData.address_line2, settings: orgData.settings, period_lock_enabled: orgData.period_lock_enabled, period_locked_until: orgData.period_locked_until || null }).eq("id", profile?.organization_id);
        const { error: mandiError } = await supabase.schema("mandi").from("mandi_settings" as any).upsert({ organization_id: profile?.organization_id, market_fee_percent: orgData.market_fee_percent || 0, nirashrit_percent: orgData.nirashrit_percent || 0, misc_fee_percent: orgData.misc_fee_percent || 0, default_credit_days: orgData.default_credit_days || 15, commission_rate_default: orgData.commission_rate_default || 0, gst_enabled: orgData.gst_enabled || false, cgst_percent: orgData.cgst_percent || 0, sgst_percent: orgData.sgst_percent || 0, igst_percent: orgData.igst_percent || 0, gst_type: orgData.gst_type || "intra", max_invoice_amount: orgData.max_invoice_amount || 0, updated_at: new Date() }, { onConflict: "organization_id" });

        if (orgError || mandiError) {
            if (isNativePlatform()) snackbar.error(orgError?.message || mandiError?.message || "Update failed");
            else setDialogConfig({ title: "Update Failed", message: orgError?.message || mandiError?.message || "An unexpected error occurred.", type: "error" });
        } else {
            if (isNativePlatform()) snackbar.success("Settings saved successfully");
            else setDialogConfig({ title: "Settings Updated", message: "Mandi configuration has been synchronized.", type: "success" });
        }
        if (!isNativePlatform()) setShowSuccessDialog(true);
        setSaving(false);
    };

    if (loading || rbacLoading) return <SettingsSkeleton />;

    // ── NATIVE MOBILE RENDER ─────────────────────────────────────────────────
    if (isNativePlatform()) {
        return (
            <ProtectedRoute requiredPermission="manage_settings">
                <form onSubmit={handleSave}>
                    <div className="bg-[#EFEFEF] min-h-dvh pb-6">
                        {/* Business Identity */}
                        <NativeSectionLabel className="px-4 pt-4">Business Identity</NativeSectionLabel>
                        <div className="px-4 space-y-3">
                            <NativeInput
                                label="Legal Mandi Name"
                                required
                                value={orgData?.name || ""}
                                onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                                placeholder="e.g. Sharma Mandi"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <NativeInput
                                    label="GST Number"
                                    value={orgData?.gstin || ""}
                                    onChange={(e) => setOrgData({ ...orgData, gstin: e.target.value.toUpperCase() })}
                                    placeholder="27AAAAA0000A1Z5"
                                    className="uppercase font-mono"
                                />
                                <NativeInput
                                    label="Mandi License"
                                    value={orgData?.settings?.mandi_license || ""}
                                    onChange={(e) => setOrgData({ ...orgData, settings: { ...orgData?.settings, mandi_license: e.target.value } })}
                                    placeholder="LIC-12345"
                                />
                            </div>
                            <NativeInput
                                label="Address Line 1"
                                value={orgData?.address_line1 || ""}
                                onChange={(e) => setOrgData({ ...orgData, address_line1: e.target.value })}
                                placeholder="Street, Market Area"
                                leftIcon={<MapPin className="w-4 h-4" />}
                            />
                            <NativeInput
                                label="City, State"
                                value={orgData?.address_line2 || ""}
                                onChange={(e) => setOrgData({ ...orgData, address_line2: e.target.value })}
                                placeholder="e.g. Pune, Maharashtra"
                            />
                        </div>

                        {/* Global Rates */}
                        <NativeSectionLabel className="px-4 pt-2">Global Rates</NativeSectionLabel>
                        <div className="px-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <NativeInput
                                    label="Default Commission %"
                                    type="number"
                                    step="0.1"
                                    value={orgData?.commission_rate_default || ""}
                                    onChange={(e) => setOrgData({ ...orgData, commission_rate_default: parseFloat(e.target.value) })}
                                    leftIcon={<Percent className="w-4 h-4" />}
                                />
                                <NativeInput
                                    label="Default Credit Days"
                                    type="number"
                                    value={orgData?.default_credit_days || ""}
                                    onChange={(e) => setOrgData({ ...orgData, default_credit_days: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <NativeInput
                                    label="Market Fee %"
                                    type="number"
                                    step="0.1"
                                    value={orgData?.market_fee_percent || ""}
                                    onChange={(e) => setOrgData({ ...orgData, market_fee_percent: parseFloat(e.target.value) })}
                                    leftIcon={<Receipt className="w-4 h-4" />}
                                />
                                <NativeInput
                                    label="Nirashrit %"
                                    type="number"
                                    step="0.01"
                                    value={orgData?.nirashrit_percent || ""}
                                    onChange={(e) => setOrgData({ ...orgData, nirashrit_percent: parseFloat(e.target.value) })}
                                    leftIcon={<Percent className="w-4 h-4" />}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <NativeInput
                                    label="Misc Fee %"
                                    type="number"
                                    step="0.01"
                                    value={orgData?.misc_fee_percent || ""}
                                    onChange={(e) => setOrgData({ ...orgData, misc_fee_percent: parseFloat(e.target.value) })}
                                />
                                <NativeInput
                                    label="Max Invoice Amount"
                                    type="number"
                                    value={orgData?.max_invoice_amount || ""}
                                    onChange={(e) => setOrgData({ ...orgData, max_invoice_amount: parseFloat(e.target.value) })}
                                    placeholder="0 = No Limit"
                                    leftIcon={<span className="text-xs font-bold">₹</span>}
                                />
                            </div>
                        </div>

                        {/* GST Config */}
                        <NativeSectionLabel className="px-4 pt-2">GST Configuration</NativeSectionLabel>
                        <div className="px-4">
                            <NativeCard>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-sm font-semibold text-[#1A1A2E]">GST Enabled</p>
                                        <p className="text-xs text-[#6B7280] mt-0.5">Auto-calculate on all invoices</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setOrgData({ ...orgData, gst_enabled: !orgData?.gst_enabled })}
                                        className={cn("w-12 h-6 rounded-full transition-colors duration-300 relative focus:outline-none", orgData?.gst_enabled ? "bg-[#16A34A]" : "bg-[#D1D5DB]")}
                                    >
                                        <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300", orgData?.gst_enabled ? "left-7" : "left-1")} />
                                    </button>
                                </div>

                                {orgData?.gst_enabled && (
                                    <div className="px-4 pb-4 space-y-3 border-t border-[#F3F4F6] pt-3">
                                        {/* GST Type */}
                                        <div className="flex bg-[#F1F3F5] rounded-xl p-1">
                                            <button type="button" onClick={() => setOrgData({ ...orgData, gst_type: "intra" })} className={cn("flex-1 py-2 text-xs font-semibold rounded-lg transition-all", orgData?.gst_type !== "inter" ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#6B7280]")}>
                                                Intra (CGST+SGST)
                                            </button>
                                            <button type="button" onClick={() => setOrgData({ ...orgData, gst_type: "inter" })} className={cn("flex-1 py-2 text-xs font-semibold rounded-lg transition-all", orgData?.gst_type === "inter" ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#6B7280]")}>
                                                Inter (IGST)
                                            </button>
                                        </div>
                                        {orgData?.gst_type === "inter" ? (
                                            <NativeInput label="IGST %" type="number" step="0.01" value={orgData?.igst_percent || ""} onChange={(e) => setOrgData({ ...orgData, igst_percent: parseFloat(e.target.value) })} placeholder="e.g. 18" />
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                <NativeInput label="CGST %" type="number" step="0.01" value={orgData?.cgst_percent || ""} onChange={(e) => setOrgData({ ...orgData, cgst_percent: parseFloat(e.target.value) })} placeholder="e.g. 9" />
                                                <NativeInput label="SGST %" type="number" step="0.01" value={orgData?.sgst_percent || ""} onChange={(e) => setOrgData({ ...orgData, sgst_percent: parseFloat(e.target.value) })} placeholder="e.g. 9" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </NativeCard>
                        </div>


                        {/* Navigation links */}
                        <NativeSectionLabel className="px-4 pt-2">Team & Permissions</NativeSectionLabel>
                        <div className="px-4 space-y-2">
                            {can("nav.employees") && (
                                <NativeCard>
                                    <Link href="/settings/team">
                                        {(NativeCard as any).Row({ icon: <UserPlus className="w-4 h-4 text-[#2563EB]" />, label: t("nav.team_access") || "Team Access", showChevron: true })}
                                    </Link>
                                </NativeCard>
                            )}
                            {can("nav.field_governance") && (
                                <NativeCard>
                                    <Link href="/settings/fields">
                                        {(NativeCard as any).Row({ icon: <ShieldCheck className="w-4 h-4 text-[#16A34A]" />, label: t("nav.field_governance") || "Field Rules", showChevron: true })}
                                    </Link>
                                </NativeCard>
                            )}
                            <Link href="/settings/billing">
                                <NativeCard className="active:scale-[0.98] transition-transform">
                                    <div className="flex items-center gap-3 px-4 py-3.5">
                                        <div className="w-9 h-9 rounded-xl bg-[#1A6B3C]/10 flex items-center justify-center">
                                            <Receipt className="w-4 h-4 text-[#1A6B3C]" />
                                        </div>
                                        <p className="flex-1 text-sm font-semibold text-[#1A1A2E]">Billing & Subscription</p>
                                        <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />
                                    </div>
                                </NativeCard>
                            </Link>
                        </div>

                        {/* Save Button */}
                        <div className="px-4 pt-6">
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full h-14 bg-[#1A6B3C] text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(26,107,60,0.3)] active:scale-[0.98] transition-transform disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save Settings</>}
                            </button>
                        </div>
                    </div>
                </form>
            </ProtectedRoute>
        );
    }

    // ── WEB / DESKTOP RENDER (ORIGINAL — UNCHANGED) ──────────────────────────
    return (
        <ProtectedRoute requiredPermission="manage_settings">
            <div className="min-h-screen bg-slate-50 text-black p-8 pb-32">
                <div className="max-w-6xl mx-auto space-y-12">
                    <header className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div>
                            <h1 className="text-4xl font-[1000] text-black tracking-tighter uppercase flex items-center gap-3"><Building2 className="w-10 h-10 text-black" />Mandi <span className="text-blue-600">Control Center</span></h1>
                            <p className="text-slate-500 font-bold mt-1">{t("settings.subtitle") || "Configure global rates, team permissions, and financial security."}</p>
                        </div>
                        <div className="flex gap-4 flex-wrap">
                            {can("nav.employees") && <Button asChild variant="outline" className="bg-white border-slate-200 text-black hover:bg-slate-50 rounded-xl h-12 font-bold shadow-sm"><Link href="/settings/team"><UserPlus className="w-4 h-4 mr-2 text-blue-600" /> {t("nav.team_access")}</Link></Button>}
                            {can("nav.field_governance") && <Button asChild variant="outline" className="bg-white border-slate-200 text-black hover:bg-slate-50 rounded-xl h-12 font-bold shadow-sm"><Link href="/settings/fields"><ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" /> {t("nav.field_governance")}</Link></Button>}
                        </div>
                    </header>

                    <div className="max-w-3xl mx-auto">
                        <form onSubmit={handleSave} className="space-y-8">
                            <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldCheck className="w-32 h-32 text-slate-900" /></div>
                                <div className="flex items-center gap-3 text-black font-black italic tracking-tighter uppercase text-xs"><div className="w-8 h-px bg-black/20" />BUSINESS IDENTITY</div>
                                <div className="space-y-6">
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Mandi Name</Label><Input value={orgData?.name || ""} onChange={(e) => setOrgData({ ...orgData, name: e.target.value })} className="bg-slate-50 border-slate-200 h-14 text-lg font-black text-black rounded-2xl focus:border-blue-500" /></div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">GST Registration</Label><Input placeholder="27AAAAA0000A1Z5" value={orgData?.gstin || ""} onChange={(e) => setOrgData({ ...orgData, gstin: e.target.value })} className="bg-slate-50 border-slate-200 h-12 font-mono font-bold text-black rounded-xl uppercase" /></div>
                                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mandi License #</Label><Input placeholder="LIC-12345" value={orgData?.settings?.mandi_license || ""} onChange={(e) => setOrgData({ ...orgData, settings: { ...orgData?.settings, mandi_license: e.target.value } })} className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl" /></div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-purple-600 font-black italic tracking-tighter uppercase text-xs pt-4"><div className="w-8 h-px bg-purple-200" />GLOBAL RATES (%)</div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Default Commission</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.1" value={orgData?.commission_rate_default || ""} onChange={(e) => setOrgData({ ...orgData, commission_rate_default: parseFloat(e.target.value) })} className="pl-12 bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-purple-600" /></div></div>
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Default Credit Days</Label><Input type="number" value={orgData?.default_credit_days || ""} onChange={(e) => setOrgData({ ...orgData, default_credit_days: parseInt(e.target.value) })} className="bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-green-600" /></div>
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Market Fee</Label><div className="relative"><Receipt className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.1" value={orgData?.market_fee_percent || ""} onChange={(e) => setOrgData({ ...orgData, market_fee_percent: parseFloat(e.target.value) })} className="pl-12 bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-yellow-600" /></div></div>
                                    <div className="space-y-2 col-span-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nirashrit (Charity/Other)</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.01" value={orgData?.nirashrit_percent || ""} onChange={(e) => setOrgData({ ...orgData, nirashrit_percent: parseFloat(e.target.value) })} className="pl-12 bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-orange-600" /></div></div>
                                    <div className="space-y-2 col-span-1"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Misc Fee (%)</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.01" value={orgData?.misc_fee_percent || ""} onChange={(e) => setOrgData({ ...orgData, misc_fee_percent: parseFloat(e.target.value) })} className="pl-12 bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-blue-600" /></div></div>
                                    <div className="space-y-2 col-span-1"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Invoice Amount</Label><div className="relative"><div className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">₹</div><Input type="number" value={orgData?.max_invoice_amount || ""} onChange={(e) => setOrgData({ ...orgData, max_invoice_amount: parseFloat(e.target.value) })} className="pl-10 bg-slate-50 border-slate-200 h-12 font-black rounded-xl text-red-600" placeholder="0 = No Limit" /></div></div>
                                </div>
                                <div className="flex items-center gap-3 text-emerald-600 font-black italic tracking-tighter uppercase text-xs pt-4"><div className="w-8 h-px bg-emerald-200" />GST CONFIGURATION<div className="ml-auto flex items-center gap-2"><span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{orgData?.gst_enabled ? "Active" : "Disabled"}</span><button type="button" onClick={() => setOrgData({ ...orgData, gst_enabled: !orgData?.gst_enabled })} className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none ${orgData?.gst_enabled ? "bg-emerald-600" : "bg-slate-200"}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${orgData?.gst_enabled ? "translate-x-7" : "translate-x-1"}`} /></button></div></div>
                                {orgData?.gst_enabled && (<div className="space-y-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl"><div className="flex gap-2"><button type="button" onClick={() => setOrgData({ ...orgData, gst_type: "intra" })} className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${orgData?.gst_type !== "inter" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200"}`}>Intra-State (CGST + SGST)</button><button type="button" onClick={() => setOrgData({ ...orgData, gst_type: "inter" })} className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${orgData?.gst_type === "inter" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200"}`}>Inter-State (IGST)</button></div>{orgData?.gst_type === "inter" ? (<div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">IGST Rate (%)</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.01" value={orgData?.igst_percent || ""} onChange={(e) => setOrgData({ ...orgData, igst_percent: parseFloat(e.target.value) })} className="pl-12 bg-white border-slate-200 h-12 font-black rounded-xl text-blue-600" placeholder="e.g. 18" /></div></div>) : (<div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">CGST Rate (%)</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.01" value={orgData?.cgst_percent || ""} onChange={(e) => setOrgData({ ...orgData, cgst_percent: parseFloat(e.target.value) })} className="pl-12 bg-white border-slate-200 h-12 font-black rounded-xl text-emerald-600" placeholder="e.g. 9" /></div></div><div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">SGST Rate (%)</Label><div className="relative"><Percent className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input type="number" step="0.01" value={orgData?.sgst_percent || ""} onChange={(e) => setOrgData({ ...orgData, sgst_percent: parseFloat(e.target.value) })} className="pl-12 bg-white border-slate-200 h-12 font-black rounded-xl text-emerald-600" placeholder="e.g. 9" /></div></div></div>)}<p className="text-[9px] text-emerald-700 font-medium leading-relaxed">⚡ When enabled, GST will be auto-calculated and printed on every invoice.</p></div>)}
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mandi Address</Label><div className="space-y-3"><div className="relative"><MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Line 1" value={orgData?.address_line1 || ""} onChange={(e) => setOrgData({ ...orgData, address_line1: e.target.value })} className="pl-12 bg-slate-50 border-slate-200 h-12 rounded-xl text-black font-bold" /></div><Input placeholder="City, State" value={orgData?.address_line2 || ""} onChange={(e) => setOrgData({ ...orgData, address_line2: e.target.value })} className="bg-slate-50 border-slate-200 h-12 rounded-xl text-black font-bold" /></div></div>
                                <Button type="submit" disabled={saving} className="w-full bg-black text-white hover:bg-slate-800 font-black uppercase tracking-widest h-14 rounded-2xl shadow-lg transition-all">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Commit Changes</>}</Button>
                            </div>
                        </form>


                    </div>
                </div>
            </div>

            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent className="max-w-md p-0 overflow-hidden border-none rounded-[32px] shadow-2xl bg-white">
                    <div className={cn("p-12 text-white flex flex-col items-center text-center relative overflow-hidden", dialogConfig.type === "success" ? "bg-emerald-500" : "bg-red-500")}>
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-50" />
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl relative z-10 mb-6">{dialogConfig.type === "success" ? <CheckCircle2 className="w-12 h-12 text-emerald-500" /> : <AlertTriangle className="w-12 h-12 text-red-500" />}</div>
                        <h2 className="text-3xl font-black tracking-tight uppercase relative z-10">{dialogConfig.title}</h2>
                    </div>
                    <div className="p-10 space-y-8 text-center bg-white"><p className="text-slate-600 font-bold leading-relaxed">{dialogConfig.message}</p><Button className={cn("w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl active:scale-95", dialogConfig.type === "success" ? "bg-slate-900 hover:bg-black text-white" : "bg-red-500 hover:bg-red-600 text-white")} onClick={() => setShowSuccessDialog(false)}>{dialogConfig.type === "success" ? "Got it, Thanks" : "Dismiss"}</Button></div>
                </DialogContent>
            </Dialog>
        </ProtectedRoute>
    );
}
