'use client'

import { X, Box, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface AssignLotModalProps {
    rackId: string
    onClose: () => void
    onAssign: (lot: any) => void
}

export function AssignLotModal({ rackId, onClose, onAssign }: AssignLotModalProps) {
    const [lots, setLots] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchAvailableLots() {
            setLoading(true)
            // Fetch lots that are active AND not yet in storage
            const { data, error } = await supabase
                .schema('mandi')
                .from('lots')
                .select('*, contacts(name), commodities(name)')
                .eq('status', 'active')
                .is('cold_storage_rack', null)

            if (data) {
                setLots(data)
            }
            setLoading(false)
        }
        fetchAvailableLots()
    }, [])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-white">Assign Lot to {rackId}</h3>
                        <p className="text-sm text-gray-400">Select active lot from floor</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* List */}
                <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-neon-green" />
                        </div>
                    ) : lots.length > 0 ? (
                        lots.map((lot) => (
                            <button
                                key={lot.id}
                                onClick={() => onAssign(lot)}
                                className="w-full text-left p-4 bg-black border border-gray-800 rounded-lg hover:border-neon-green/50 hover:bg-neon-green/5 transition-all group group-hover:shadow-[0_0_15px_rgba(0,255,0,0.1)]"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-mono text-neon-green font-bold text-lg">{lot.lot_code}</span>
                                    <span className="bg-gray-800 text-xs px-2 py-1 rounded text-gray-300">
                                        {lot.current_qty} {lot.unit}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-400">
                                    <span className="font-bold text-white">{lot.commodities?.name}</span>
                                    <span>{lot.contacts?.name || 'Unknown Farmer'}</span>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <Box className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>No active lots found on the floor.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-black/50 text-center">
                    <p className="text-xs text-gray-500">Only showing unassigned active lots</p>
                </div>
            </div>
        </div>
    )
}
