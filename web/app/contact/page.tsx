'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Mail, Phone, MessageSquare, Send, CheckCircle2, Loader2,
    MapPin, Smartphone, Sparkles, ArrowRight, Building2, Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type ContactSettings = {
    company_name: string;
    tagline: string;
    phone: string;
    whatsapp: string;
    email_support: string;
    email_sales: string;
    email_legal: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gstin: string;
    cin: string;
    support_hours: string;
};

const FALLBACK: ContactSettings = {
    company_name: 'MINDT Private Limited',
    tagline: "India's #1 Mandi ERP for fruits & vegetable traders",
    phone: '+91 82609 21301',
    whatsapp: '+91 82609 21301',
    email_support: 'support@mandigrow.com',
    email_sales: 'sales@mandigrow.com',
    email_legal: 'legal@mandigrow.com',
    address_line1: '',
    address_line2: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '',
    country: 'India',
    gstin: '',
    cin: '',
    support_hours: 'Mon–Sat, 9:00 AM – 8:00 PM IST',
};

const digits = (s: string) => (s || '').replace(/\D+/g, '');

export default function ContactPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [info, setInfo] = useState<ContactSettings>(FALLBACK);

    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .schema('core')
                .from('site_contact_settings')
                .select('*')
                .maybeSingle();
            if (data) setInfo({ ...FALLBACK, ...(data as ContactSettings) });
        })();
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            subject: formData.get('subject'),
            message: formData.get('message'),
        };
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || 'Submission failed');
            setSubmitted(true);
            toast({ title: 'Message Sent!', description: "We've received your request and will contact you shortly." });
        } catch (err: any) {
            toast({ title: 'Error', description: err?.message || 'Failed to send message. Please try again.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const addressLines = [info.address_line1, info.address_line2, [info.city, info.state, info.pincode].filter(Boolean).join(', '), info.country]
        .filter(Boolean);

    return (
        <div className="min-h-screen bg-[#dce7c8] text-gray-900 font-sans overflow-x-hidden">
            {/* Header */}
            <div className="fixed top-0 w-full z-50 flex flex-col">
                <div className="bg-emerald-900 text-emerald-50 text-[10px] sm:text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-2 tracking-wide w-full border-b border-emerald-800/50 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                    <span>MandiGrow — Live</span>
                </div>
                <nav className="w-full border-b border-[#c8d6b0] bg-[#dce7c8]/90 backdrop-blur-md relative">
                    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-emerald-700 flex items-center justify-center text-white font-black text-xl">M</div>
                            <span className="text-xl font-bold tracking-tighter text-gray-900">MandiGrow</span>
                        </Link>
                        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-700">
                            <Link href="/#features" className="hover:text-emerald-800 transition-colors">Features</Link>
                            <Link href="/#solutions" className="hover:text-emerald-800 transition-colors">Solutions</Link>
                            <Link href="/subscribe" className="hover:text-emerald-800 transition-colors font-bold text-emerald-800">Subscription &amp; Billing</Link>
                            <Link href="/#compliance" className="hover:text-emerald-800 transition-colors">Compliance</Link>
                        </div>
                        <div className="flex items-center gap-4">
                            <Link href="/login" className="text-sm font-bold text-gray-700 hover:text-emerald-800 transition-colors">Sign In</Link>
                            <Link href="/login" className="hidden md:flex items-center gap-2 bg-emerald-700 text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-emerald-800 transition-all hover:scale-105">
                                Get Started Free <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                </nav>
            </div>

            {submitted ? (
                <main className="pt-48 pb-20 px-6 max-w-xl mx-auto text-center">
                    <div className="w-24 h-24 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xl mb-8">
                        <CheckCircle2 className="w-12 h-12" />
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-3">Message Received!</h1>
                    <p className="text-gray-700 font-medium mb-8">
                        Thank you for reaching out. A MandiGrow specialist will contact you within the next 24 business hours.
                    </p>
                    <Link href="/" className="inline-flex items-center gap-2 bg-emerald-700 text-white px-6 py-4 rounded-full font-black text-base hover:bg-emerald-800 transition-all">
                        Back to Home <ArrowRight className="w-4 h-4" />
                    </Link>
                </main>
            ) : (
                <main className="relative pt-40 pb-16 px-6 max-w-7xl mx-auto">
                    <div className="text-center mb-12">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-white/60 text-xs font-bold text-emerald-800 mb-6 backdrop-blur-sm shadow-sm">
                            Get in Touch
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-gray-900 mb-4">
                            Let's grow your <span className="text-emerald-700">mandi</span> business.
                        </h1>
                        <p className="text-lg text-gray-700 font-medium max-w-2xl mx-auto">{info.tagline}</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                        {/* Contact info card */}
                        <div className="lg:col-span-2 space-y-5">
                            <div className="bg-white border border-emerald-100 rounded-[32px] p-8 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <Building2 className="w-5 h-5 text-emerald-700" />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900">{info.company_name}</h3>
                                </div>

                                <div className="space-y-5 text-sm">
                                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone">
                                        <a href={`tel:${digits(info.phone)}`} className="font-bold text-gray-900 hover:text-emerald-700">{info.phone}</a>
                                    </InfoRow>
                                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Support">
                                        <a href={`mailto:${info.email_support}`} className="font-bold text-gray-900 hover:text-emerald-700 break-all">{info.email_support}</a>
                                    </InfoRow>
                                    <InfoRow icon={<Mail className="w-4 h-4" />} label="Sales">
                                        <a href={`mailto:${info.email_sales}`} className="font-bold text-gray-900 hover:text-emerald-700 break-all">{info.email_sales}</a>
                                    </InfoRow>
                                    {addressLines.length > 0 && (
                                        <InfoRow icon={<MapPin className="w-4 h-4" />} label="Office">
                                            <div className="font-bold text-gray-900 leading-relaxed">
                                                {addressLines.map((l, i) => <div key={i}>{l}</div>)}
                                            </div>
                                        </InfoRow>
                                    )}
                                    <InfoRow icon={<Clock className="w-4 h-4" />} label="Hours">
                                        <span className="font-bold text-gray-900">{info.support_hours}</span>
                                    </InfoRow>
                                    {(info.gstin || info.cin) && (
                                        <div className="pt-4 border-t border-emerald-100 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                            {info.gstin && <span>GSTIN: <span className="text-gray-800">{info.gstin}</span></span>}
                                            {info.cin && <span>CIN: <span className="text-gray-800">{info.cin}</span></span>}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* WhatsApp CTA */}
                            <a
                                href={`https://wa.me/${digits(info.whatsapp)}?text=Hi%2C%20I'm%20interested%20in%20MandiGrow%20Enterprise`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block bg-emerald-950 text-white rounded-[32px] p-8 shadow-2xl hover:bg-emerald-900 transition-colors relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-700/20 rounded-full -mr-32 -mt-32 blur-3xl" />
                                <div className="relative z-10">
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                                            <Smartphone className="w-5 h-5 text-white" />
                                        </div>
                                        <h3 className="text-xl font-black">Direct WhatsApp</h3>
                                    </div>
                                    <p className="text-emerald-100/80 font-medium text-sm mb-4">
                                        Need instant help? Message our team on WhatsApp.
                                    </p>
                                    <span className="inline-flex items-center gap-2 bg-white text-emerald-950 px-5 py-3 rounded-xl font-black text-xs">
                                        <MessageSquare className="w-4 h-4 fill-emerald-950" /> Chat Now
                                    </span>
                                </div>
                            </a>
                        </div>

                        {/* Form */}
                        <div className="lg:col-span-3 bg-white border border-emerald-100 rounded-[32px] p-8 md:p-12 shadow-sm">
                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <FormField label="Full Name" name="name" required placeholder="Abhinav Singh" />
                                    <FormField label="Work Email" name="email" type="email" required placeholder="abhinav@mandi.com" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <FormField label="Phone Number" name="phone" placeholder="+91 00000 00000" />
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">Interest</Label>
                                        <select name="subject" className="w-full h-14 bg-slate-50 border border-transparent focus:bg-white focus:border-emerald-500 rounded-2xl px-6 font-bold text-sm outline-none">
                                            <option value="Enterprise Demo">Enterprise Demo</option>
                                            <option value="Pricing Query">Pricing Query</option>
                                            <option value="Partnership">Partnership</option>
                                            <option value="Implementation">ERP Implementation</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">How can we help?</Label>
                                    <Textarea name="message" required placeholder="Tell us about your mandi operation…"
                                        className="min-h-[160px] bg-slate-50 border-transparent focus:bg-white focus:border-emerald-500 rounded-3xl p-6 font-medium resize-none" />
                                </div>
                                <Button type="submit" disabled={loading}
                                    className="w-full h-16 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 flex items-center justify-center gap-3">
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Message <Send className="w-5 h-5" /></>}
                                </Button>
                                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-1">
                                    Secure submission • 24h response guaranteed
                                </p>
                            </form>
                        </div>
                    </div>
                </main>
            )}

            {/* Footer */}
            <footer className="border-t border-[#c8d6b0] py-12 px-6 bg-[#dce7c8]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-200 flex items-center justify-center text-emerald-800 font-bold text-sm">M</div>
                        <span className="font-bold text-emerald-800">© 2026 {info.company_name}</span>
                    </div>
                    <div className="flex gap-6 text-sm font-medium text-emerald-700 flex-wrap justify-center">
                        <Link href="/mandi-billing" className="hover:text-emerald-900 transition-colors">Mandi Billing</Link>
                        <Link href="/commission-agent-software" className="hover:text-emerald-900 transition-colors">Commission Agent</Link>
                        <Link href="/mandi-khata-software" className="hover:text-emerald-900 transition-colors">Mandi Khata</Link>
                        <Link href="/blog" className="hover:text-emerald-900 transition-colors">Blog</Link>
                        <Link href="/faq" className="hover:text-emerald-900 transition-colors">FAQ</Link>
                        <Link href="/privacy" className="hover:text-emerald-900 transition-colors">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-emerald-900 transition-colors">Terms of Service</Link>
                        <Link href="/contact" className="hover:text-emerald-900 transition-colors">Contact</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
                {children}
            </div>
        </div>
    );
}

function FormField({ label, name, type = 'text', required, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="text-xs font-black uppercase text-slate-500 tracking-widest ml-1">{label}</Label>
            <Input id={name} name={name} type={type} required={required} placeholder={placeholder}
                className="h-14 bg-slate-50 border-transparent focus:bg-white focus:border-emerald-500 rounded-2xl px-6 font-bold" />
        </div>
    );
}
