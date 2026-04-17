'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Phone, Mail, MapPin, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type ContactSettings = {
    id?: string;
    company_name: string;
    tagline: string;
    phone: string;
    whatsapp: string;
    email_support: string;
    email_sales: string;
    email_legal: string;
    playstore_app_link: string;
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

const EMPTY: ContactSettings = {
    company_name: '', tagline: '', phone: '', whatsapp: '',
    email_support: '', email_sales: '', email_legal: '', playstore_app_link: '',
    address_line1: '', address_line2: '', city: '', state: '',
    pincode: '', country: 'India', gstin: '', cin: '', support_hours: '',
};

export default function AdminContactInfoPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<ContactSettings>(EMPTY);

    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .schema('core')
                .from('site_contact_settings')
                .select('*')
                .maybeSingle();
            if (error) {
                toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
            } else if (data) {
                setForm(data as ContactSettings);
            }
            setLoading(false);
        })();
    }, [toast]);

    const setField = <K extends keyof ContactSettings>(key: K, value: ContactSettings[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        if (!form.id) {
            toast({ title: 'No row to update', description: 'Run migration first.', variant: 'destructive' });
            return;
        }
        setSaving(true);
        const { id, ...rest } = form;
        const { error } = await supabase
            .schema('core')
            .from('site_contact_settings')
            .update({ ...rest, updated_at: new Date().toISOString() })
            .eq('id', id);
        setSaving(false);
        if (error) {
            toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: '✅ Saved', description: 'Public /contact page will reflect changes immediately.' });
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading contact settings…
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-5xl">
            <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-[0.2em] uppercase mb-1">Contact Info</h1>
                <p className="text-slate-500 text-sm font-medium">
                    Controls the company details shown on the public{' '}
                    <a href="/contact" target="_blank" rel="noreferrer" className="text-emerald-700 font-bold underline">
                        /contact
                    </a>{' '}
                    page. Changes are live instantly.
                </p>
            </div>

            {/* Company */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Building2 className="w-5 h-5 text-emerald-600" /> Company
                    </CardTitle>
                    <CardDescription>Legal entity details & tagline.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Company Name" value={form.company_name} onChange={(v) => setField('company_name', v)} />
                    <Field label="Tagline" value={form.tagline} onChange={(v) => setField('tagline', v)} />
                    <Field label="GSTIN" value={form.gstin} onChange={(v) => setField('gstin', v)} />
                    <Field label="CIN" value={form.cin} onChange={(v) => setField('cin', v)} />
                </CardContent>
            </Card>

            {/* Phone */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Phone className="w-5 h-5 text-emerald-600" /> Phone & WhatsApp
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Phone" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+91 …" />
                    <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setField('whatsapp', v)} placeholder="+91 …" />
                    <Field label="Support Hours" value={form.support_hours} onChange={(v) => setField('support_hours', v)} />
                </CardContent>
            </Card>

            {/* Email & Links */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Mail className="w-5 h-5 text-emerald-600" /> Email & App Links
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    <Field label="Support Email" value={form.email_support} onChange={(v) => setField('email_support', v)} type="email" />
                    <Field label="Sales Email" value={form.email_sales} onChange={(v) => setField('email_sales', v)} type="email" />
                    <Field label="Legal Email" value={form.email_legal} onChange={(v) => setField('email_legal', v)} type="email" />
                    <Field label="Playstore Link" value={form.playstore_app_link} onChange={(v) => setField('playstore_app_link', v)} placeholder="https://play.google.com/..." />
                </CardContent>
            </Card>

            {/* Address */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <MapPin className="w-5 h-5 text-emerald-600" /> Registered Office
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Address Line 1" value={form.address_line1} onChange={(v) => setField('address_line1', v)} />
                    <Field label="Address Line 2" value={form.address_line2} onChange={(v) => setField('address_line2', v)} />
                    <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
                    <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
                    <Field label="Pincode" value={form.pincode} onChange={(v) => setField('pincode', v)} />
                    <Field label="Country" value={form.country} onChange={(v) => setField('country', v)} />
                </CardContent>
            </Card>

            <div className="flex justify-end sticky bottom-4">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="h-14 px-8 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-black text-base shadow-lg shadow-emerald-200"
                >
                    {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}

function Field({
    label, value, onChange, type = 'text', placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-slate-500 tracking-widest">{label}</Label>
            <Input
                type={type}
                value={value ?? ''}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="h-12 bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-500 rounded-xl font-medium"
            />
        </div>
    );
}
