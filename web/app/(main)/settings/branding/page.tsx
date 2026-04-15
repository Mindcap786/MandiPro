"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, Image, Palette, Link2, Save, MapPin, Hash, Building2, Phone, Mail, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";

const CURRENCIES = [
    { code: "INR", name: "Indian Rupee ₹", flag: "🇮🇳" },
    { code: "USD", name: "US Dollar $", flag: "🇺🇸" },
    { code: "AED", name: "UAE Dirham د.إ", flag: "🇦🇪" },
    { code: "NGN", name: "Nigerian Naira ₦", flag: "🇳🇬" },
    { code: "KES", name: "Kenyan Shilling KSh", flag: "🇰🇪" },
    { code: "GHS", name: "Ghana Cedi ₵", flag: "🇬🇭" },
    { code: "ZAR", name: "South African Rand R", flag: "🇿🇦" },
];

const LOCALES = [
    { code: "en-IN", label: "English (India)", flag: "🇮🇳" },
    { code: "en-US", label: "English (US)", flag: "🇺🇸" },
    { code: "hi-IN", label: "हिंदी (Hindi)", flag: "🇮🇳" },
    { code: "ar-AE", label: "العربية (Arabic)", flag: "🇦🇪" },
    { code: "sw-KE", label: "Kiswahili", flag: "🇰🇪" },
    { code: "fr-FR", label: "Français", flag: "🇫🇷" },
];

const TIMEZONES = [
    "Asia/Kolkata", "Asia/Dubai", "Africa/Lagos", "Africa/Nairobi",
    "Africa/Accra", "Africa/Cairo", "Africa/Johannesburg",
    "Europe/London", "America/New_York", "America/Chicago",
];



// Defined at MODULE level to avoid remounting on state change
function Field({ label, icon: Icon, children, hint }: { label: string; icon: any; children: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Icon className="w-3.5 h-3.5" /> {label}
            </label>
            {children}
            {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
        </div>
    );
}

function SectionCard({ title, icon: Icon, color, children }: { title: string; icon: any; color: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-8 space-y-6">
            <h3 className={cn("font-black uppercase tracking-tight text-sm flex items-center gap-2", color)}>
                <Icon className="w-4 h-4" /> {title}
            </h3>
            {children}
        </div>
    );
}

export default function WhiteLabelPage() {
    const { profile, refreshOrg } = useAuth();
    const { toast } = useToast();
    const [form, setForm] = useState({
        // Identity
        name: "",
        slug: "",
        gstin: "",
        pan_number: "",
        // Contact
        phone: "",
        email: "",
        whatsapp_number: "",
        website: "",
        // Address
        address_line1: "",
        address_line2: "",
        city: "",
        state: "",
        pincode: "",
        // Branding
        logo_url: "",
        brand_color: "#10b981",
        brand_color_secondary: "#0f172a",
        header_color: "#0f172a",
        footer_text: "",
        custom_domain: "",
        // Regional
        currency_code: "INR",
        locale: "en-IN",
        timezone: "Asia/Kolkata",
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [logoError, setLogoError] = useState(false);
    const [uploading, setUploading] = useState(false);

    const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

    useEffect(() => {
        if (profile?.organization_id) fetchOrg();
    }, [profile]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.organization_id) return;

        // Validations
        if (file.size > 2 * 1024 * 1024) {
            toast({ title: "❌ File too large", description: "Logo must be under 2MB", variant: "destructive" });
            return;
        }

        setUploading(true);
        setLogoError(false);
        const fileExt = file.name.split('.').pop();
        const fileName = `${profile.organization_id}/logo-${Math.random()}.${fileExt}`;

        try {
            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('logos')
                .getPublicUrl(fileName);

            set("logo_url", publicUrl);
            toast({ title: "✅ Logo Uploaded", description: "Click save to apply changes permanently." });
        } catch (err: any) {
            toast({ title: "❌ Upload Failed", description: err.message, variant: "destructive" });
        } finally {
            setUploading(false);
        }
    };

    const fetchOrg = async () => {
        setLoading(true);
        const { data } = await supabase
            .schema('core')
            .from("organizations")
            .select("*")
            .eq("id", profile?.organization_id)
            .single();

        if (data) {
            setForm(f => ({
                ...f,
                name: data.name || "",
                slug: data.slug || "",
                gstin: data.gstin || "",
                pan_number: data.pan_number || "",
                phone: data.phone || "",
                email: data.email || "",
                whatsapp_number: data.whatsapp_number || "",
                website: data.website || "",
                address_line1: data.address_line1 || "",
                address_line2: data.address_line2 || "",
                city: data.city || "",
                state: data.state || "",
                pincode: data.pincode || "",
                logo_url: data.logo_url || "",
                brand_color: data.brand_color || "#10b981",
                brand_color_secondary: data.brand_color_secondary || "#0f172a",
                header_color: data.header_color || data.brand_color_secondary || "#0f172a",
                footer_text: data.footer_text || "",
                custom_domain: data.custom_domain || "",
                currency_code: data.currency_code || "INR",
                locale: data.locale || "en-IN",
                timezone: data.timezone || "Asia/Kolkata",
            }));
        }
        setLoading(false);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/branding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orgId: profile?.organization_id,
                    updates: {
                        name: form.name,
                        slug: form.slug,
                        gstin: form.gstin,
                        pan_number: form.pan_number,
                        phone: form.phone,
                        email: form.email,
                        whatsapp_number: form.whatsapp_number,
                        website: form.website,
                        address_line1: form.address_line1,
                        address_line2: form.address_line2,
                        city: form.city,
                        state: form.state,
                        pincode: form.pincode,
                        logo_url: form.logo_url,
                        brand_color: form.brand_color,
                        brand_color_secondary: form.brand_color_secondary,
                        header_color: form.header_color,
                        footer_text: form.footer_text,
                        custom_domain: form.custom_domain,
                        currency_code: form.currency_code,
                        locale: form.locale,
                        timezone: form.timezone,
                    }
                })
            });

            const data = await res.json();
            
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to save changes');
            }

            toast({ title: "✅ Saved!", description: "Branding changes applied across all invoices and menus." });

            // Update local profile cache so sidebar/header picks up new name & colors instantly
            try {
                const cached = localStorage.getItem('mandi_profile_cache');
                if (cached) {
                    const p = JSON.parse(cached);
                    p.organization = { ...p.organization, ...form };
                    localStorage.setItem('mandi_profile_cache', JSON.stringify(p));
                }
            } catch { /* ignore cache errors */ }

            // Refresh org context in background (don't await - avoids hanging if it fails)
            refreshOrg?.().catch(() => {});

        } catch (err: any) {
            toast({ title: "❌ Error", description: err?.message || "Unexpected error", variant: "destructive" });
        } finally {
            // ALWAYS stop spinner
            setSaving(false);
        }
    };


    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        </div>
    );

    const fullAddress = [form.address_line1, form.address_line2, form.city, form.state, form.pincode].filter(Boolean).join(", ");

    return (
        <ProtectedRoute requiredPermission="manage_settings">
            <div className="min-h-screen bg-[#F0F2F5] pb-24">
                {/* Sticky header bar — live preview of sidebar branding */}
                <div className="sticky top-0 z-10 border-b border-slate-200 shadow-sm" style={{ backgroundColor: form.header_color || "#0f172a" }}>
                    <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {form.logo_url && !logoError ? (
                                <img
                                    src={form.logo_url}
                                    alt="Logo"
                                    className="h-10 w-auto rounded-xl object-contain bg-white/10 p-1"
                                    onError={() => setLogoError(true)}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg"
                                    style={{ backgroundColor: form.brand_color }}>
                                    {(form.name || "M").charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-white font-[1000] text-lg tracking-tight">{form.name || "Your Mandi"}</p>
                                {form.city && <p className="text-white/40 text-xs font-bold">{form.city}{form.state ? `, ${form.state}` : ""}</p>}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Live Preview</span>
                            <Button onClick={save} disabled={saving}
                                className="rounded-xl font-black gap-2 text-white border-white/20"
                                style={{ backgroundColor: form.brand_color }}>
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left 2/3: Identity + Branding */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Organization Identity */}
                        <SectionCard title="Organization Identity" icon={Building2} color="text-indigo-600">
                            <div className="grid grid-cols-2 gap-5">
                                <Field label="Organization Name" icon={Building2} hint="Appears on all invoices and menus">
                                    <Input value={form.name} onChange={e => set("name", e.target.value)}
                                        placeholder="Your Mandi Name"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-bold" />
                                </Field>
                                <Field label="Slug / Short ID" icon={Hash} hint="Unique URL identifier (auto-generated, can edit)">
                                    <Input value={form.slug} onChange={e => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                                        placeholder="my-mandi"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                </Field>
                                <Field label="GSTIN" icon={Hash}>
                                    <Input value={form.gstin} onChange={e => set("gstin", e.target.value.toUpperCase())}
                                        placeholder="22AAAAA0000A1Z5"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                </Field>
                                <Field label="PAN Number" icon={Hash}>
                                    <Input value={form.pan_number} onChange={e => set("pan_number", e.target.value.toUpperCase())}
                                        placeholder="AABCP1234C"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                </Field>
                            </div>
                        </SectionCard>

                        {/* Address */}
                        <SectionCard title="Business Address" icon={MapPin} color="text-emerald-600">
                            <div className="grid grid-cols-2 gap-5">
                                <div className="col-span-2">
                                    <Field label="Address Line 1" icon={MapPin}>
                                        <Input value={form.address_line1} onChange={e => set("address_line1", e.target.value)}
                                            placeholder="Plot No. / Building / Street"
                                            className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                    </Field>
                                </div>
                                <div className="col-span-2">
                                    <Field label="Address Line 2" icon={MapPin}>
                                        <Input value={form.address_line2} onChange={e => set("address_line2", e.target.value)}
                                            placeholder="Area / Landmark"
                                            className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                    </Field>
                                </div>
                                <Field label="City" icon={MapPin}>
                                    <Input value={form.city} onChange={e => set("city", e.target.value)}
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-bold" />
                                </Field>
                                <Field label="State" icon={MapPin}>
                                    <Input value={form.state} onChange={e => set("state", e.target.value)}
                                        placeholder="Maharashtra"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                </Field>
                                <Field label="Pincode" icon={MapPin}>
                                    <Input value={form.pincode} onChange={e => set("pincode", e.target.value)}
                                        placeholder="400001"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                </Field>
                            </div>
                        </SectionCard>

                        {/* Contact */}
                        <SectionCard title="Contact Details" icon={Phone} color="text-blue-600">
                            <div className="grid grid-cols-2 gap-5">
                                <Field label="Phone" icon={Phone}>
                                    <Input value={form.phone} onChange={e => set("phone", e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                </Field>
                                <Field label="WhatsApp Business" icon={Phone}>
                                    <Input value={form.whatsapp_number} onChange={e => set("whatsapp_number", e.target.value)}
                                        placeholder="+91 98765 43210"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                </Field>
                                <Field label="Business Email" icon={Mail}>
                                    <Input value={form.email} onChange={e => set("email", e.target.value)}
                                        placeholder="info@yourmandi.com"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                </Field>
                                <Field label="Website" icon={ExternalLink}>
                                    <Input value={form.website} onChange={e => set("website", e.target.value)}
                                        placeholder="https://yourmandi.com"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono text-xs" />
                                </Field>
                            </div>
                        </SectionCard>

                        {/* Branding */}
                        <SectionCard title="White-Label Branding" icon={Palette} color="text-purple-600">
                            <Field label="Organization Logo" icon={Image} hint="Recommended: Square PNG/SVG with transparent background.">
                                <div className="flex items-center gap-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <div className="relative group">
                                        {form.logo_url && !logoError ? (
                                            <div className="relative">
                                                <img
                                                    src={form.logo_url}
                                                    alt="Logo Preview"
                                                    className="w-24 h-24 rounded-2xl object-contain bg-white shadow-sm border border-slate-200"
                                                    onError={() => setLogoError(true)}
                                                />
                                                <button
                                                    onClick={() => set("logo_url", "")}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Hash className="w-3 h-3 rotate-45" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-24 h-24 rounded-2xl bg-slate-200 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                                                <Image className="w-8 h-8 mb-1" />
                                                <span className="text-[8px] font-black uppercase">No Logo</span>
                                            </div>
                                        )}
                                        {uploading && (
                                            <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <p className="text-[11px] text-slate-500 leading-tight">
                                            Your logo will appear on all bills, dashboards, and the sidebar.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                className="relative h-9 rounded-xl font-bold bg-white overflow-hidden"
                                                disabled={uploading}
                                            >
                                                <input
                                                    type="file"
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    accept="image/*"
                                                    onChange={handleLogoUpload}
                                                />
                                                {uploading ? "Uploading..." : "Upload File"}
                                            </Button>
                                            {form.logo_url && (
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => set("logo_url", "")}
                                                    className="h-9 rounded-xl font-bold text-red-500 hover:text-red-600 hover:bg-red-50"
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {logoError && form.logo_url && (
                                    <p className="text-[10px] text-amber-500 font-bold mt-2">⚠️ Could not load image. Try uploading a fresh PNG.</p>
                                )}
                            </Field>

                            <div className="grid grid-cols-2 gap-5">
                                <Field label="Invoice Footer Text" icon={Globe}>
                                    <Input value={form.footer_text} onChange={e => set("footer_text", e.target.value)}
                                        placeholder="Thank you for your business!"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black" />
                                </Field>
                                <Field label="Custom Domain" icon={Link2} hint="For white-label deployments">
                                    <Input value={form.custom_domain} onChange={e => set("custom_domain", e.target.value)}
                                        placeholder="erp.yourmandi.com"
                                        className="rounded-xl border-slate-200 bg-slate-50 text-black font-mono" />
                                </Field>
                            </div>
                        </SectionCard>
                    </div>

                    {/* Right 1/3: Regional + Preview */}
                    <div className="space-y-6">
                        <SectionCard title="Regional Settings" icon={Globe} color="text-blue-600">
                            <div className="space-y-4">
                                <Field label="Currency" icon={Globe}>
                                    <select value={form.currency_code}
                                        onChange={e => set("currency_code", e.target.value)}
                                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700 text-sm">
                                        {CURRENCIES.map(c => (
                                            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Language / Locale" icon={Globe}>
                                    <select value={form.locale}
                                        onChange={e => set("locale", e.target.value)}
                                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700 text-sm">
                                        {LOCALES.map(l => (
                                            <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Timezone" icon={Globe}>
                                    <select value={form.timezone}
                                        onChange={e => set("timezone", e.target.value)}
                                        className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700 text-sm">
                                        {TIMEZONES.map(tz => (
                                            <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                        </SectionCard>

                        {/* Invoice Preview Card */}
                        <div className="rounded-[28px] border-2 p-6 space-y-3 bg-white" style={{ borderColor: form.brand_color }}>
                            <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Invoice Preview</p>
                                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: form.brand_color + '20', color: form.brand_color }}>Live</span>
                            </div>
                            <div className="rounded-2xl p-4 space-y-1" style={{ backgroundColor: form.header_color }}>
                                {form.logo_url && !logoError ? (
                                    <img src={form.logo_url} alt="logo" className="h-8 w-auto object-contain mb-2 opacity-90" onError={() => setLogoError(true)} />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black mb-2 text-sm"
                                        style={{ backgroundColor: form.brand_color }}>
                                        {(form.name || "M").charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <p className="text-white font-[1000] text-sm">{form.name || "Your Mandi"}</p>
                                {form.city && <p className="text-white/50 text-[10px]">{form.city}{form.state ? `, ${form.state}` : ""}</p>}
                                {form.gstin && <p className="text-white/30 text-[9px] font-mono mt-1">GSTIN: {form.gstin}</p>}
                                {form.phone && <p className="text-white/30 text-[9px] mt-0.5">📞 {form.phone}</p>}
                            </div>
                            {fullAddress && (
                                <p className="text-[10px] text-slate-500 font-medium px-1">{fullAddress}</p>
                            )}
                            <div className="space-y-1 border-t border-slate-100 pt-3">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400">Currency:</span>
                                    <span style={{ color: form.brand_color }}>
                                        {CURRENCIES.find(c => c.code === form.currency_code)?.name || form.currency_code}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-slate-400">Locale:</span>
                                    <span style={{ color: form.brand_color }}>
                                        {LOCALES.find(l => l.code === form.locale)?.label || form.locale}
                                    </span>
                                </div>
                                {form.slug && (
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-400">ID / Slug:</span>
                                        <span className="font-mono text-slate-500">{form.slug}</span>
                                    </div>
                                )}
                            </div>
                            {form.footer_text && (
                                <p className="text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-2 italic">
                                    &ldquo;{form.footer_text}&rdquo;
                                </p>
                            )}
                        </div>

                        {/* Info box */}
                        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-5 space-y-2">
                            <div className="flex items-center gap-2 text-blue-700 font-black text-xs uppercase tracking-widest">
                                <Info className="w-4 h-4" /> How branding flows
                            </div>
                            <ul className="text-[11px] text-blue-600 space-y-1 font-medium">
                                <li>• <strong>Name</strong> appears on all invoices, sidebar, and printouts</li>
                                <li>• <strong>Logo</strong> shown in invoice header and sidebar top</li>

                                <li>• <strong>GSTIN & Address</strong> printed on every invoice</li>
                                <li>• <strong>Slug</strong> is your internal unique ID — never changes once set</li>
                                <li>• All changes save to the database and propagate instantly</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
