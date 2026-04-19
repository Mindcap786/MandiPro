'use client'

import { useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import { DataTable } from '@/components/ui/data-table'
import { Plus, Users, Search, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuth } from '@/components/auth/auth-provider'
import { useCachedFarmers } from '@/hooks/use-cached-lists'

export default function FarmersPage() {
    const { user, profile } = useAuth()
    const { data: farmers, loading, refresh: fetchFarmers } = useCachedFarmers(profile?.organization_id)
    const [search, setSearch] = useState('')
    const [modalOpen, setModalOpen] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        village: '',
        type: 'farmer',
        trading_model: 'commission'
    })
    const [submitting, setSubmitting] = useState(false)

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault()
        if (!profile?.organization_id) return

        setSubmitting(true)
        try {
            const { error } = await supabase.schema('mandi').from('contacts').insert({
                organization_id: profile.organization_id,
                name: formData.name,
                phone: formData.phone,
                city: formData.village,
                type: 'supplier',
                metadata: { trading_model: formData.trading_model }
            })

            if (error) throw error

            setModalOpen(false)
            setFormData({
                name: '',
                phone: '',
                village: '',
                type: 'farmer',
                trading_model: 'commission'
            })
            fetchFarmers()

        } catch (err: any) {
            console.error('Error saving farmer:', err)
            alert('Error saving farmer: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const filteredFarmers = farmers.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.city?.toLowerCase().includes(search.toLowerCase()) ||
        f.phone?.includes(search)
    )

    const columns = [
        { header: 'Type', accessorKey: (row: any) => <span className="capitalize text-gray-400 text-[10px] border border-gray-800 px-2 py-0.5 rounded uppercase font-black tracking-widest">{row.type}</span> },
        { header: 'Name', accessorKey: 'name', className: 'text-white font-bold' },
        { header: 'Village', accessorKey: 'city', className: 'text-gray-400' },
        { header: 'Phone', accessorKey: 'phone', className: 'text-gray-400' },
        { header: 'Model', accessorKey: (row: any) => <span className={`text-[10px] uppercase font-black px-2 py-1 rounded tracking-tighter ${row.metadata?.trading_model === 'self_purchase' ? 'bg-purple-900/30 text-neon-purple border border-neon-purple/20' : 'bg-blue-900/30 text-neon-blue border border-neon-blue/20'}`}>{row.metadata?.trading_model?.replace('_', ' ') || 'COMMISSION'}</span> },
        { header: 'Balance', accessorKey: (row: any) => <span className={`font-mono font-bold ${row.account_balance < 0 ? 'text-red-400' : 'text-neon-green'}`}>₹{row.account_balance || 0}</span> }
    ]

    return (
        <div className="p-8">
            <header className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-neon-green tracking-tight mb-2">Farmers / Suppliers</h1>
                    <p className="text-gray-400 flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        Manage your suppliers and their account details.
                    </p>
                </div>

                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                    <DialogTrigger asChild>
                        <button className="bg-neon-green text-black font-bold px-6 py-2 rounded-md hover:bg-green-400 transition-colors shadow-[0_0_15px_rgba(57,255,20,0.3)] flex items-center">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Farmer
                        </button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-900 border-gray-800 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-neon-green">Onboard New {formData.type === 'farmer' ? 'Farmer' : 'Supplier'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 mt-4">
                            {/* Type & Model Selection */}
                            <div className="flex bg-gray-800 p-1 rounded-lg">
                                <button
                                    type="button"
                                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${formData.type === 'farmer' ? 'bg-neon-green text-black' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => setFormData({ ...formData, type: 'farmer' })}
                                >
                                    Farmer
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${formData.type === 'supplier' ? 'bg-neon-green text-black' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => setFormData({ ...formData, type: 'supplier' })}
                                >
                                    Supplier
                                </button>
                            </div>

                            <div className="flex bg-gray-800 p-1 rounded-lg">
                                <button
                                    type="button"
                                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${formData.trading_model === 'commission' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => setFormData({ ...formData, trading_model: 'commission' })}
                                >
                                    Commission Based
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${formData.trading_model === 'self_purchase' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => setFormData({ ...formData, trading_model: 'self_purchase' })}
                                >
                                    Self Purchase
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                                <input
                                    required
                                    className="w-full bg-black border border-gray-700 rounded p-2 text-white focus:border-neon-green outline-none"
                                    placeholder={`e.g. ${formData.type === 'farmer' ? 'Ramesh Kumar' : 'ABC Traders'}`}
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Village / Location</label>
                                <input
                                    required
                                    className="w-full bg-black border border-gray-700 rounded p-2 text-white focus:border-neon-green outline-none"
                                    placeholder="e.g. Nashik"
                                    value={formData.village}
                                    onChange={e => setFormData({ ...formData, village: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
                                <input
                                    className="w-full bg-black border border-gray-700 rounded p-2 text-white focus:border-neon-green outline-none"
                                    placeholder="e.g. 9876543210"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <button disabled={submitting} type="submit" className="w-full bg-neon-green text-black font-bold py-2 rounded hover:bg-green-400 transition-colors mt-4">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save ' + (formData.type === 'farmer' ? 'Farmer' : 'Supplier')}
                            </button>
                        </form>
                    </DialogContent>
                </Dialog>
            </header>

            <div className="flex items-center space-x-4 mb-6 bg-gray-900 p-2 rounded-lg border border-gray-800 w-full max-w-md">
                <Search className="w-5 h-5 text-gray-500 ml-2" />
                <input
                    className="bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 w-full outline-none"
                    placeholder="Search by name, village or phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-neon-green animate-spin" /></div>
            ) : (
                <DataTable columns={columns} data={filteredFarmers} />
            )}
        </div>
    )
}
