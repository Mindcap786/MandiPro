'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { useToast } from "@/hooks/use-toast"
import { Plus, Search, ClipboardList, CheckCircle2, Clock, XCircle, Trash2, FileText, ArrowRightLeft, MoreHorizontal, Eye } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type SalesOrder = {
    id: string
    order_number: string | null
    order_date: string
    status: string
    grand_total: number
    buyer: { id: string, name: string } | null
    items: { id: string }[]
}

const STATUS_COLORS: Record<string, string> = {
    'Accepted': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
    'Cancelled': 'bg-rose-100 text-rose-700 border-rose-200',
    'Partially Invoiced': 'bg-amber-100 text-amber-700 border-amber-200',
    'Fully Invoiced': 'bg-blue-100 text-blue-700 border-blue-200'
};

export default function SalesOrdersPage() {
    const { profile } = useAuth()
    const router = useRouter()
    const { toast } = useToast();
    const [orders, setOrders] = useState<SalesOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [buyers, setBuyers] = useState<any[]>([])
    const [itemsList, setItemsList] = useState<any[]>([])
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        buyer_id: '', order_date: new Date().toISOString().split('T')[0],
        notes: '',
    })
    const [lines, setLines] = useState([{ item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0, discount_percent: 0 }])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchOrders()
            supabase.schema('mandi').from('contacts').select('id,name').eq('organization_id', profile.organization_id).eq('contact_type', 'buyer').order('name').then(({ data }) => setBuyers(data || []))
            supabase.schema('mandi').from('commodities').select('id,name,gst_rate').eq('organization_id', profile.organization_id).order('name').then(({ data }) => setItemsList(data || []))
        }
    }, [profile?.organization_id])

    const fetchOrders = async () => {
        setLoading(true)
        const { data } = await supabase
            .schema('mandi')
            .from('sales_orders')
            .select('*, buyer:contacts!buyer_id(id,name), items:sales_order_items(id)')
            .eq('organization_id', profile!.organization_id)
            .order('created_at', { ascending: false })
        setOrders((data as any) || [])
        setLoading(false)
    }

    const updateLine = (i: number, field: string, val: any) => {
        const u = [...lines]
        u[i] = { ...u[i], [field]: val }
        if (field === 'item_id' && val) {
            const it = itemsList.find((x: any) => x.id === val)
            if (it) {
                u[i].unit = it.default_unit || 'Kg';
                u[i].hsn_code = it.hsn_code || '';
                u[i].gst_rate = it.gst_rate || 0;
                u[i].unit_price = it.sale_price || 0
            }
        }
        setLines(u)
    }

    const calcLineBase = (l: any) => l.quantity * l.unit_price * (1 - (l.discount_percent || 0) / 100)
    const calcLineTax = (l: any) => calcLineBase(l) * (l.gst_rate / 100)
    const calcLineTotal = (l: any) => calcLineBase(l) + calcLineTax(l)

    const calcTotal = () => lines.reduce((s, l) => s + calcLineTotal(l), 0)
    const calcSubtotal = () => lines.reduce((s, l) => s + calcLineBase(l), 0)
    const calcTax = () => lines.reduce((s, l) => s + calcLineTax(l), 0)
    const calcDiscount = () => lines.reduce((s, l) => s + (l.quantity * l.unit_price * (l.discount_percent || 0) / 100), 0)

    const handleSave = async () => {
        if (!form.buyer_id || lines.every(l => !l.item_id)) return
        setSaving(true)
        try {
            const valid = lines.filter(l => l.item_id && l.quantity > 0)
            const sub = calcSubtotal()
            const tax = calcTax()
            const disc = calcDiscount()
            const grandTotal = sub + tax;

            const { data: order, error: orderError } = await supabase.schema('mandi').from('sales_orders').insert({
                organization_id: profile!.organization_id,
                buyer_id: form.buyer_id,
                order_date: form.order_date,
                order_number: `SO-${Date.now().toString().slice(-6)}`,
                subtotal: sub,
                discount_amount: disc,
                cgst_amount: tax / 2,
                sgst_amount: tax / 2,
                igst_amount: 0,
                is_igst: false,
                grand_total: grandTotal,
                total_amount: grandTotal, // Added total_amount
                status: 'Accepted', // Updated status
                notes: form.notes || null,
            }).select().single()

            if (orderError || !order) {
                throw orderError || new Error("Failed to create sales order.");
            }

            const itemsData = valid.map(l => ({
                sales_order_id: order.id,
                item_id: l.item_id,
                quantity: l.quantity,
                unit: l.unit,
                unit_price: l.unit_price,
                discount_percent: l.discount_percent || 0,
                gst_rate: l.gst_rate,
                tax_amount: calcLineTax(l),
                total_price: calcLineBase(l),
                amount_after_tax: calcLineTotal(l),
            }))

            const { error: itemsError } = await supabase.schema('mandi').from('sales_order_items').insert(itemsData)

            if (itemsError) {
                throw itemsError;
            }

            toast({
                title: "Order Created Successfully",
                description: `Sales Order #${order.order_number} has been confirmed.`,
            });

            setShowForm(false)
            setForm({ buyer_id: '', order_date: new Date().toISOString().split('T')[0], notes: '' })
            setLines([{ item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0, discount_percent: 0 }])
            fetchOrders()
        } catch (error: any) {
            console.error('Error saving order:', error);
            toast({
                title: "Error Creating Order",
                description: error.message || "Something went wrong while saving the order.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    }

    const filtered = orders.filter(o =>
        !search || o.order_number?.toLowerCase().includes(search.toLowerCase()) || o.buyer?.name?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Sales Orders</h1>
                    <p className="text-slate-500 text-sm mt-1">Book customer orders before invoicing</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                    <Plus className="w-4 h-4" /> New Sale Order
                </button>
            </div>

            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    placeholder="Search by order # or customer..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                />
            </div>

            {showForm && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
                    <h2 className="text-lg font-black text-slate-800 mb-6">Create New Sale Order</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Customer / Buyer *</label>
                            <select
                                value={form.buyer_id}
                                onChange={e => setForm({ ...form, buyer_id: e.target.value })}
                                className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                            >
                                <option value="">Select Customer</option>
                                {buyers.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Order Date</label>
                            <input
                                type="date"
                                value={form.order_date}
                                onChange={e => setForm({ ...form, order_date: e.target.value })}
                                className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto mb-6">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b-2 border-slate-100">
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Item Description</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Quantity</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-28">Price (₹)</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-20">Disc %</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-24">Tax %</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-32">Total</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {lines.map((l, i) => (
                                    <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 pr-2">
                                            <select
                                                value={l.item_id}
                                                onChange={e => updateLine(i, 'item_id', e.target.value)}
                                                className="w-full px-3 py-2 bg-transparent border-b border-transparent group-hover:border-slate-200 focus:border-indigo-400 font-bold transition-all outline-none"
                                            >
                                                <option value="">Select Item</option>
                                                {itemsList.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-3 px-1"><input type="number" value={l.quantity || ''} onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-2 py-2 bg-transparent text-right font-black outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-3 px-1"><input type="number" value={l.unit_price || ''} onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)} className="w-full px-2 py-2 bg-transparent text-right font-black outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-3 px-1"><input type="number" value={l.discount_percent || ''} onChange={e => updateLine(i, 'discount_percent', parseFloat(e.target.value) || 0)} className="w-full px-2 py-2 bg-transparent text-right font-bold text-blue-600 outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-3 px-1"><input type="number" value={l.gst_rate || ''} onChange={e => updateLine(i, 'gst_rate', parseFloat(e.target.value) || 0)} className="w-full px-2 py-2 bg-transparent text-right font-bold text-amber-600 outline-none border-b border-transparent group-hover:border-slate-200" /></td>
                                        <td className="py-3 px-1 text-right font-black text-slate-900">₹{calcLineTotal(l).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                        <td><button onClick={() => lines.length > 1 && setLines(lines.filter((_, j) => j !== i))} className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-8">
                        <button
                            onClick={() => setLines([...lines, { item_id: '', quantity: 0, unit_price: 0, unit: 'Kg', hsn_code: '', gst_rate: 0, discount_percent: 0 }])}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-black tracking-widest transition-all"
                        >+ ADD ANOTHER ITEM</button>

                        <div className="w-full md:w-64 space-y-2">
                            <div className="flex justify-between text-slate-500 text-sm">
                                <span>Subtotal</span>
                                <span className="font-bold">₹{calcSubtotal().toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 text-sm">
                                <span>GST Total</span>
                                <span className="font-bold">₹{calcTax().toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xl font-black text-slate-900 border-t pt-2">
                                <span>Total Price</span>
                                <span>₹{calcTotal().toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-8 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-10 py-3 bg-black text-white rounded-xl text-sm font-black hover:bg-slate-800 disabled:opacity-50 shadow-lg transform active:scale-95 transition-all"
                        >{saving ? 'PROCESSING...' : 'CONFIRM ORDER'}</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Clock className="w-12 h-12 text-slate-200 animate-pulse" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Syncing Sales Orders...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-32 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <ClipboardList className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-600">No Sales Orders Found</h3>
                    <p className="text-sm text-slate-400 mt-1">Orders booked from customers will appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filtered.map(order => (
                        <div key={order.id} className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50 transition-all cursor-pointer">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-5">
                                    <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                                        <ClipboardList className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-slate-900 tracking-tight text-lg">{order.order_number}</span>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_COLORS[order.status] || ''}`}>{order.status}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                            <span className="font-black text-slate-700">{order.buyer?.name}</span>
                                            <span className="opacity-30">•</span>
                                            <span className="font-bold">{new Date(order.order_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            <span className="opacity-30">•</span>
                                            <span className="font-bold">{order.items?.length || 0} ITEMS</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 pt-4 md:pt-0">
                                    <div className="text-right">
                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Order Total</div>
                                        <div className="text-2xl font-black text-slate-900 tracking-tighter italic">₹{order.grand_total?.toLocaleString('en-IN')}</div>
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all">
                                                <MoreHorizontal className="w-5 h-5" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56 bg-white border-slate-200 rounded-xl shadow-xl">
                                            <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-3 py-2">Order Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-slate-100" />
                                            <DropdownMenuItem
                                                onClick={() => router.push(`/sales/new?order_id=${order.id}`)}
                                                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50 text-sm font-bold text-slate-700"
                                            >
                                                <FileText className="w-4 h-4 text-indigo-600" /> Convert to Invoice
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50 text-sm font-bold text-slate-700"
                                            >
                                                <Eye className="w-4 h-4 text-slate-500" /> View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator className="bg-slate-100" />
                                            <DropdownMenuItem
                                                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-red-50 text-sm font-bold text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4" /> Delete Order
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
