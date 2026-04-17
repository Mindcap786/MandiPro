'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { Plus, Search, Tags, Trash2, Edit2, CheckCircle2 } from 'lucide-react'

type PriceList = {
    id: string; name: string; description: string | null; is_default: boolean; is_active: boolean
    items: PriceListItem[]
}
type PriceListItem = {
    id: string; item_id: string; unit_price: number; min_quantity: number
    item?: { id: string; name: string }
}

export default function PriceListsPage() {
    const { profile } = useAuth()
    const [lists, setLists] = useState<PriceList[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [items, setItems] = useState<any[]>([])
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({ name: '', description: '', is_default: false })
    const [priceItems, setPriceItems] = useState([{ item_id: '', unit_price: 0, min_quantity: 0 }])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchLists()
            supabase.schema('mandi').from('items').select('id,name,sale_price').eq('organization_id', profile.organization_id).order('name').then(({ data }) => setItems(data || []))
        }
    }, [profile?.organization_id])

    const fetchLists = async () => {
        setLoading(true)
        const { data } = await supabase.schema('mandi').from('price_lists')
            .select('*, items:price_list_items(id, item_id, unit_price, min_quantity, item:items(id,name))')
            .eq('organization_id', profile!.organization_id).order('name')
        setLists((data as any) || [])
        setLoading(false)
    }

    const handleSave = async () => {
        if (!form.name) return
        setSaving(true)

        if (editingId) {
            await supabase.schema('mandi').from('price_lists').update({ name: form.name, description: form.description || null, is_default: form.is_default, updated_at: new Date().toISOString() }).eq('id', editingId)
            await supabase.schema('mandi').from('price_list_items').delete().eq('price_list_id', editingId)
            const valid = priceItems.filter(p => p.item_id && p.unit_price > 0)
            if (valid.length > 0) {
                await supabase.schema('mandi').from('price_list_items').insert(valid.map(p => ({ price_list_id: editingId, item_id: p.item_id, unit_price: p.unit_price, min_quantity: p.min_quantity })))
            }
        } else {
            const { data: pl, error } = await supabase.schema('mandi').from('price_lists').insert({
                organization_id: profile!.organization_id, name: form.name,
                description: form.description || null, is_default: form.is_default,
            }).select().single()
            if (error || !pl) { alert('Error: ' + (error?.message || '')); setSaving(false); return }
            const valid = priceItems.filter(p => p.item_id && p.unit_price > 0)
            if (valid.length > 0) {
                await supabase.schema('mandi').from('price_list_items').insert(valid.map(p => ({ price_list_id: pl.id, item_id: p.item_id, unit_price: p.unit_price, min_quantity: p.min_quantity })))
            }
        }

        setSaving(false); setShowForm(false); setEditingId(null)
        setForm({ name: '', description: '', is_default: false })
        setPriceItems([{ item_id: '', unit_price: 0, min_quantity: 0 }])
        fetchLists()
    }

    const editList = (pl: PriceList) => {
        setEditingId(pl.id)
        setForm({ name: pl.name, description: pl.description || '', is_default: pl.is_default })
        setPriceItems(pl.items.length > 0 ? pl.items.map(i => ({ item_id: i.item_id, unit_price: i.unit_price, min_quantity: i.min_quantity })) : [{ item_id: '', unit_price: 0, min_quantity: 0 }])
        setShowForm(true)
    }

    const deleteList = async (id: string) => {
        if (!confirm('Delete this price list?')) return
        await supabase.schema('mandi').from('price_list_items').delete().eq('price_list_id', id)
        await supabase.schema('mandi').from('price_lists').delete().eq('id', id)
        fetchLists()
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Price Lists</h1>
                    <p className="text-slate-500 text-sm mt-1">Create customer-tier pricing for your products</p>
                </div>
                <button onClick={() => { setEditingId(null); setForm({ name: '', description: '', is_default: false }); setPriceItems([{ item_id: '', unit_price: 0, min_quantity: 0 }]); setShowForm(!showForm) }} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-100">
                    <Plus className="w-4 h-4" /> New Price List
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-lg">
                    <h2 className="text-lg font-black text-slate-800 mb-6">{editingId ? 'Edit' : 'Create'} Price List</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div><label className="text-[10px] font-bold uppercase text-slate-500">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dealer Price" className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" /></div>
                        <div><label className="text-[10px] font-bold uppercase text-slate-500">Description</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium" /></div>
                        <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="rounded border-slate-300" /><span className="text-sm font-bold text-slate-700">Set as Default</span></label></div>
                    </div>

                    <h3 className="text-sm font-black text-slate-700 mb-3">Item Prices</h3>
                    <table className="w-full text-sm mb-4">
                        <thead><tr className="border-b border-slate-200">
                            <th className="text-left py-2 text-[10px] font-bold uppercase text-slate-500">Item</th>
                            <th className="text-right py-2 text-[10px] font-bold uppercase text-slate-500 w-32">Unit Price (₹)</th>
                            <th className="text-right py-2 text-[10px] font-bold uppercase text-slate-500 w-28">Min Qty</th><th className="w-10"></th>
                        </tr></thead>
                        <tbody>{priceItems.map((p, i) => (
                            <tr key={i} className="border-b border-slate-100">
                                <td className="py-2 pr-2"><select value={p.item_id} onChange={e => { const u = [...priceItems]; u[i] = { ...u[i], item_id: e.target.value }; const it = items.find((x: any) => x.id === e.target.value); if (it) u[i].unit_price = it.sale_price || 0; setPriceItems(u) }} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"><option value="">Select</option>{items.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}</select></td>
                                <td className="py-2 px-1"><input type="number" value={p.unit_price || ''} onChange={e => { const u = [...priceItems]; u[i].unit_price = parseFloat(e.target.value) || 0; setPriceItems(u) }} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right" /></td>
                                <td className="py-2 px-1"><input type="number" value={p.min_quantity || ''} onChange={e => { const u = [...priceItems]; u[i].min_quantity = parseFloat(e.target.value) || 0; setPriceItems(u) }} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right" /></td>
                                <td><button onClick={() => priceItems.length > 1 && setPriceItems(priceItems.filter((_, j) => j !== i))} className="p-1 text-red-400"><Trash2 className="w-4 h-4" /></button></td>
                            </tr>
                        ))}</tbody>
                    </table>
                    <div className="flex items-center justify-between">
                        <button onClick={() => setPriceItems([...priceItems, { item_id: '', unit_price: 0, min_quantity: 0 }])} className="text-indigo-600 text-xs font-bold uppercase tracking-wider">+ Add Item</button>
                        <div className="flex gap-3">
                            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : lists.length === 0 ? (
                <div className="text-center py-20">
                    <Tags className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-600">No Price Lists</h3>
                    <p className="text-sm text-slate-400 mt-1">Create tiered pricing for different customer segments</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lists.map(pl => (
                        <div key={pl.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-all group">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-800 text-lg">{pl.name}</span>
                                        {pl.is_default && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">DEFAULT</span>}
                                    </div>
                                    {pl.description && <p className="text-xs text-slate-500 mt-1">{pl.description}</p>}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => editList(pl)} className="p-2 rounded-lg hover:bg-slate-50 text-slate-400"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => deleteList(pl.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 font-bold">{pl.items?.length || 0} items priced</div>
                            {pl.items?.slice(0, 5).map(pi => (
                                <div key={pi.id} className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
                                    <span className="text-sm text-slate-700">{pi.item?.name || 'Unknown'}</span>
                                    <span className="font-bold text-slate-800 text-sm">₹{pi.unit_price?.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                            {(pl.items?.length || 0) > 5 && <div className="text-xs text-indigo-600 mt-2 font-bold">+{pl.items.length - 5} more items</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
