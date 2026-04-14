"use client";
import { NativePageWrapper } from "@/components/mobile/NativePageWrapper";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, AlertCircle, CheckCircle2, Clock, Filter, Send, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { format } from "date-fns";

const TEMPLATES = [
    { key: "polite", label: "Polite 🙏", color: "text-blue-600 bg-blue-50 border-blue-200" },
    { key: "firm", label: "Firm ⚡", color: "text-amber-600 bg-amber-50 border-amber-200" },
    { key: "urgent", label: "Urgent ⚠️", color: "text-red-600 bg-red-50 border-red-200" },
];

export default function DunningPage() {
    const { profile } = useAuth();
    const { toast } = useToast();
    const [overdueContacts, setOverdueContacts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<"polite" | "firm" | "urgent">("polite");
    const [previewing, setPreviewing] = useState<string | null>(null);
    const [preview, setPreview] = useState<any>(null);
    const [reminders, setReminders] = useState<any[]>([]);

    useEffect(() => {
        if (profile?.organization_id) { fetchOverdue(); fetchReminders(); }
    }, [profile]);

    const fetchOverdue = async () => {
        setLoading(true);
        const { data } = await supabase
            .from("sales")
            .select("id, bill_no, sale_date, total_amount, contact:contacts(id, name, phone)")
            .eq("organization_id", profile?.organization_id)
            .neq("payment_status", "paid")
            .lt("sale_date", new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString());

        if (data) {
            const grouped = data.reduce((acc: any, s: any) => {
                const cId = s.contact?.id;
                if (!cId) return acc;
                if (!acc[cId]) acc[cId] = { contact: s.contact, sales: [], total: 0 };
                acc[cId].sales.push(s);
                acc[cId].total += Number(s.total_amount || 0);
                return acc;
            }, {});
            setOverdueContacts(Object.values(grouped));
        }
        setLoading(false);
    };

    const fetchReminders = async () => {
        const { data } = await supabase.from("payment_reminders")
            .select("*, contact:contacts(name)")
            .eq("organization_id", profile?.organization_id)
            .order("sent_at", { ascending: false }).limit(20);
        if (data) setReminders(data);
    };

    const getPreview = async (contactId: string) => {
        setPreviewing(contactId);
        const { data } = await supabase.rpc("get_dunning_message", {
            p_org_id: profile?.organization_id,
            p_contact_id: contactId,
            p_template: selectedTemplate,
        });
        setPreview({ ...data, contact_id: contactId });
    };

    const sendReminder = async () => {
        if (!preview?.contact_id) return;
        const { error } = await supabase.from("payment_reminders").insert({
            organization_id: profile?.organization_id,
            contact_id: preview.contact_id,
            channel: "whatsapp",
            message: preview.message,
            status: "sent",
            created_by: profile?.id,
        });
        if (error) { toast({ title: "Error", variant: "destructive" }); return; }

        window.open(`https://wa.me/91${preview.phone?.replace(/\D/g, "")}?text=${encodeURIComponent(preview.message)}`, "_blank");
        toast({ title: `✅ Reminder sent via WhatsApp to ${preview.contact_name}` });
        setPreviewing(null);
        setPreview(null);
        fetchReminders();
    };

    return (
        <ProtectedRoute requiredPermission="view_financials">
            <div className="min-h-screen bg-[#F0F2F5] pb-20">
                <div className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-[1000] tracking-tighter text-slate-800 uppercase flex items-center gap-3">
                                <MessageCircle className="w-7 h-7 text-green-500" /> Payment Reminders
                            </h1>
                            <p className="text-slate-400 font-bold text-sm mt-0.5">WhatsApp dunning for overdue payments</p>
                        </div>
                        <div className="flex gap-2">
                            {TEMPLATES.map(t => (
                                <button key={t.key} onClick={() => setSelectedTemplate(t.key as any)}
                                    className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
                                        selectedTemplate === t.key ? t.color : "bg-white border-slate-200 text-slate-400")}>
                                    {t.label}
                                </button>
                            ))}
                            <Button onClick={() => { fetchOverdue(); fetchReminders(); }} variant="outline" size="icon" className="rounded-xl">
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Overdue List */}
                    <div className="lg:col-span-2 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Overdue Parties ({overdueContacts.length})</h3>
                        </div>

                        {loading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>
                            : overdueContacts.length === 0 ? (
                                <div className="bg-white rounded-[28px] border border-slate-200 p-16 text-center">
                                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-300 mb-4" />
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No overdue payments! 🎉</p>
                                </div>
                            ) : overdueContacts.map((c: any) => {
                                const isSelected = previewing === c.contact.id;
                                const daysOld = Math.max(...c.sales.map((s: any) => {
                                    return Math.round((Date.now() - new Date(s.sale_date).getTime()) / 86400000);
                                }));
                                return (
                                    <div key={c.contact.id} className={cn(
                                        "bg-white rounded-2xl border shadow-sm p-5 transition-all",
                                        isSelected ? "border-green-300 ring-2 ring-green-100" : "border-slate-200"
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-slate-800">{c.contact.name}</p>
                                                <p className="text-xs font-bold text-slate-400 mt-0.5">{c.contact.phone} · {c.sales.length} invoice(s)</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-[1000] text-rose-600 tracking-tighter">₹{c.total.toLocaleString("en-IN")}</p>
                                                <p className={cn("text-[10px] font-black uppercase",
                                                    daysOld > 60 ? "text-red-500" : daysOld > 30 ? "text-amber-500" : "text-slate-400")}>
                                                    {daysOld}d overdue
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <Button onClick={() => getPreview(c.contact.id)}
                                                size="sm"
                                                className="bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black gap-2 h-9">
                                                <MessageCircle className="w-3.5 h-3.5" /> Preview WhatsApp
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Preview Panel */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message Preview</h3>
                        {preview ? (
                            <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-6 space-y-4">
                                <div className="bg-[#075e54] text-white text-xs font-bold px-3 py-2 rounded-t-2xl flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-400" /> WhatsApp Preview
                                </div>
                                <div className="bg-[#dcf8c6] rounded-2xl rounded-tl-none p-4 text-sm font-bold text-slate-800 whitespace-pre-line leading-relaxed">
                                    {preview.message}
                                </div>
                                <div className="space-y-2 text-xs font-bold text-slate-400">
                                    <p>📱 Sending to: +91 {preview.phone}</p>
                                    <p>💰 Total Due: ₹{Number(preview.total_due || 0).toLocaleString("en-IN")}</p>
                                    {preview.oldest_invoice && <p>📅 Oldest: {format(new Date(preview.oldest_invoice), "dd MMM yyyy")}</p>}
                                </div>
                                <Button onClick={sendReminder}
                                    className="w-full bg-green-500 hover:bg-green-600 text-white rounded-xl font-black gap-2">
                                    <Send className="w-4 h-4" /> Open WhatsApp & Send
                                </Button>
                                <Button onClick={() => { setPreviewing(null); setPreview(null); }} variant="outline" className="w-full rounded-xl text-xs">
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <div className="bg-white rounded-[28px] border border-slate-200 p-12 text-center">
                                <MessageCircle className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                                <p className="text-slate-400 font-bold text-xs">Select a party to preview their reminder message</p>
                            </div>
                        )}

                        {/* Recent Reminders */}
                        {reminders.length > 0 && (
                            <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm p-5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                                    Sent ({reminders.length})
                                </p>
                                <div className="space-y-2">
                                    {reminders.slice(0, 6).map(r => (
                                        <div key={r.id} className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-700">{r.contact?.name}</span>
                                            <span className="font-mono text-slate-400">{format(new Date(r.sent_at), "dd MMM")}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
