'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Plus, Search, Filter, ClipboardList, ArrowRight, CheckCircle2, XCircle, Clock, MoreHorizontal, Eye, FileText, Trash2, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Quotation = {
    id: string
    quotation_no: number
    quotation_date: string
    valid_until: string | null
    status: string
    grand_total: number
    notes: string | null
    terms: string | null
    buyer: { id: string, name: string } | null
    items: { id: string }[]
    created_at: string
}

const STATUS_CONFIG: Record<string, { color: string, bg: string, icon: any }> = {
    'draft': { color: 'text-slate-600', bg: 'bg-slate-100', icon: Clock },
    'sent': { color: 'text-blue-600', bg: 'bg-blue-50', icon: ArrowRight },
    'accepted': { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
    'rejected': { color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
    'expired': { color: 'text-amber-600', bg: 'bg-amber-50', icon: ShieldAlert },
}

export default function QuotationsPage() {
    const { profile } = useAuth()
    const [quotations, setQuotations] = useState<Quotation[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [showNewForm, setShowNewForm] = useState(false)

    // New Quotation form state
    const [buyers, setBuyers] = useState<any[]>([])
    const [items, setItems] = useState<any[]>([])
    const [priceLists, setPriceLists] = useState<any[]>([])
    const [formData, setFormData] = useState({
        buyer_id: '',
        quotation_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        notes: '',
        terms: '1. Quotation valid for 15 days from issue date.\n2. 50% advance payment required.\n3. Taxes and shipping extra as applicable.'
    })
    const [lineItems, setLineItems] = useState<{ item_id: string, quantity: number, unit_price: number, unit: string, hsn_code: string, gst_rate: number }[]>([
        { item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0 }
    ])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (profile?.organization_id) {
            fetchQuotations()
            fetchBuyers()
            fetchItems()
            fetchPriceLists()
        }
    }, [profile?.organization_id])

    const fetchQuotations = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('quotations')
            .select('*, buyer:contacts!buyer_id(id, name), items:quotation_items(id)')
            .eq('organization_id', profile!.organization_id)
            .order('created_at', { ascending: false })
        setQuotations((data as any) || [])
        setLoading(false)
    }

    const fetchBuyers = async () => {
        const { data } = await supabase
            .from('contacts')
            .select('id, name, price_list_id')
            .eq('organization_id', profile!.organization_id)
            .in('type', ['buyer'])
            .order('name')
        setBuyers(data || [])
    }

    const fetchPriceLists = async () => {
        const { data } = await supabase
            .from('price_lists')
            .select('id, items:price_list_items(item_id, unit_price, min_quantity)')
            .eq('organization_id', profile!.organization_id)
        setPriceLists(data || [])
    }

    const fetchItems = async () => {
        const { data } = await supabase
            .from('items')
            .select('id, name, default_unit, hsn_code, gst_rate, purchase_price')
            .eq('organization_id', profile!.organization_id)
            .order('name')
        setItems(data || [])
    }

    const addLineItem = () => {
        setLineItems([...lineItems, { item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0 }])
    }

    const removeLineItem = (index: number) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter((_, i) => i !== index))
        }
    }

    const updateLineItem = (index: number, field: string, value: any) => {
        const updated = [...lineItems]
        updated[index] = { ...updated[index], [field]: value }

        // Auto-fill from item master and price list
        if (field === 'item_id' || field === 'quantity') {
            const itemId = field === 'item_id' ? value : updated[index].item_id
            const qty = field === 'quantity' ? value : updated[index].quantity

            if (itemId) {
                const item = items.find((i: any) => i.id === itemId)
                if (item) {
                    if (field === 'item_id') {
                        updated[index].unit = item.default_unit || 'Kg'
                        updated[index].hsn_code = item.hsn_code || ''
                        updated[index].gst_rate = item.gst_rate || 0
                    }

                    let price = (item.purchase_price || 0) * 1.15 // Default 15% markup

                    if (formData.buyer_id) {
                        const buyer = buyers.find((b: any) => b.id === formData.buyer_id)
                        if (buyer?.price_list_id) {
                            const pl = priceLists.find((p: any) => p.id === buyer.price_list_id)
                            if (pl && pl.items) {
                                const validTiers = pl.items.filter((pli: any) => pli.item_id === itemId && (pli.min_quantity || 0) <= qty)
                                if (validTiers.length > 0) {
                                    validTiers.sort((a: any, b: any) => (b.min_quantity || 0) - (a.min_quantity || 0))
                                    price = validTiers[0].unit_price
                                } else {
                                    const baseTier = pl.items.find((pli: any) => pli.item_id === itemId && (pli.min_quantity || 0) === 0)
                                    if (baseTier) price = baseTier.unit_price
                                }
                            }
                        }
                    }

                    updated[index].unit_price = price
                }
            }
        }
        setLineItems(updated)
    }

    const calcLineTotal = (li: typeof lineItems[0]) => {
        const base = li.quantity * li.unit_price
        const tax = base * (li.gst_rate / 100)
        return { base, tax, total: base + tax }
    }

    const calcGrandTotal = () => {
        return lineItems.reduce((sum, li) => sum + calcLineTotal(li).total, 0)
    }

    const handleSave = async () => {
        if (!formData.buyer_id || lineItems.every(li => !li.item_id)) return
        setSaving(true)

        const validItems = lineItems.filter(li => li.item_id && li.quantity > 0)
        const subtotal = validItems.reduce((s, li) => s + li.quantity * li.unit_price, 0)
        const taxTotal = validItems.reduce((s, li) => s + (li.quantity * li.unit_price * li.gst_rate / 100), 0)

        const { data: qn, error } = await supabase
            .from('quotations')
            .insert({
                organization_id: profile!.organization_id,
                buyer_id: formData.buyer_id,
                quotation_date: formData.quotation_date,
                valid_until: formData.valid_until || null,
                subtotal: subtotal,
                gst_total: taxTotal,
                grand_total: subtotal + taxTotal,
                notes: formData.notes || null,
                terms: formData.terms || null,
                status: 'draft',
            })
            .select()
            .single()

        if (error || !qn) {
            alert('Error creating Quotation: ' + (error?.message || 'Unknown'))
            setSaving(false)
            return
        }

        // Insert line items
        const itemRows = validItems.map(li => ({
            organization_id: profile!.organization_id,
            quotation_id: qn.id,
            item_id: li.item_id,
            qty: li.quantity,
            unit: li.unit,
            rate: li.unit_price,
            hsn_code: li.hsn_code,
            gst_rate: li.gst_rate,
            tax_amount: li.quantity * li.unit_price * li.gst_rate / 100,
            amount: li.quantity * li.unit_price,
        }))

        await supabase.from('quotation_items').insert(itemRows)

        setSaving(false)
        setShowNewForm(false)
        setFormData({ buyer_id: '', quotation_date: new Date().toISOString().split('T')[0], valid_until: '', notes: '', terms: '1. Quotation valid for 15 days from issue date.\n2. 50% advance payment required.\n3. Taxes and shipping extra as applicable.' })
        setLineItems([{ item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0 }])
        fetchQuotations()
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this Quotation?')) return
        await supabase.from('quotation_items').delete().eq('quotation_id', id)
        await supabase.from('quotations').delete().eq('id', id)
        fetchQuotations()
    }

    const handleStatusChange = async (id: string, newStatus: string) => {
        await supabase.from('quotations').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
        fetchQuotations()
    }

    const filtered = quotations.filter(q => {
        const matchSearch = !search || String(q.quotation_no).includes(search) || q.buyer?.name?.toLowerCase().includes(search.toLowerCase())
        const matchStatus = statusFilter === 'all' || q.status === statusFilter
        return matchSearch && matchStatus
    })

    const statusCounts = quotations.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc }, {} as Record<string, number>)

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Quotations & Proforma Invoices</h1>
                    <p className="text-slate-500 font-medium mt-1">Send professional quotes to buyers and track their status.</p>
                </div>
                <button
                    onClick={() => setShowNewForm(!showNewForm)}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                    <Plus className="w-5 h-5" /> New Quotation
                </button>
            </div>

            {/* New QTN Form */}
            {showNewForm && (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl shadow-slate-100/50 animate-in slide-in-from-top-4 duration-500">
                    <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                        <FileText className="w-6 h-6 text-indigo-600" /> Create Quotation
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Buyer *</label>
                            <select
                                value={formData.buyer_id}
                                onChange={e => setFormData({ ...formData, buyer_id: e.target.value })}
                                className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                            >
                                <option value="">Select Buyer</option>
                                {buyers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Date *</label>
                            <input type="date" value={formData.quotation_date} onChange={e => setFormData({ ...formData, quotation_date: e.target.value })} className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Valid Until</label>
                            <input type="date" value={formData.valid_until} onChange={e => setFormData({ ...formData, valid_until: e.target.value })} className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                        </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="overflow-x-auto mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider">Item Details</th>
                                    <th className="text-right py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider w-24">Qty</th>
                                    <th className="text-left py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider w-24">Unit</th>
                                    <th className="text-right py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider w-32">Rate (₹)</th>
                                    <th className="text-right py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider w-20">GST %</th>
                                    <th className="text-right py-3 px-2 text-xs font-bold uppercase text-slate-500 tracking-wider w-32">Amount</th>
                                    <th className="w-12"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lineItems.map((li, idx) => {
                                    const calc = calcLineTotal(li)
                                    return (
                                        <tr key={idx} className="border-b border-slate-200/50 last:border-0 hover:bg-slate-100/50 transition-colors">
                                            <td className="py-3 px-2">
                                                <select value={li.item_id} onChange={e => updateLineItem(idx, 'item_id', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all">
                                                    <option value="">Select Item</option>
                                                    {items.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="py-3 px-2"><input type="number" value={li.quantity || ''} onChange={e => updateLineItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-right shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" placeholder="0" /></td>
                                            <td className="py-3 px-2"><input value={li.unit} onChange={e => updateLineItem(idx, 'unit', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" /></td>
                                            <td className="py-3 px-2"><input type="number" value={li.unit_price || ''} onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-right shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" placeholder="0.00" /></td>
                                            <td className="py-3 px-2"><input type="number" value={li.gst_rate || ''} onChange={e => updateLineItem(idx, 'gst_rate', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-right shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" placeholder="0%" /></td>
                                            <td className="py-3 px-2 text-right">
                                                <div className="font-bold text-slate-800">₹{calc.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                                                {calc.tax > 0 && <div className="text-[10px] text-slate-400 font-medium">incl. ₹{calc.tax.toLocaleString('en-IN', { maximumFractionDigits: 2 })} tax</div>}
                                            </td>
                                            <td className="py-3 pl-2 text-right">
                                                <button onClick={() => removeLineItem(idx)} className="p-2 bg-white text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-start justify-between mb-8">
                        <button onClick={addLineItem} className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors border border-indigo-100">
                            <Plus className="w-4 h-4" /> Add Item Line
                        </button>
                        <div className="text-right bg-slate-50 p-6 rounded-2xl border border-slate-200 min-w-[250px]">
                            <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Grand Total</div>
                            <div className="text-4xl font-black text-slate-900 tracking-tight">₹{calcGrandTotal().toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Internal Notes</label>
                            <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium resize-none h-24 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" placeholder="For internal reference only..." />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Terms & Conditions</label>
                            <textarea value={formData.terms} onChange={e => setFormData({ ...formData, terms: e.target.value })} className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium resize-none h-24 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" placeholder="Will be printed on the quotation..." />
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8 justify-end border-t border-slate-100 pt-8">
                        <button onClick={() => setShowNewForm(false)} className="px-8 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="px-10 py-3.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                            {saving ? 'Saving...' : 'Create Quotation'} <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* List Header */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm self-start overflow-x-auto w-full md:w-auto custom-scrollbar">
                    {['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                "px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                                statusFilter === s
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'text-slate-500 hover:bg-slate-100'
                            )}
                        >
                            {s === 'all' ? 'All Quotes' : s} {s !== 'all' && statusCounts[s] ? <span className={cn("ml-1.5 px-2 py-0.5 rounded-full text-[10px]", statusFilter === s ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600")}>{statusCounts[s]}</span> : ''}
                        </button>
                    ))}
                </div>

                <div className="relative w-full md:w-[350px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        placeholder="Search Quote # or Buyer..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Quotations List */}
            {loading ? (
                <div className="text-center py-20 text-slate-400 font-medium">Loading quotations...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-24 bg-white border border-slate-200 border-dashed rounded-3xl">
                    <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                        <FileText className="w-10 h-10 text-slate-300 -rotate-3" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">No Quotations Found</h3>
                    <p className="text-slate-500 mt-2 font-medium max-w-sm mx-auto">Either no quotes match your search criteria, or you haven't issued any quotes yet.</p>
                    {filtered.length === quotations.length && <button onClick={() => { setShowNewForm(true); setSearch(''); setStatusFilter('all') }} className="mt-6 text-indigo-600 font-bold hover:text-indigo-800 text-sm">Create New Quotation &rarr;</button>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(qtn => {
                        const sc = STATUS_CONFIG[qtn.status] || STATUS_CONFIG['draft']
                        const StatusIcon = sc.icon
                        return (
                            <div key={qtn.id} className="bg-white border border-slate-200 rounded-3xl p-6 hover:shadow-xl hover:border-indigo-200 transition-all group flex flex-col h-full relative overflow-hidden">
                                {/* Decorative background accent based on status */}
                                <div className={cn("absolute -right-16 -top-16 w-32 h-32 rounded-full opacity-20 blur-2xl group-hover:opacity-40 transition-opacity", sc.bg.replace('bg-', 'bg-').replace('-50', '-500'))}></div>

                                <div className="flex items-start justify-between mb-4 relative z-10">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="font-black text-slate-900 tracking-tight text-xl">QTN-{qtn.quotation_no}</span>
                                        </div>
                                        <div className="text-sm font-bold text-slate-500">{qtn.buyer?.name || 'Unknown Buyer'}</div>
                                    </div>
                                    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider", sc.bg, sc.color)}>
                                        <StatusIcon className="w-4 h-4" /> {qtn.status}
                                    </div>
                                </div>

                                <div className="space-y-3 mb-6 flex-1 relative z-10">
                                    <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 font-medium">Date</span>
                                        <span className="font-bold text-slate-800">{new Date(qtn.quotation_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 font-medium">Valid Until</span>
                                        <span className={cn("font-bold", qtn.valid_until && new Date(qtn.valid_until) < new Date() ? "text-red-500" : "text-slate-800")}>
                                            {qtn.valid_until ? new Date(qtn.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 font-medium">Items</span>
                                        <span className="font-bold text-slate-800">{qtn.items?.length || 0} line items</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-200 mt-auto relative z-10 flex items-end justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Grand Total</p>
                                        <div className="text-2xl font-black text-slate-900 tracking-tight">₹{qtn.grand_total?.toLocaleString('en-IN')}</div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {qtn.status === 'draft' && (
                                            <button onClick={() => handleStatusChange(qtn.id, 'sent')} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white transition-colors border border-slate-200 hover:border-blue-600" title="Mark as Sent">
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        )}
                                        {qtn.status === 'sent' && (
                                            <>
                                                <button onClick={() => handleStatusChange(qtn.id, 'accepted')} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors border border-slate-200 hover:border-emerald-600" title="Mark as Accepted">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleStatusChange(qtn.id, 'rejected')} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-slate-200 hover:border-red-500" title="Mark as Rejected">
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        {(qtn.status === 'draft' || qtn.status === 'rejected' || qtn.status === 'expired') && (
                                            <button onClick={() => handleDelete(qtn.id)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors border border-slate-200 hover:border-red-500" title="Delete Quote">
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
    )
}
