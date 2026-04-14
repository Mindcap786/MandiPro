'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Plus, Search, Truck, CheckCircle2, Clock, MapPin, Navigation, User, Hash, Info, Trash2 } from 'lucide-react'

type DeliveryChallan = {
    id: string
    challan_number: string
    challan_date: string
    status: string
    vehicle_number: string | null
    driver_name: string | null
    destination: string | null
    buyer: { name: string } | null
    items: { id: string }[]
}

export default function DeliveryChallanPage() {
    const { profile } = useAuth()
    const [challans, setChallans] = useState<DeliveryChallan[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [buyers, setBuyers] = useState<any[]>([])
    const [orders, setOrders] = useState<any[]>([])
    const [itemsList, setItemsList] = useState<any[]>([])
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        contact_id: '',
        sales_order_id: '',
        challan_date: new Date().toISOString().split('T')[0],
        vehicle_number: '',
        driver_name: '',
        destination: '',
        transport_mode: 'Road',
        lr_number: '',
        notes: ''
    })
    const [lines, setLines] = useState([{ item_id: '', quantity_dispatched: 0, unit: 'Kg' }])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchChallans()
            supabase.schema('mandi').from('contacts').select('id,name').eq('organization_id', profile.organization_id).eq('type', 'buyer').order('name').then(({ data }) => setBuyers(data || []))
            supabase.schema('mandi').from('sales_orders').select('id,order_number,buyer_id').eq('organization_id', profile.organization_id).neq('status', 'cancelled').then(({ data }) => setOrders(data || []))
            supabase.schema('mandi').from('commodities').select('id,name').eq('organization_id', profile.organization_id).order('name').then(({ data }) => setItemsList(data || []))
        }
    }, [profile?.organization_id])

    const fetchChallans = async () => {
        setLoading(true)
        const { data } = await supabase
            .schema('mandi')
            .from('delivery_challans')
            .select('*, buyer:contacts!buyer_id(name), items:delivery_challan_items(id)')
            .eq('organization_id', profile!.organization_id)
            .order('created_at', { ascending: false })
        setChallans((data as any) || [])
        setLoading(false)
    }

    const handleOrderSelect = async (orderId: string) => {
        setForm({ ...form, sales_order_id: orderId });
        if (!orderId) { setLines([{ item_id: '', quantity_dispatched: 0, unit: 'Kg' }]); return; }

        const order = orders.find(o => o.id === orderId);
        if (order) setForm(prev => ({ ...prev, contact_id: order.buyer_id }));

        const { data: items } = await supabase.schema('mandi').from('sales_order_items').select('item_id,quantity,unit').eq('sales_order_id', orderId);
        if (items) {
            setLines(items.map(it => ({ item_id: it.item_id, quantity_dispatched: Number(it.quantity), unit: it.unit || 'Kg' })));
        }
    }

    const handleSave = async () => {
        if (!form.contact_id || lines.every(l => !l.item_id)) return
        setSaving(true)
        const valid = lines.filter(l => l.item_id && l.quantity_dispatched > 0)

        const { data: dc, error } = await supabase.schema('mandi').from('delivery_challans').insert({
            organization_id: profile!.organization_id,
            buyer_id: form.contact_id,
            sales_order_id: form.sales_order_id || null,
            challan_date: form.challan_date,
            challan_number: `DC-${Date.now().toString().slice(-6)}`,
            vehicle_number: form.vehicle_number || null,
            driver_name: form.driver_name || null,
            destination: form.destination || null,
            transport_mode: form.transport_mode,
            lr_number: form.lr_number || null,
            status: 'dispatched',
            notes: form.notes || null
        }).select().single()

        if (error || !dc) { console.error(error); setSaving(false); return; }

        const itemsData = valid.map(l => ({
            delivery_challan_id: dc.id,
            item_id: l.item_id,
            quantity_dispatched: l.quantity_dispatched,
            unit: l.unit
        }))

        await supabase.schema('mandi').from('delivery_challan_items').insert(itemsData)

        setSaving(false); setShowForm(false);
        setForm({ contact_id: '', sales_order_id: '', challan_date: new Date().toISOString().split('T')[0], vehicle_number: '', driver_name: '', destination: '', transport_mode: 'Road', lr_number: '', notes: '' });
        setLines([{ item_id: '', quantity_dispatched: 0, unit: 'Kg' }]);
        fetchChallans();
    }

    const filtered = challans.filter(c =>
        !search || c.challan_number.toLowerCase().includes(search.toLowerCase()) || c.buyer?.name?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight italic">Delivery Challans</h1>
                    <p className="text-slate-500 text-sm mt-1">Manage goods dispatch and logistics tracking</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all">
                    <Plus className="w-5 h-5" /> Issue New Challan
                </button>
            </div>

            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    placeholder="Search by challan #, customer or vehicle..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-100 transition-all"
                />
            </div>

            {showForm && (
                <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
                        <Truck className="w-8 h-8 text-emerald-600" />
                        <h2 className="text-xl font-black text-slate-800">New Delivery Dispatch</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Link Sale Order (Auto-fill)</label>
                            <select
                                value={form.sales_order_id}
                                onChange={e => handleOrderSelect(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition-all"
                            >
                                <option value="">Draft (Standalone)</option>
                                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Customer *</label>
                            <select
                                value={form.contact_id}
                                onChange={e => setForm({ ...form, contact_id: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-emerald-100 transition-all"
                            >
                                <option value="">Select Recipient</option>
                                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">Dispatch Date</label>
                            <input
                                type="date"
                                value={form.challan_date}
                                onChange={e => setForm({ ...form, challan_date: e.target.value })}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50/50 rounded-2xl p-6 mb-8 border border-slate-100">
                        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2"><Navigation className="w-3 h-3" /> Logistics & Transport Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <input placeholder="Vehicle Number" value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value })} className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium" />
                            <input placeholder="Driver Name" value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium" />
                            <input placeholder="Destination" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium" />
                            <input placeholder="LR # (Lorry Receipt)" value={form.lr_number} onChange={e => setForm({ ...form, lr_number: e.target.value })} className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium" />
                        </div>
                    </div>

                    <div className="mb-8">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b-2 border-slate-100">
                                    <th className="text-left py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest">Item Description</th>
                                    <th className="text-right py-3 text-[10px] font-black uppercase text-slate-500 tracking-widest w-40">Qty Dispatched</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {lines.map((l, i) => (
                                    <tr key={i} className="group hover:bg-slate-50/30 transition-colors">
                                        <td className="py-2 pr-4">
                                            <select
                                                value={l.item_id}
                                                onChange={e => {
                                                    const u = [...lines];
                                                    u[i].item_id = e.target.value;
                                                    setLines(u);
                                                }}
                                                className="w-full px-4 py-2 bg-transparent border-b border-transparent group-hover:border-slate-200 font-bold outline-none"
                                            >
                                                <option value="">Select Item</option>
                                                {itemsList.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-2 px-1">
                                            <div className="flex items-center gap-2 justify-end">
                                                <input
                                                    type="number"
                                                    value={l.quantity_dispatched || ''}
                                                    onChange={e => {
                                                        const u = [...lines];
                                                        u[i].quantity_dispatched = parseFloat(e.target.value) || 0;
                                                        setLines(u);
                                                    }}
                                                    className="w-24 px-2 py-2 bg-transparent text-right font-black outline-none border-b border-transparent group-hover:border-slate-200"
                                                />
                                                <span className="text-[10px] font-black uppercase text-slate-400">{l.unit}</span>
                                            </div>
                                        </td>
                                        <td><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-1 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-4 h-4" /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button onClick={() => setLines([...lines, { item_id: '', quantity_dispatched: 0, unit: 'Kg' }])} className="mt-4 text-emerald-600 text-[10px] font-black uppercase tracking-widest hover:underline">+ ADD CUSTOM ITEM</button>
                    </div>

                    <div className="flex gap-4 justify-end pt-8 border-t border-slate-100">
                        <button onClick={() => setShowForm(false)} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-black hover:bg-slate-200 transition-all">Discard</button>
                        <button onClick={handleSave} disabled={saving} className="px-12 py-3 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 disabled:opacity-50 shadow-xl shadow-emerald-100 active:scale-95 transition-all">
                            {saving ? 'GENERATING...' : 'GENERATE DISPATCH CHALLAN'}
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <div className="h-10 w-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Verifying Logistics Grid...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-32 bg-emerald-50/20 rounded-3xl border-2 border-dashed border-emerald-100">
                    <Truck className="w-16 h-16 text-emerald-100 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-700">No Dispatches Logged</h3>
                    <p className="text-sm text-slate-400 mt-1">Delivery challans for goods transit will appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filtered.map(dc => (
                        <div key={dc.id} className="group bg-white border border-slate-200 rounded-[2rem] p-6 hover:border-emerald-200 hover:shadow-2xl transition-all cursor-pointer">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                                        <Truck className="w-8 h-8 text-emerald-600 group-hover:text-white transition-colors" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl font-black text-slate-900">{dc.challan_number}</span>
                                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">DISPATCHED</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-1">
                                            <div className="flex items-center gap-1.5 font-black text-slate-700 uppercase tracking-tight"><User className="w-3 h-3 text-slate-400" /> {dc.buyer?.name}</div>
                                            <span className="opacity-30">•</span>
                                            <div className="flex items-center gap-1.5 font-bold text-slate-500"><Clock className="w-3 h-3 text-slate-400" /> {new Date(dc.challan_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                                            <span className="opacity-30">•</span>
                                            <div className="flex items-center gap-1.5 font-bold text-slate-500"><Hash className="w-3 h-3 text-slate-400" /> {dc.items?.length || 0} ITEMS</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-1 md:justify-center border-l border-slate-100 pl-6 h-full items-center">
                                    <div className="flex flex-col">
                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Navigation className="w-3 h-3" /> Route Information</div>
                                        <div className="text-sm font-black text-slate-700 italic tracking-tight">{dc.vehicle_number || 'REG: N/A'} <span className="text-slate-400 font-bold mx-2">→</span> {dc.destination || 'MANDI HUB'}</div>
                                    </div>
                                </div>

                                <button className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all">
                                    <Info className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
