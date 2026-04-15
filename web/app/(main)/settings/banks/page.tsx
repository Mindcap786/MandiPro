'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Landmark, Plus, Pencil, Trash2, Loader2, IndianRupee, CreditCard, CheckCircle2, Star, ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const defaultForm = {
    name: '',
    description: '',
    account_number: '',
    ifsc_code: '',
    upi_id: '',
    opening_balance: ''
}

export default function BanksPage() {
    const { profile } = useAuth()
    const schema = 'mandi';
    const { toast } = useToast()
    const [banks, setBanks] = useState<any[]>([])
    const [cashAccounts, setCashAccounts] = useState<any[]>([])
    const [balances, setBalances] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [transferDialogOpen, setTransferDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [settingDefault, setSettingDefault] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [form, setForm] = useState({ ...defaultForm })
    const [transferForm, setTransferForm] = useState({ from_id: '', to_id: '', amount: '', remarks: '' })
    const [transferring, setTransferring] = useState(false)

    // Adjustment State
    const [adjDialogOpen, setAdjDialogOpen] = useState(false)
    const [adjType, setAdjType] = useState<'deposit' | 'withdraw'>('deposit')
    const [adjForm, setAdjForm] = useState({ amount: '', description: '', date: new Date().toISOString().split('T')[0] })
    const [adjusting, setAdjusting] = useState(false)
    const [selectedAccount, setSelectedAccount] = useState<any>(null)

    useEffect(() => {
        if (profile?.organization_id) fetchBanks()
    }, [profile])

    const fetchBanks = async () => {
        setLoading(true)
        const { data: allAccounts, error } = await supabase
            .schema(schema)
            .from('accounts')
            .select('*')
            .eq('organization_id', profile!.organization_id)
            .eq('type', 'asset')
            .eq('is_active', true)
            .or("account_sub_type.eq.bank,account_sub_type.eq.cash,name.ilike.%bank%,name.ilike.%cash%")
            .order('name')

        if (error) {
            console.error("Error fetching liquid accounts:", error)
            setLoading(false)
            return
        }

        // Robust regex to exclude transit and cheques in hand accounts
        const transitRegex = /(transit|cheques?\s*in\s*hand)/i;
        const filtered = (allAccounts || []).filter(a => !transitRegex.test(a.name))

        const bankList = filtered.filter(a => a.account_sub_type === 'bank' || a.name.toLowerCase().includes('bank'))
        const cashList = filtered.filter(a => a.account_sub_type === 'cash' || a.name.toLowerCase().includes('cash'))

        setBanks(bankList)
        setCashAccounts(cashList)
        await fetchBalances([...bankList, ...cashList])
        setLoading(false)
    }

    const fetchBalances = async (accountList: any[]) => {
        if (!accountList.length) {
            setBalances({})
            return
        }
        const ids = accountList.map(b => b.id)
        const { data } = await supabase
            .schema(schema)
            .from('ledger_entries')
            .select('account_id, debit, credit')
            .in('account_id', ids)
            .eq('organization_id', profile!.organization_id)

        const map: Record<string, number> = {}
        ids.forEach(id => { map[id] = 0 })
        ;(data || []).forEach((e: any) => {
            map[e.account_id] = (map[e.account_id] || 0) + (Number(e.debit) - Number(e.credit))
        })

        // Add opening balance
        accountList.forEach(b => {
            map[b.id] = (map[b.id] || 0) + Number(b.opening_balance || 0)
        })

        setBalances(map)
    }

    const setDefaultBank = async (bankId: string) => {
        setSettingDefault(bankId)
        // Remove default from all banks
        await supabase.schema(schema).from('accounts')
            .update({ is_default: false })
            .eq('organization_id', profile!.organization_id)
            .eq('account_sub_type', 'bank')
        // Set new default
        const { error } = await supabase.schema(schema).from('accounts')
            .update({ is_default: true })
            .eq('id', bankId)

        if (error) {
            toast({ title: 'Error setting default bank', description: error.message, variant: 'destructive' })
        } else {
            toast({ title: 'Default bank updated', description: 'Payments will now use this bank by default.' })
            fetchBanks()
        }
        setSettingDefault(null)
    }

    const handleAdjustment = async () => {
        if (!adjForm.amount || !adjForm.description.trim()) {
            toast({ title: 'Fill all required fields', description: 'Amount and description are mandatory.', variant: 'destructive' })
            return
        }
        const amt = parseFloat(adjForm.amount)
        if (isNaN(amt) || amt <= 0) {
            toast({ title: 'Invalid amount', variant: 'destructive' })
            return
        }

        setAdjusting(true)
        const { error } = await supabase.schema(schema).rpc('adjust_liquid_balance', {
            p_organization_id: profile!.organization_id,
            p_account_id: selectedAccount.id,
            p_amount: amt,
            p_adjustment_type: adjType,
            p_description: adjForm.description.trim(),
            p_date: adjForm.date
        })

        if (error) {
            toast({ title: 'Adjustment failed', description: error.message, variant: 'destructive' })
        } else {
            toast({ 
                title: `✅ ${adjType === 'deposit' ? 'Deposit' : 'Withdrawal'} Successful`, 
                description: `₹${amt.toLocaleString('en-IN')} updated for ${selectedAccount.name}.` 
            })
            setAdjDialogOpen(false)
            setAdjForm({ amount: '', description: '', date: new Date().toISOString().split('T')[0] })
            fetchBanks()
        }
        setAdjusting(false)
    }

    const openAdjustDialog = (account?: any, type: 'deposit' | 'withdraw' = 'deposit') => {
        setSelectedAccount(account || (transferAccounts.length > 0 ? transferAccounts[0] : null))
        setAdjType(type)
        setAdjDialogOpen(true)
    }

    const handleTransfer = async () => {
        if (!transferForm.from_id || !transferForm.to_id || !transferForm.amount) {
            toast({ title: 'Fill all fields', variant: 'destructive' })
            return
        }
        if (transferForm.from_id === transferForm.to_id) {
            toast({ title: 'Cannot transfer to same account', variant: 'destructive' })
            return
        }
        const amt = parseFloat(transferForm.amount)
        if (isNaN(amt) || amt <= 0) {
            toast({ title: 'Enter a valid amount', variant: 'destructive' })
            return
        }
        setTransferring(true)
        const { error } = await supabase.schema(schema).rpc('transfer_liquid_funds', {
            p_organization_id: profile!.organization_id,
            p_from_account_id: transferForm.from_id,
            p_to_account_id: transferForm.to_id,
            p_amount: amt,
            p_remarks: transferForm.remarks || 'Cash/Bank Transfer',
            p_transfer_date: new Date().toISOString()
        })

        if (error) {
            toast({ title: 'Transfer failed', description: error.message, variant: 'destructive' })
        } else {
            toast({ title: '✅ Transfer Successful', description: `₹${amt.toLocaleString('en-IN')} moved between accounts.` })
            setTransferDialogOpen(false)
            setTransferForm({ from_id: '', to_id: '', amount: '', remarks: '' })
            fetchBanks()
        }
        setTransferring(false)
    }

    const openAdd = () => {
        setEditingId(null)
        setForm({ ...defaultForm })
        setDialogOpen(true)
    }

    const openEdit = (bank: any) => {
        setEditingId(bank.id)
        const meta = bank.description ? JSON.parse(bank.description.startsWith('{') ? bank.description : '{}') : {}
        setForm({
            name: bank.name || '',
            description: meta.bank_name || '',
            account_number: meta.account_number || '',
            ifsc_code: meta.ifsc_code || '',
            upi_id: meta.upi_id || '',
            opening_balance: bank.opening_balance?.toString() || ''
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!form.name.trim()) { toast({ title: 'Bank name required', variant: 'destructive' }); return }
        setSaving(true)

        const meta = JSON.stringify({
            bank_name: form.description,
            account_number: form.account_number,
            ifsc_code: form.ifsc_code,
            upi_id: form.upi_id
        })

        const isFirstBank = banks.length === 0 && !editingId
        const payload = {
            organization_id: profile!.organization_id,
            name: form.name.trim(),
            type: 'asset',
            account_sub_type: 'bank',
            description: meta,
            opening_balance: form.opening_balance ? parseFloat(form.opening_balance) : 0,
            is_active: true,
            is_default: isFirstBank, // First bank added becomes default automatically
        }

        let error: any

        if (editingId) {
            ;({ error } = await supabase.schema(schema).from('accounts').update({ ...payload, organization_id: undefined, is_default: undefined }).eq('id', editingId))
        } else {
            const { error: insErr } = await supabase
                .schema(schema)
                .from('accounts')
                .insert(payload)
            error = insErr
        }

        if (error) {
            toast({ title: 'Error saving bank', description: error.message, variant: 'destructive' })
        } else {
            toast({ title: editingId ? 'Bank updated!' : 'Bank account added!' })
            setDialogOpen(false)
            fetchBanks()
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase.schema(schema).from('accounts').delete().eq('id', id).eq('is_system_account', false)
        if (error) toast({ title: 'Cannot delete', description: error.message, variant: 'destructive' })
        else { toast({ title: 'Bank removed' }); fetchBanks() }
        setDeleteId(null)
    }

    const totalBalance = banks.reduce((sum, bank) => sum + (balances[bank.id] || 0), 0)
    const transferAccounts = [...cashAccounts, ...banks]
    const hasMultipleBanks = banks.length > 1
    const hasTransferAccounts = transferAccounts.length > 1
    const hasNegativeBank = banks.some(b => (balances[b.id] || 0) < 0)

    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50/50 rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none"></div>
                    <div className="relative z-10">
                        <h1 className="text-4xl font-[1000] text-slate-800 tracking-tighter uppercase leading-none">
                            Liquid Assets
                        </h1>
                        <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest mt-2 flex items-center gap-2">
                            <Landmark className="w-3.5 h-3.5 text-blue-500" />
                            Banks & Cash Management
                        </p>
                    </div>

                    <div className="flex gap-1.5 p-1.5 bg-slate-100 rounded-[22px] border border-slate-200 shadow-inner relative z-10">
                        <button 
                            onClick={() => openAdjustDialog()} 
                            className="h-11 px-6 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all bg-emerald-600 text-white shadow-md shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Deposit / Withdraw
                        </button>
                        {hasTransferAccounts && (
                            <button 
                                onClick={() => setTransferDialogOpen(true)} 
                                className="h-11 px-6 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-blue-600 hover:bg-white/60 flex items-center gap-2"
                            >
                                <ArrowLeftRight className="w-4 h-4" /> Transfer
                            </button>
                        )}
                        <button 
                            onClick={openAdd} 
                            className="h-11 px-6 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-blue-600 hover:bg-white/60 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Account
                        </button>
                    </div>
                </div>

                {/* Combined Balance & Cash in Hand Stats */}
                {!loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Combined Bank Balance</p>
                            <p className="text-4xl font-[1000] tracking-tighter mt-2">₹{totalBalance.toLocaleString('en-IN')}</p>
                            <div className="flex items-center gap-3 mt-3">
                                <p className="text-xs text-blue-200 font-bold">{banks.length} account{banks.length !== 1 ? 's' : ''}</p>
                                {hasNegativeBank && (
                                    <div className="flex items-center gap-1.5 bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md">
                                        <AlertTriangle className="w-3 h-3" />
                                        Balance Review Needed
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Cash in Hand</p>
                                    <p className={cn(
                                        "text-3xl font-[1000] tracking-tighter mt-1",
                                        cashAccounts.reduce((acc, c) => acc + (balances[c.id] || 0), 0) < 0 ? "text-rose-600" : "text-slate-800"
                                    )}>
                                        ₹{cashAccounts.reduce((acc, c) => acc + (balances[c.id] || 0), 0).toLocaleString('en-IN')}
                                    </p>
                                    {cashAccounts.length > 1 && (
                                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Across {cashAccounts.length} Cash Accounts</p>
                                    )}
                                </div>
                                <div className="bg-emerald-50 p-2.5 rounded-2xl">
                                    <IndianRupee className="w-5 h-5 text-emerald-600" />
                                </div>
                            </div>
                            <p className="text-[9px] text-slate-400 font-medium uppercase mt-2">Synced with Finance Dashboard</p>
                        </div>
                    </div>
                )}

                {/* Caution Banner */}
                {hasMultipleBanks && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black text-amber-700 text-sm">Multiple bank accounts detected</p>
                            <p className="text-amber-600 text-xs mt-1 font-medium">Ensure the combined bank balances match your overall financial summary. If payments were recorded to wrong banks, use the <strong>Adjust</strong> button on each bank to correct the balance. Use <strong>Transfer</strong> to move funds between banks.</p>
                        </div>
                    </div>
                )}

                {/* Bank List */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="flex justify-center p-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
                    ) : banks.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-sm">No banks added yet</p>
                            <p className="text-xs mt-1">Click "Add Bank" to get started. The first bank added becomes the default.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {banks.map(bank => {
                                const meta = bank.description?.startsWith('{') ? JSON.parse(bank.description) : {}
                                const bal = balances[bank.id] || 0
                                const isDefault = bank.is_default === true
                                const isMandi = true;
                                const isNegative = bal < 0
                                return (
                                    <div key={bank.id} className={cn(
                                        "flex items-center gap-4 px-6 py-5 hover:bg-slate-50 transition-colors group",
                                        isDefault && "bg-blue-50/50"
                                    )}>
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 relative",
                                            isDefault ? "bg-blue-100 border-2 border-blue-300" : "bg-slate-100 border border-slate-200"
                                        )}>
                                            <Landmark className={cn("w-5 h-5", isDefault ? "text-blue-600" : "text-slate-400")} />
                                            {isDefault && (
                                                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                                    <Star className="w-2.5 h-2.5 text-white fill-white" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-black text-sm">{bank.name}</p>
                                                {isDefault && (
                                                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full border border-blue-200">Default</span>
                                                )}
                                            </div>
                                            {meta.bank_name && <p className="text-xs text-slate-500 font-medium">{meta.bank_name}</p>}
                                            {meta.account_number && (
                                                <p className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-0.5">
                                                    <CreditCard className="w-3 h-3" /> ****{meta.account_number.slice(-4)}
                                                    {meta.ifsc_code && <><span className="ml-2 text-slate-300">|</span><span className="ml-2">{meta.ifsc_code}</span></>}
                                                    {meta.upi_id && <><span className="ml-2 text-slate-300">|</span><span className="ml-2">UPI: {meta.upi_id}</span></>}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className={cn(
                                                "text-xl font-[1000] tracking-tight",
                                                isNegative ? "text-red-500" : "text-blue-700"
                                            )}>
                                                {isNegative ? '-' : ''}₹{Math.abs(bal).toLocaleString('en-IN')}
                                            </p>
                                            {isNegative && (
                                                <div className="flex items-center gap-1 justify-end mt-0.5">
                                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                    <span className="text-[10px] text-amber-600 font-black uppercase tracking-widest">Needs Adjustment</span>
                                                </div>
                                            )}
                                            {bank.opening_balance > 0 && !isNegative && (
                                                <p className="text-[10px] text-slate-400 font-bold">OB: ₹{Number(bank.opening_balance).toLocaleString('en-IN')}</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 ml-4 flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!isDefault && (
                                                <button
                                                    onClick={() => setDefaultBank(bank.id)}
                                                    disabled={settingDefault === bank.id}
                                                    className="text-[9px] px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    {settingDefault === bank.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                                                    Set Default
                                                </button>
                                            )}
                                            <div className="flex gap-1">
                                                <button onClick={() => openEdit(bank)} className="p-2 rounded-xl hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                {!bank.is_system_account && (
                                                    <button onClick={() => setDeleteId(bank.id)} className="p-2 rounded-xl hover:bg-red-50 text-red-300 hover:text-red-500 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[480px] bg-white border-slate-200 text-black rounded-[32px] overflow-hidden shadow-2xl p-0">
                    <div className="bg-gradient-to-r from-blue-50 to-slate-50 p-8 pb-4 border-b border-slate-100">
                        <DialogHeader>
                            <DialogTitle className="text-3xl font-[1000] italic tracking-tighter text-black uppercase">
                                {editingId ? 'EDIT' : 'ADD'} <span className="text-blue-600">BANK</span>
                            </DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-8 pt-6 space-y-5">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Account Name / Label *</Label>
                            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. ICICI Current Account"
                                className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bank Name</Label>
                            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="e.g. ICICI Bank Ltd, Jaipur"
                                className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Account Number</Label>
                                <Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })}
                                    placeholder="XXXX XXXX 3531"
                                    className="bg-slate-50 border-slate-200 h-11 font-mono font-bold text-black rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">IFSC Code</Label>
                                <Input value={form.ifsc_code} onChange={e => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })}
                                    placeholder="ICIC0001234"
                                    className="bg-slate-50 border-slate-200 h-11 font-mono font-bold text-black rounded-xl uppercase" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">UPI ID</Label>
                            <Input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })}
                                placeholder="merchant@upi"
                                className="bg-slate-50 border-slate-200 h-11 font-mono font-bold text-black rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Opening Balance (₹) {editingId && <span className="text-amber-500 normal-case font-black ml-1">— locked for compliance; use Deposit/Withdraw for adjustments</span>}
                            </Label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input 
                                    value={form.opening_balance} 
                                    onChange={e => setForm({ ...form, opening_balance: e.target.value })}
                                    type="number" 
                                    placeholder="0.00"
                                    disabled={!!editingId}
                                    className="pl-9 bg-slate-50 border-slate-200 h-11 font-black text-blue-700 rounded-xl disabled:opacity-60" 
                                />
                            </div>
                        </div>

                        <Button onClick={handleSave} disabled={saving}
                            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black tracking-wider uppercase rounded-2xl shadow-md">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 mr-2" />{editingId ? 'UPDATE BANK' : 'ADD BANK ACCOUNT'}</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Bank Transfer Dialog */}
            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                <DialogContent className="sm:max-w-[420px] bg-white border-slate-200 text-black rounded-[28px] overflow-hidden shadow-2xl p-0">
                    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 pb-4 border-b border-slate-100">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-[1000] italic tracking-tighter text-black uppercase flex items-center gap-2">
                                <ArrowLeftRight className="w-6 h-6 text-blue-600" /> Bank <span className="text-blue-600">Transfer</span>
                            </DialogTitle>
                            <p className="text-slate-500 text-sm font-medium mt-1">Move funds between cash in hand and your bank accounts</p>
                        </DialogHeader>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">From Account</Label>
                            <Select value={transferForm.from_id} onValueChange={v => setTransferForm(f => ({ ...f, from_id: v }))}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl">
                                    <SelectValue placeholder="Select source bank..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                    {transferAccounts.map(b => (
                                        <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.to_id}>
                                            {b.name} — ₹{(balances[b.id] || 0).toLocaleString('en-IN')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">To Account</Label>
                            <Select value={transferForm.to_id} onValueChange={v => setTransferForm(f => ({ ...f, to_id: v }))}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl">
                                    <SelectValue placeholder="Select destination bank..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                    {transferAccounts.map(b => (
                                        <SelectItem key={b.id} value={b.id} disabled={b.id === transferForm.from_id}>
                                            {b.name} — ₹{(balances[b.id] || 0).toLocaleString('en-IN')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amount (₹)</Label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    type="number"
                                    value={transferForm.amount}
                                    onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                                    placeholder="0.00"
                                    className="pl-9 bg-slate-50 border-slate-200 h-12 font-black text-blue-700 rounded-xl text-lg"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Remarks (Optional)</Label>
                            <Input
                                value={transferForm.remarks}
                                onChange={e => setTransferForm(f => ({ ...f, remarks: e.target.value }))}
                                placeholder="e.g. Moving funds for vendor payment"
                                className="bg-slate-50 border-slate-200 h-11 font-medium text-black rounded-xl"
                            />
                        </div>
                        <Button onClick={handleTransfer} disabled={transferring}
                            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black tracking-wider uppercase rounded-2xl shadow-md mt-2">
                            {transferring ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowLeftRight className="w-5 h-5 mr-2" />Confirm Transfer</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Deposit/Withdraw Dialog */}
            <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
                <DialogContent className="sm:max-w-[420px] bg-white border-slate-200 text-black rounded-[32px] overflow-hidden shadow-2xl p-0">
                    <div className={cn(
                        "p-8 pb-4 border-b border-slate-100",
                        adjType === 'deposit' ? "bg-emerald-50/50" : "bg-orange-50/50"
                    )}>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-[1000] italic tracking-tighter text-black uppercase flex items-center gap-2">
                                {adjType === 'deposit' ? (
                                    <><CheckCircle2 className="w-6 h-6 text-emerald-600" /> DEPOSIT <span className="text-emerald-600">FUNDS</span></>
                                ) : (
                                    <><ArrowLeftRight className="w-6 h-6 text-orange-600" /> WITHDRAW <span className="text-orange-600">FUNDS</span></>
                                )}
                            </DialogTitle>
                            <p className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-wider">Account: {selectedAccount?.name}</p>
                        </DialogHeader>
                    </div>
                    <div className="p-8 space-y-5">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select Account *</Label>
                            <Select 
                                value={selectedAccount?.id} 
                                onValueChange={id => setSelectedAccount(transferAccounts.find(a => a.id === id))}
                            >
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl">
                                    <SelectValue placeholder="Select account..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                    {transferAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.name} — ₹{(balances[acc.id] || 0) < 0 ? '-' : ''}₹{Math.abs(balances[acc.id] || 0).toLocaleString('en-IN')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operation *</Label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                <button 
                                    onClick={() => setAdjType('deposit')}
                                    className={cn(
                                        "h-10 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        adjType === 'deposit' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Deposit
                                </button>
                                <button 
                                    onClick={() => setAdjType('withdraw')}
                                    className={cn(
                                        "h-10 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        adjType === 'withdraw' ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Withdraw
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amount (₹) *</Label>
                            <div className="relative">
                                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input 
                                    type="number" 
                                    value={adjForm.amount} 
                                    onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })}
                                    placeholder="0.00"
                                    className="pl-9 bg-slate-50 border-slate-200 h-12 font-black text-slate-900 rounded-xl text-lg focus:ring-blue-500" 
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description / Narration *</Label>
                            <Input 
                                value={adjForm.description} 
                                onChange={e => setAdjForm({ ...adjForm, description: e.target.value })}
                                placeholder="e.g. Initial stock adjustment or miscellaneous fee"
                                className="bg-slate-50 border-slate-200 h-12 font-bold text-black rounded-xl" 
                            />
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Mandatory for strict compliance and audit trail</p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transaction Date</Label>
                            <Input 
                                type="date" 
                                value={adjForm.date} 
                                onChange={e => setAdjForm({ ...adjForm, date: e.target.value })}
                                className="bg-slate-50 border-slate-200 h-11 font-bold text-black rounded-xl" 
                            />
                        </div>

                        <Button 
                            onClick={handleAdjustment} 
                            disabled={adjusting}
                            className={cn(
                                "w-full h-14 text-white font-[1000] tracking-widest uppercase rounded-2xl shadow-md mt-2 transition-all active:scale-[0.98]",
                                adjType === 'deposit' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : "bg-orange-600 hover:bg-orange-700 shadow-orange-100"
                            )}
                        >
                            {adjusting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                adjType === 'deposit' ? 'CONFIRM DEPOSIT' : 'CONFIRM WITHDRAWAL'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <Dialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
                <DialogContent className="sm:max-w-[340px] bg-white rounded-[24px] p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-7 h-7 text-red-500" />
                    </div>
                    <h3 className="text-xl font-black text-black uppercase">Remove Bank?</h3>
                    <p className="text-slate-500 text-sm mt-2">This will delete the account record. Existing ledger entries remain.</p>
                    <div className="flex gap-3 mt-6">
                        <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 h-11 font-black rounded-xl">Cancel</Button>
                        <Button onClick={() => deleteId && handleDelete(deleteId)} className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl">Delete</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
