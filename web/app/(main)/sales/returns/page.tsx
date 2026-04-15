'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Plus, Search, RotateCcw, Trash2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 15
const MAX_FREE_PAGES = 3

type SaleReturn = {
    id: string
    return_number: string
    return_date: string
    status: string
    grand_total: number
    buyer: { name: string } | null
    items: { id: string }[]
}

export default function SaleReturnsPage() {
    const { profile } = useAuth()
    const [returns, setReturns] = useState<SaleReturn[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [buyers, setBuyers] = useState<any[]>([])
    const [sales, setSales] = useState<any[]>([])
    const [itemsList, setItemsList] = useState<any[]>([])
    const [saving, setSaving] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)

    const [form, setForm] = useState({
        contact_id: '',
        sale_id: '',
        return_date: new Date().toISOString().split('T')[0],
        return_type: 'Full',
        remarks: ''
    })
    const [lines, setLines] = useState([{ item_id: '', qty: 0, rate: 0, unit: 'Kg', gst_rate: 0 }])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchReturns()
            supabase.schema('mandi').from('contacts').select('id,name').eq('organization_id', profile.organization_id).eq('contact_type', 'buyer').order('name').then(({ data }) => setBuyers(data || []))
            supabase.schema('mandi').from('sales').select('id,bill_no,buyer_id').eq('organization_id', profile.organization_id).eq('payment_status', 'confirmed').then(({ data }) => setSales(data || []))
            supabase.schema('mandi').from('commodities').select('id,name,gst_rate').eq('organization_id', profile.organization_id).order('name').then(({ data }) => setItemsList(data || []))
        }
    }, [profile?.organization_id])

    useEffect(() => { setCurrentPage(1) }, [search])

    const fetchReturns = async () => {
        setLoading(true)
        const { data } = await supabase
            .schema('mandi')
            .from('sale_returns')
            .select('*, buyer:contacts!buyer_id(name), items:sale_return_items(id)')
            .eq('organization_id', profile!.organization_id)
            .order('created_at', { ascending: false })
        setReturns((data as any) || [])
        setLoading(false)
    }

    const filtered = returns.filter(r => {
        const matchSearch = !search || r.return_number.toLowerCase().includes(search.toLowerCase()) || r.buyer?.name?.toLowerCase().includes(search.toLowerCase());
        const matchStart = !startDate || r.return_date >= startDate;
        const matchEnd = !endDate || r.return_date <= endDate;
        return matchSearch && matchStart && matchEnd;
    })

    const downloadCSV = () => {
        if (!filtered.length) return
        const headers = ['Return #', 'Customer', 'Date', 'Items', 'Credit Value']
        const rows = filtered.map((r: SaleReturn) => [
            r.return_number,
            r.buyer?.name || '',
            new Date(r.return_date).toLocaleDateString('en-IN'),
            r.items?.length || 0,
            r.grand_total
        ])
        const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sale-returns-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleSaleSelect = async (saleId: string) => {
        setForm({ ...form, sale_id: saleId })
        if (!saleId) { setLines([{ item_id: '', qty: 0, rate: 0, unit: 'Kg', gst_rate: 0 }]); return }
        const sale = sales.find(s => s.id === saleId)
        if (sale) setForm(prev => ({ ...prev, contact_id: sale.buyer_id }))
        const { data: items } = await supabase.schema('mandi').from('sale_items').select('item_id,quantity,rate,unit,gst_rate').eq('sale_id', saleId)
        if (items) setLines(items.map(it => ({ item_id: it.item_id, qty: Number(it.quantity), rate: Number(it.rate), unit: it.unit || 'Kg', gst_rate: it.gst_rate || 0 })))
    }

    const calcLineTotal = (l: any) => l.qty * l.rate * (1 + (l.gst_rate || 0) / 100)
    const calcSubtotal = () => lines.reduce((s, l) => s + l.qty * l.rate, 0)
    const calcTax = () => lines.reduce((s, l) => s + (l.qty * l.rate * (l.gst_rate || 0) / 100), 0)
    const calcGrandTotal = () => calcSubtotal() + calcTax()

    const handleSave = async () => {
        if (!form.contact_id || lines.every(l => !l.item_id)) return
        setSaving(true)
        const valid = lines.filter(l => l.item_id && l.qty > 0)
        const sub = calcSubtotal(); const tax = calcTax(); const total = sub + tax

        const { data: ret, error } = await supabase.schema('mandi').from('sale_returns').insert({
            organization_id: profile!.organization_id,
            buyer_id: form.contact_id,
            sale_id: form.sale_id || null,
            return_date: form.return_date,
            return_number: `SR-${Date.now().toString().slice(-6)}`,
            return_type: form.return_type,
            subtotal: sub, tax_amount: tax, grand_total: total,
            status: 'confirmed', remarks: form.remarks || null
        }).select().single()

        if (error || !ret) { console.error(error); setSaving(false); return }

        await supabase.schema('mandi').from('sale_return_items').insert(valid.map(l => ({
            return_id: ret.id, item_id: l.item_id, qty: l.qty, rate: l.rate,
            unit: l.unit, gst_rate: l.gst_rate,
            tax_amount: (l.qty * l.rate * l.gst_rate / 100), amount: l.qty * l.rate
        })))

        for (const item of valid) {
            // Mandi specific stock increment (lot based or direct commodity based)
            // For now, attempting to update commodity stock if it exists in mandi
            await supabase.schema('mandi').from('commodities').update({
                stock_quantity: supabase.rpc('increment', { x: item.qty }) // This is a placeholder, might need direct increment
            } as any).eq('id', item.item_id);
        }

        setSaving(false); setShowForm(false)
        setForm({ contact_id: '', sale_id: '', return_date: new Date().toISOString().split('T')[0], return_type: 'Full', remarks: '' })
        setLines([{ item_id: '', qty: 0, rate: 0, unit: 'Kg', gst_rate: 0 }])
        fetchReturns()
    }

    // Pagination
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const cappedPage = Math.min(currentPage, MAX_FREE_PAGES)
    const pageItems = filtered.slice((cappedPage - 1) * PAGE_SIZE, cappedPage * PAGE_SIZE)
    const hasMoreBeyondLimit = filtered.length > MAX_FREE_PAGES * PAGE_SIZE

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <RotateCcw className="w-8 h-8 text-red-600" /> Sale Returns
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Process customer returns and stock adjustments</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={downloadCSV} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-5 py-3 rounded-xl font-black text-sm hover:bg-slate-200 transition-all">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-red-700 shadow-xl shadow-red-100 transition-all">
                        <Plus className="w-5 h-5" /> Register Return
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input placeholder="Search by return # or customer..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all" />
                </div>
                <div className="flex gap-4">
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="px-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all"
                        placeholder="Start Date"
                    />
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="px-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all"
                        placeholder="End Date"
                    />
                </div>
            </div>

            {/* Register Return Form */}
            {showForm && (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-8 shadow-2xl animate-in slide-in-from-right-4 duration-300">
                    <h2 className="text-xl font-black text-slate-800 mb-8 border-b pb-4">Sale Return Voucher</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Ref Sale Invoice</label>
                            <select value={form.sale_id} onChange={e => handleSaleSelect(e.target.value)} className="w-full px-4 py-3 bg-red-50/30 border border-red-100 rounded-xl text-sm font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-red-100 transition-all">
                                <option value="">Direct Return (No Ref)</option>
                                {sales.map(s => <option key={s.id} value={s.id}>{s.bill_no || s.invoice_number}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Customer *</label>
                            <select value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-red-100 transition-all">
                                <option value="">Select Customer</option>
                                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Return Date</label>
                            <input type="date" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold" />
                        </div>
                    </div>

                    <div className="mb-8 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b-2 border-slate-100">
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Item Description</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Qty</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-28">Rate (₹)</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Tax %</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-32">Total</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {lines.map((l, i) => (
                                    <tr key={i} className="group hover:bg-red-50/10 transition-colors">
                                        <td className="py-2 pr-4">
                                            <select value={l.item_id} onChange={e => { const u = [...lines]; u[i].item_id = e.target.value; const it = itemsList.find(x => x.id === e.target.value); if (it) { u[i].rate = it.sale_price || 0; u[i].gst_rate = it.gst_rate || 0; u[i].unit = it.default_unit || 'Kg'; } setLines(u); }} className="w-full px-4 py-2 bg-transparent border-b border-transparent group-hover:border-slate-200 font-bold outline-none italic">
                                                <option value="">Select Item</option>
                                                {itemsList.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-2 px-1"><input type="number" value={l.qty || ''} onChange={e => { const u = [...lines]; u[i].qty = parseFloat(e.target.value) || 0; setLines(u); }} className="w-full px-2 py-2 bg-transparent text-right font-black outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-2 px-1"><input type="number" value={l.rate || ''} onChange={e => { const u = [...lines]; u[i].rate = parseFloat(e.target.value) || 0; setLines(u); }} className="w-full px-2 py-2 bg-transparent text-right font-black outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-2 px-1"><input type="number" value={l.gst_rate || ''} onChange={e => { const u = [...lines]; u[i].gst_rate = parseFloat(e.target.value) || 0; setLines(u); }} className="w-full px-2 py-2 bg-transparent text-right font-bold text-amber-600 outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-2 px-1 text-right font-black text-slate-900 italic">₹{calcLineTotal(l).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                        <td><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-1 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => setLines([...lines, { item_id: '', qty: 0, rate: 0, unit: 'Kg', gst_rate: 0 }])} className="mt-4 text-red-600 text-[10px] font-black uppercase tracking-widest hover:underline">+ ADD CUSTOM RETURN ITEM</button>
                    </div>

                    <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-8 pt-6 border-t border-slate-100">
                        <div className="flex-1 w-full max-w-md">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Internal Remarks / Reason</label>
                            <textarea value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className="w-full mt-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm min-h-[100px]" placeholder="Explain why the customer is returning these goods..."></textarea>
                        </div>
                        <div className="w-full md:w-72 space-y-3">
                            <div className="flex justify-between text-slate-500 text-sm"><span>Subtotal Return</span><span className="font-bold">₹{calcSubtotal().toLocaleString('en-IN')}</span></div>
                            <div className="flex justify-between text-slate-500 text-sm"><span>Tax Reversal</span><span className="font-bold">₹{calcTax().toLocaleString('en-IN')}</span></div>
                            <div className="flex justify-between text-2xl font-black text-red-600 border-t-2 border-red-50 pt-3"><span>Credit Value</span><span>₹{calcGrandTotal().toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></div>
                        </div>
                    </div>

                    <div className="flex gap-4 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-black hover:bg-slate-200 transition-all">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="px-12 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 disabled:opacity-50 shadow-xl shadow-red-100 active:scale-95 transition-all">
                            {saving ? 'PROCESSING RETURN...' : 'CONFIRM SALE RETURN'}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <div className="h-10 w-10 border-4 border-red-50 border-t-red-600 rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Processing Return Logs...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-32 bg-red-50/10 rounded-3xl border-2 border-dashed border-red-100">
                    <RotateCcw className="w-16 h-16 text-red-100 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-700 italic">No Sales Returns Logged</h3>
                    <p className="text-sm text-slate-400 mt-1">Returned goods and credit notes will appear here.</p>
                </div>
            ) : (
                <>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                        Showing {pageItems.length} of {filtered.length} returns
                        {hasMoreBeyondLimit && <span className="ml-2 text-amber-500">· Download CSV for full data</span>}
                    </p>

                    <div className="grid grid-cols-1 gap-4">
                        {pageItems.map(ret => (
                            <div key={ret.id} className="group bg-white border border-slate-200 rounded-[2rem] p-6 hover:border-red-200 hover:shadow-2xl transition-all cursor-pointer">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-center gap-6">
                                        <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center group-hover:bg-red-600 transition-colors">
                                            <RotateCcw className="w-8 h-8 text-red-600 group-hover:text-white transition-colors" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl font-black text-slate-900">{ret.return_number}</span>
                                                <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest">CONFIRMED</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-1">
                                                <div className="flex items-center gap-1.5 font-black text-slate-700 uppercase tracking-tight italic">{ret.buyer?.name}</div>
                                                <span className="opacity-30">•</span>
                                                <div className="font-bold text-slate-500">{new Date(ret.return_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                                <span className="opacity-30">•</span>
                                                <div className="font-bold text-slate-500">{ret.items?.length || 0} ITEMS</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic">Credit Value</div>
                                        <div className="text-2xl font-black text-red-600 tracking-tighter italic">- ₹{ret.grand_total?.toLocaleString('en-IN')}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {filtered.length > PAGE_SIZE && (
                        <div className="mt-8 flex flex-col items-center gap-4">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-400 font-black disabled:opacity-30 hover:bg-slate-50 transition-all">←</button>
                                {Array.from({ length: Math.min(totalPages, MAX_FREE_PAGES) }, (_, i) => i + 1).map(page => (
                                    <button key={page} onClick={() => setCurrentPage(page)}
                                        className={cn('w-10 h-10 rounded-xl font-black text-sm transition-all', currentPage === page ? 'bg-red-600 text-white shadow-lg shadow-red-100' : 'border border-slate-200 text-slate-500 hover:bg-slate-50')}>
                                        {page}
                                    </button>
                                ))}
                                {totalPages > MAX_FREE_PAGES && <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest px-2">···</span>}
                                <button onClick={() => setCurrentPage(p => Math.min(MAX_FREE_PAGES, p + 1))} disabled={currentPage >= MAX_FREE_PAGES || currentPage >= totalPages} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-400 font-black disabled:opacity-30 hover:bg-slate-50 transition-all">→</button>
                            </div>

                            {hasMoreBeyondLimit && (
                                <div className="w-full bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl p-6 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="font-black text-slate-800 text-sm uppercase tracking-widest">📊 {filtered.length - MAX_FREE_PAGES * PAGE_SIZE}+ more return records</p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">Download the full CSV report to see all records</p>
                                    </div>
                                    <button onClick={downloadCSV} className="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-3 rounded-2xl shadow-lg shadow-red-100 flex items-center gap-2 shrink-0 text-sm transition-all">
                                        <Download className="w-4 h-4" /> Download Full Report
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
