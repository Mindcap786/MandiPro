'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import {
    Plus, ArrowRight, Trash2, Package, MapPin, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useToast } from '@/hooks/use-toast'

type Location = {
    id: string; name: string; location_type: string; address: string | null
    is_active: boolean; is_default: boolean
}
type Transfer = {
    id: string; transfer_number: string; transfer_date: string; status: string; notes: string | null
    from_location: { id: string; name: string } | null
    to_location: { id: string; name: string } | null
    items: { id: string }[]
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    warehouse: { label: 'Warehouse', color: 'bg-blue-50 text-blue-600 border-blue-100' },
    shop: { label: 'Retail Shop', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    transit: { label: 'Transit Hub', color: 'bg-amber-50 text-amber-600 border-amber-100' },
    virtual: { label: 'Virtual / Cloud', color: 'bg-purple-50 text-purple-600 border-purple-100' },
}

const STATUS_COLORS: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-600',
    'In Transit': 'bg-blue-50 text-blue-600',
    Received: 'bg-emerald-50 text-emerald-600',
    Cancelled: 'bg-red-50 text-red-600'
}

export default function WarehousePage() {
    const { profile } = useAuth()
    const { toast } = useToast()
    const isMandi = profile?.business_domain === 'mandi'
    const [locations, setLocations] = useState<Location[]>([])
    const [transfers, setTransfers] = useState<Transfer[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'locations' | 'transfers'>('locations')

    // Location form
    const [newLoc, setNewLoc] = useState({ name: '', location_type: 'warehouse', address: '' })
    const [saving, setSaving] = useState(false)
    const [editingLocId, setEditingLocId] = useState<string | null>(null)
    const [editingLoc, setEditingLoc] = useState({ name: '', type: 'warehouse', address: '' })

    // Transfer form
    const [showTransfer, setShowTransfer] = useState(false)
    const [itemsList, setItemsList] = useState<any[]>([])
    const [transferForm, setTransferForm] = useState({ from_location_id: '', to_location_id: '', notes: '' })
    const [transferLines, setTransferLines] = useState([{ item_id: '', quantity: 0, unit: 'Kg' }])

    useEffect(() => {
        if (profile?.organization_id) {
            fetchLocations()
            fetchTransfers()
            const table = isMandi ? 'commodities' : 'items'
            const schema = isMandi ? 'mandi' : 'public'
            supabase.schema(schema).from(table).select('id,name,default_unit').eq('organization_id', profile.organization_id).order('name').then(({ data }) => setItemsList(data || []))
        }
    }, [profile?.organization_id])

    const fetchLocations = async () => {
        const { data } = await supabase.schema('mandi').from('storage_locations').select('*').eq('organization_id', profile!.organization_id).order('name')
        setLocations(data || [])
    }

    const fetchTransfers = async () => {
        setLoading(true)
        const { data } = await supabase.schema('mandi').from('stock_transfers')
            .select('*, from_location:storage_locations!from_location_id(id,name), to_location:storage_locations!to_location_id(id,name), items:stock_transfer_items(id)')
            .eq('organization_id', profile!.organization_id).order('created_at', { ascending: false })
        setTransfers((data as any) || [])
        setLoading(false)
    }

    const addLocation = async () => {
        if (!newLoc.name.trim()) return
        if (locations.length >= 20) { toast({ title: 'Max 20 locations allowed', variant: 'destructive' }); return }
        setSaving(true)
        const { data, error } = await supabase.schema('mandi').from('storage_locations')
            .insert({ organization_id: profile!.organization_id, name: newLoc.name.trim(), location_type: newLoc.location_type, address: newLoc.address || null })
            .select().single()
        if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' })
        else { setLocations(prev => [...prev, data]); toast({ title: `"${data.name}" added!` }) }
        setNewLoc({ name: '', location_type: 'warehouse', address: '' })
        setSaving(false)
    }

    const toggleLocationStatus = async (id: string, current: boolean) => {
        const { error } = await supabase.schema('mandi').from('storage_locations').update({ is_active: !current }).eq('id', id)
        if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' })
        else setLocations(prev => prev.map(l => l.id === id ? { ...l, is_active: !current } : l))
    }

    const startRename = (loc: Location) => {
        setEditingLocId(loc.id)
        setEditingLoc({ name: loc.name, type: loc.location_type || 'warehouse', address: loc.address || '' })
    }

    const saveRename = async (id: string) => {
        if (!editingLoc.name.trim()) return
        const { error } = await supabase.schema('mandi').from('storage_locations').update({ name: editingLoc.name.trim(), location_type: editingLoc.type, address: editingLoc.address.trim() || null }).eq('id', id)
        if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return }
        setLocations(prev => prev.map(l => l.id === id ? { ...l, name: editingLoc.name.trim(), location_type: editingLoc.type, address: editingLoc.address.trim() } : l))
        setEditingLocId(null)
        toast({ title: 'Updated!' })
    }

    const deleteLocation = async (id: string) => {
        if (!confirm('Remove this storage point?')) return
        const { error } = await supabase.schema('mandi').from('storage_locations').delete().eq('id', id)
        if (error) toast({ title: 'Cannot delete', description: error.message, variant: 'destructive' })
        else setLocations(prev => prev.filter(l => l.id !== id))
    }

    const createTransfer = async () => {
        if (!transferForm.from_location_id || !transferForm.to_location_id) return
        setSaving(true)
        const num = `ST-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
        const { data: st, error } = await supabase.schema('mandi').from('stock_transfers').insert({
            organization_id: profile!.organization_id, transfer_number: num,
            transfer_date: new Date().toISOString().split('T')[0],
            from_location_id: transferForm.from_location_id, to_location_id: transferForm.to_location_id,
            notes: transferForm.notes || null, status: 'Draft',
        }).select().single()
        if (error || !st) { toast({ title: 'Error', description: error?.message, variant: 'destructive' }); setSaving(false); return }
        const valid = transferLines.filter(l => l.item_id && l.quantity > 0)
        if (valid.length > 0) await supabase.schema('mandi').from('stock_transfer_items').insert(valid.map(l => ({ stock_transfer_id: st.id, item_id: l.item_id, quantity: l.quantity, unit: l.unit })))
        setSaving(false); setShowTransfer(false)
        setTransferForm({ from_location_id: '', to_location_id: '', notes: '' })
        setTransferLines([{ item_id: '', quantity: 0, unit: 'Kg' }])
        toast({ title: `Transfer ${num} created!` })
        fetchTransfers()
    }

    const isOnlyDefault = (loc: Location) => loc.name === 'Mandi (Yard)'

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-8 pb-32">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-3xl font-[1000] tracking-tighter text-black uppercase flex items-center gap-3">
                            <MapPin className="w-8 h-8 text-indigo-600" /> Storage <span className="text-indigo-600">Points</span>
                        </h1>
                        <p className="text-slate-500 font-bold text-sm mt-1">Manage locations and stock transfers · Max 20 points</p>
                    </div>
                    <Button onClick={() => setShowTransfer(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-wider h-12 px-5 rounded-2xl shadow-md">
                        <ArrowRight className="w-4 h-4 mr-2" /> New Transfer
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                    {(['locations', 'transfers'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} className={cn(
                            'px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
                            tab === t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        )}>
                            {t === 'locations' ? `Locations (${locations.length})` : `Transfers (${transfers.length})`}
                        </button>
                    ))}
                </div>

                {/* Locations Tab */}
                {tab === 'locations' && (
                    <div className="space-y-6">
                        {/* Add Location Form — Wholesale Pro only (MandiGrow manages from Governance > Storage Points) */}
                        {!isMandi && (
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Add New Storage Point</p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input value={newLoc.name} onChange={e => setNewLoc({ ...newLoc, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addLocation()}
                                        placeholder="Warehouse/Shop Name" maxLength={40}
                                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 col-span-1" />
                                    <select value={newLoc.location_type} onChange={e => setNewLoc({ ...newLoc, location_type: e.target.value })}
                                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                        <option value="warehouse">Warehouse</option>
                                        <option value="shop">Retail Shop</option>
                                        <option value="transit">Transit Hub</option>
                                        <option value="virtual">Virtual / Cloud</option>
                                    </select>
                                    <input value={newLoc.address} onChange={e => setNewLoc({ ...newLoc, address: e.target.value })}
                                        placeholder="Address (Optional)" maxLength={100}
                                        className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                    <Button onClick={addLocation} disabled={!newLoc.name.trim() || saving || locations.length >= 20}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-black h-12 rounded-2xl shadow-md">
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Location Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {locations.sort((a, b) => isOnlyDefault(a) ? -1 : isOnlyDefault(b) ? 1 : 0).map(loc => {
                                const isDefault = isOnlyDefault(loc)
                                const isEditing = editingLocId === loc.id
                                const typeInfo = TYPE_LABELS[loc.location_type] || TYPE_LABELS.warehouse
                                return (
                                    <motion.div key={loc.id} layout
                                        className={cn(
                                            'bg-white p-6 rounded-[28px] border shadow-sm flex flex-col justify-between min-h-[160px] relative overflow-hidden group transition-all',
                                            isDefault ? 'border-indigo-200 bg-indigo-50/20' : 'border-slate-200',
                                            !loc.is_active && 'opacity-60 grayscale bg-slate-50'
                                        )}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 mr-2 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn('w-2 h-2 rounded-full', loc.is_active ? 'bg-indigo-500' : 'bg-slate-300', isDefault && loc.is_active && 'animate-pulse')} />
                                                    <span className={cn('text-[8px] font-black uppercase tracking-widest', isDefault ? 'text-indigo-500' : 'text-slate-400')}>
                                                        {isDefault ? 'System Default' : (loc.is_active ? typeInfo.label : 'Offline')}
                                                    </span>
                                                </div>
                                                {isEditing ? (
                                                    <div className="space-y-2 mt-1">
                                                        <Input autoFocus value={editingLoc.name} onChange={e => setEditingLoc({ ...editingLoc, name: e.target.value })}
                                                            className="text-sm font-black border-indigo-300 bg-white h-9" maxLength={40} />
                                                        <select value={editingLoc.type} onChange={e => setEditingLoc({ ...editingLoc, type: e.target.value })}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-slate-50">
                                                            <option value="warehouse">Warehouse</option>
                                                            <option value="shop">Retail Shop</option>
                                                            <option value="transit">Transit Hub</option>
                                                            <option value="virtual">Virtual / Cloud</option>
                                                        </select>
                                                        <Input value={editingLoc.address} onChange={e => setEditingLoc({ ...editingLoc, address: e.target.value })}
                                                            placeholder="Address" className="h-9 text-[11px]" />
                                                        <div className="flex gap-2">
                                                            <Button size="sm" onClick={() => saveRename(loc.id)} className="bg-indigo-600 h-8 flex-1 text-xs">✓ Save</Button>
                                                            <Button size="sm" variant="outline" onClick={() => setEditingLocId(null)} className="h-8 flex-1 text-xs">✕</Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <h3 className="text-lg font-black text-slate-800 tracking-tight break-words leading-tight">{loc.name}</h3>
                                                        {loc.address && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{loc.address}</p>}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Hover Actions */}
                                            {!isEditing && (
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button onClick={() => startRename(loc)} className="p-1.5 rounded-xl hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors" title="Rename">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    {!isDefault && (
                                                        <button onClick={() => deleteLocation(loc.id)} className="p-1.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-5 flex items-center justify-between">
                                            <span className="text-[9px] font-mono text-slate-300 uppercase tracking-widest">
                                                {isDefault ? 'ID: SYS' : `ID: ${loc.id.split('-')[0]}`}
                                            </span>
                                            <Switch checked={loc.is_active} onCheckedChange={() => toggleLocationStatus(loc.id, loc.is_active)}
                                                className="data-[state=checked]:bg-indigo-600" />
                                        </div>
                                    </motion.div>
                                )
                            })}
                            {locations.length === 0 && (
                                <div className="col-span-3 py-20 text-center border border-dashed border-slate-200 rounded-[32px] bg-slate-50">
                                    <Package className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                    <p className="font-black uppercase tracking-widest text-slate-400 text-xs">No Storage Points Deployed</p>
                                    <p className="text-slate-400 text-[10px] mt-1">Add your first warehouse above</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Transfers Tab */}
                {tab === 'transfers' && (
                    <div className="space-y-4">
                        {/* New Transfer Form */}
                        {showTransfer && (
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">New Stock Transfer</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">From *</label>
                                        <select value={transferForm.from_location_id} onChange={e => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-black">
                                            <option value="">Select Location</option>
                                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">To *</label>
                                        <select value={transferForm.to_location_id} onChange={e => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-black">
                                            <option value="">Select Location</option>
                                            {locations.filter(l => l.id !== transferForm.from_location_id).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Notes</label>
                                        <input value={transferForm.notes} onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-black" />
                                    </div>
                                </div>
                                <table className="w-full text-sm">
                                    <thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                                        <th className="text-left py-2">Item</th><th className="text-right py-2 w-24">Qty</th><th className="text-left py-2 w-20 pl-2">Unit</th><th className="w-8"></th>
                                    </tr></thead>
                                    <tbody>{transferLines.map((l, i) => (
                                        <tr key={i} className="border-b border-slate-100">
                                            <td className="py-1.5 pr-2">
                                                <select value={l.item_id} onChange={e => { const u = [...transferLines]; u[i] = { ...u[i], item_id: e.target.value }; const it = itemsList.find((x: any) => x.id === e.target.value); if (it) u[i].unit = it.default_unit || 'Kg'; setTransferLines(u) }}
                                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                                    <option value="">Select</option>{itemsList.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="py-1.5 px-1"><input type="number" value={l.quantity || ''} onChange={e => { const u = [...transferLines]; u[i].quantity = parseFloat(e.target.value) || 0; setTransferLines(u) }} className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right" /></td>
                                            <td className="py-1.5 px-1 text-sm text-slate-600 font-bold">{l.unit}</td>
                                            <td><button onClick={() => transferLines.length > 1 && setTransferLines(transferLines.filter((_, j) => j !== i))} className="p-1 text-red-400"><Trash2 className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                                <div className="flex justify-between items-center pt-2">
                                    <button onClick={() => setTransferLines([...transferLines, { item_id: '', quantity: 0, unit: 'Kg' }])} className="text-indigo-600 text-xs font-black uppercase tracking-wider">+ Add Item</button>
                                    <div className="flex gap-3">
                                        <button onClick={() => setShowTransfer(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">Cancel</button>
                                        <button onClick={createTransfer} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">{saving ? 'Creating...' : 'Create Transfer'}</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                        ) : transfers.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-slate-200 rounded-[32px] bg-slate-50">
                                <ArrowRight className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                <p className="font-black uppercase tracking-widest text-slate-400 text-xs">No Transfers Yet</p>
                                <button onClick={() => setShowTransfer(true)} className="mt-4 text-indigo-600 text-xs font-black uppercase tracking-wider">Create First Transfer →</button>
                            </div>
                        ) : transfers.map(t => (
                            <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 rounded-xl bg-indigo-50"><ArrowRight className="w-5 h-5 text-indigo-600" /></div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-slate-800">{t.transfer_number}</span>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[t.status] || ''}`}>{t.status}</span>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                <span className="font-bold">{t.from_location?.name}</span> → <span className="font-bold">{t.to_location?.name}</span>
                                                <span className="mx-2">·</span>{new Date(t.transfer_date).toLocaleDateString('en-IN')}
                                                <span className="mx-2">·</span>{t.items?.length || 0} items
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
