'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QrCode, Landmark, Save, Loader2, CheckSquare, Square, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { QRCodeSVG } from 'qrcode.react'

import { useToast } from '@/hooks/use-toast'

interface PaymentSettings {
    upi_id: string
    upi_name: string
    bank_name: string
    account_number: string
    ifsc_code: string
    account_holder: string
    print_upi_qr: boolean
    print_bank_details: boolean
    text_bank_id?: string
    qr_bank_id?: string
}

const defaultSettings: PaymentSettings = {
    upi_id: '',
    upi_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    account_holder: '',
    print_upi_qr: false,
    print_bank_details: false,
    text_bank_id: '',
    qr_bank_id: ''
}

export default function PaymentDetailsSettings() {
    const { profile } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [payment, setPayment] = useState<PaymentSettings>(defaultSettings)
    const [showPreview, setShowPreview] = useState(false)
    const [bankAccounts, setBankAccounts] = useState<any[]>([])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchSettings()
            fetchBankAccounts()
        }
    }, [profile])

    const fetchBankAccounts = async () => {
        const { data } = await supabase
            .schema('mandi')
            .from('accounts')
            .select('id, name, description, is_default, code')
            .eq('organization_id', profile?.organization_id)
            .eq('account_sub_type', 'bank')
            .eq('type', 'asset')
            .eq('is_active', true)
        if (data) setBankAccounts(data)
    }

    const fetchSettings = async () => {
        setLoading(true)
        const { data } = await supabase
            .schema('core')
            .from('organizations')
            .select('settings')
            .eq('id', profile?.organization_id)
            .single()

        if (data?.settings?.payment) {
            setPayment({ ...defaultSettings, ...data.settings.payment })
        }
        setLoading(false)
    }

    // Auto-sync UPI ID if bank ID is set but UPI is missing in settings
    useEffect(() => {
        if (!loading && bankAccounts.length > 0 && payment.qr_bank_id && !payment.upi_id) {
            const acc = bankAccounts.find(a => a.id === payment.qr_bank_id)
            if (acc) {
                const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                if (meta.upi_id) {
                    setPayment(prev => ({ ...prev, upi_id: meta.upi_id }))
                }
            }
        }
        // Also sync bank details if missing
        if (!loading && bankAccounts.length > 0 && payment.text_bank_id && !payment.account_number) {
            const acc = bankAccounts.find(a => a.id === payment.text_bank_id)
            if (acc) {
                const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                if (meta.account_number) {
                    setPayment(prev => ({
                        ...prev,
                        bank_name: meta.bank_name || prev.bank_name,
                        account_number: meta.account_number,
                        ifsc_code: meta.ifsc_code || prev.ifsc_code,
                        account_holder: meta.account_name || acc.name || prev.account_holder
                    }))
                }
            }
        }
    }, [loading, bankAccounts, payment.qr_bank_id, payment.text_bank_id])

    const handleSave = async () => {
        setSaving(true)
        // First get existing settings to merge
        const { data: existing } = await supabase
            .schema('core')
            .from('organizations')
            .select('settings')
            .eq('id', profile?.organization_id)
            .single()

        const mergedSettings = { ...(existing?.settings || {}), payment }

        const { error } = await supabase
            .schema('core')
            .from('organizations')
            .update({ settings: mergedSettings })
            .eq('id', profile?.organization_id)

        if (error) {
            toast({
                title: "Error Saving",
                description: error.message,
                variant: "destructive"
            })
        } else {
            toast({
                title: "Settings Saved",
                description: "Payment details have been updated successfully.",
            })
        }
        setSaving(false)
    }

    const upiLink = payment.upi_id
        ? `upi://pay?pa=${payment.upi_id}&pn=${encodeURIComponent(payment.upi_name || '')}&cu=INR`
        : ''

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500 w-6 h-6" /></div>

    return (
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-[24px]">
            <CardHeader className="bg-gradient-to-r from-violet-50 to-blue-50 border-b border-slate-100 py-4">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-black flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-violet-600" /> Payment Details & QR Code
                </CardTitle>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                    Add your UPI or bank details to print on invoices automatically.
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-8">

                {/* Print Text Details Section */}
                <div className="space-y-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl transition-all">
                    <button
                        type="button"
                        onClick={() => setPayment({ ...payment, print_bank_details: !payment.print_bank_details })}
                        className="flex items-center gap-3 w-full text-left group"
                    >
                        {payment.print_bank_details
                            ? <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            : <Square className="w-5 h-5 text-slate-300 flex-shrink-0 group-hover:text-slate-400" />
                        }
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-black">Print Bank Account Details on Invoices</span>
                            <span className="text-[10px] text-slate-500 font-bold tracking-wide mt-0.5">Show Account No, IFSC, etc.</span>
                        </div>
                    </button>

                    {payment.print_bank_details && (
                        <div className="space-y-4 pt-3 border-t border-slate-200 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-slate-700 block">Source Bank for Details</Label>
                                <select 
                                    className="w-full bg-white border border-slate-200 font-bold text-slate-800 h-10 px-3 rounded-xl shadow-sm focus:border-blue-500 outline-none"
                                    value={payment.text_bank_id || ""}
                                    onChange={(e) => {
                                        const acc = bankAccounts.find(a => a.id === e.target.value)
                                        if (acc) {
                                            const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                                            setPayment(prev => ({
                                                ...prev,
                                                text_bank_id: acc.id,
                                                bank_name: meta.bank_name || '',
                                                account_number: meta.account_number || '',
                                                ifsc_code: meta.ifsc_code || '',
                                                account_holder: meta.account_name || acc.name || '',
                                            }))
                                        } else {
                                            setPayment(prev => ({ ...prev, text_bank_id: '', bank_name: '', account_number: '', ifsc_code: '', account_holder: '' }))
                                        }
                                    }}
                                >
                                    <option value="" disabled>-- Select Bank --</option>
                                    {bankAccounts.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} {b.is_default ? '(Default)' : ''}</option>
                                    ))}
                                </select>
                                {payment.text_bank_id && (!payment.account_number || !payment.bank_name) && (
                                    <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1 animate-pulse">⚠️ Missing Account No or Bank Name in Master Data.</p>
                                )}
                            </div>

                            {payment.text_bank_id && payment.account_number && (
                                <div className="p-4 bg-white border border-slate-200 shadow-sm rounded-xl">
                                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3"><div className="w-4 h-px bg-slate-200" /> Preview Details</div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bank Name</p>
                                            <p className="font-bold text-slate-800 break-words">{payment.bank_name || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Account Holder</p>
                                            <p className="font-bold text-slate-800 break-words">{payment.account_holder || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">A/C Number</p>
                                            <p className="font-mono font-black text-slate-800">{payment.account_number || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IFSC Code</p>
                                            <p className="font-mono font-black text-slate-800">{payment.ifsc_code || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Print QR Code Section */}
                <div className="space-y-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl transition-all">
                    <button
                        type="button"
                        onClick={() => setPayment({ ...payment, print_upi_qr: !payment.print_upi_qr })}
                        className="flex items-center gap-3 w-full text-left group"
                    >
                        {payment.print_upi_qr
                            ? <CheckSquare className="w-5 h-5 text-violet-600 flex-shrink-0" />
                            : <Square className="w-5 h-5 text-slate-300 flex-shrink-0 group-hover:text-slate-400" />
                        }
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-black">Print UPI QR Code on Invoices</span>
                            <span className="text-[10px] text-slate-500 font-bold tracking-wide mt-0.5">Show Scan-to-Pay QR Code</span>
                        </div>
                    </button>

                    {payment.print_upi_qr && (
                        <div className="space-y-4 pt-3 border-t border-slate-200 animate-in fade-in slide-in-from-top-2">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-slate-700 block">Source Bank for UPI</Label>
                                <select 
                                    className="w-full bg-white border border-slate-200 font-bold text-slate-800 h-10 px-3 rounded-xl shadow-sm focus:border-violet-500 outline-none"
                                    value={payment.qr_bank_id || ""}
                                    onChange={(e) => {
                                        const acc = bankAccounts.find(a => a.id === e.target.value)
                                        if (acc) {
                                            const meta = acc.description?.startsWith('{') ? JSON.parse(acc.description) : {}
                                            setPayment(prev => ({
                                                ...prev,
                                                qr_bank_id: acc.id,
                                                upi_id: meta.upi_id || ''
                                            }))
                                        } else {
                                            setPayment(prev => ({ ...prev, qr_bank_id: '', upi_id: '' }))
                                        }
                                    }}
                                >
                                    <option value="" disabled>-- Select Bank --</option>
                                    {bankAccounts.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} {b.is_default ? '(Default)' : ''}</option>
                                    ))}
                                </select>
                                {payment.qr_bank_id && !payment.upi_id && (
                                    <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1 animate-pulse">⚠️ This bank has no UPI ID configured in Master Data.</p>
                                )}
                            </div>

                            {payment.qr_bank_id && payment.upi_id && (
                                <div className="p-4 bg-white border border-slate-200 shadow-sm rounded-xl flex gap-5 items-center">
                                    <div className="p-2 bg-white rounded-xl shadow-sm border border-violet-100 shrink-0">
                                        <QRCodeSVG
                                            value={upiLink}
                                            size={80}
                                            bgColor="#ffffff"
                                            fgColor="#1e1b4b"
                                            level="M"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest flex items-center gap-1 mb-1"><QrCode className="w-3 h-3"/> Connected UPI</p>
                                        <p className="font-mono font-bold text-violet-900 text-[13px] truncate" title={payment.upi_id}>{payment.upi_id}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase tracking-widest h-12 rounded-xl shadow-md"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Save Payment Details</>}
                </Button>
            </CardContent>
        </Card>
    )
}
