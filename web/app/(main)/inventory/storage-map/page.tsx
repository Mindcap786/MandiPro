'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Box, Snowflake, Loader2 } from 'lucide-react'

import { AssignLotModal } from '@/components/inventory/assign-lot-modal'
import { supabase } from '@/lib/supabaseClient'

// 4x5 Grid = 20 Racks
const TOTAL_RACKS = 20
const RACK_IDS = Array.from({ length: TOTAL_RACKS }, (_, i) => `RACK-${i + 1}`)

export default function StorageMapPage() {
    const router = useRouter()
    const [rackData, setRackData] = useState<any>({}) // Map: RackID -> Lot
    const [loading, setLoading] = useState(true)
    const [selectedRackId, setSelectedRackId] = useState<string | null>(null)
    const [isAssigning, setIsAssigning] = useState(false)

    // Fetch Map Data
    useEffect(() => {
        fetchRacks()
    }, [])

    async function fetchRacks() {
        setLoading(true)
        // Fetch lots that have a rack assigned
        const { data, error } = await supabase
            .schema('mandi')
            .from('lots')
            .select('*')
            .not('cold_storage_rack', 'is', null)

        if (data) {
            const map: any = {}
            data.forEach((lot: any) => {
                if (lot.cold_storage_rack) {
                    map[lot.cold_storage_rack] = lot
                }
            })
            setRackData(map)
        }
        setLoading(false)
    }

    const handleAssign = async (lot: any) => {
        if (!selectedRackId) return

        // Optimistic Update
        const newMap = { ...rackData, [selectedRackId]: lot }
        setRackData(newMap)
        setIsAssigning(false)

        // DB Update
        const { error } = await supabase
            .schema('mandi')
            .from('lots')
            .update({ cold_storage_rack: selectedRackId, status: 'storage' })
            .eq('id', lot.id)

        if (error) {
            console.error('Error assigning rack:', error)
            alert('Failed to assign rack')
            fetchRacks() // Revert
        }
    }

    const handleEmpty = async () => {
        if (!selectedRackId) return
        const lot = rackData[selectedRackId]
        if (!lot) return

        // Optimistic Update
        const newMap = { ...rackData }
        delete newMap[selectedRackId]
        setRackData(newMap)

        // DB Update
        const { error } = await supabase
            .schema('mandi')
            .from('lots')
            .update({ cold_storage_rack: null, status: 'active' }) // Set back to active floor
            .eq('id', lot.id)

        if (error) {
            console.error('Error emptying rack:', error)
            fetchRacks() // Revert
        }
    }

    const selectedLot = selectedRackId ? rackData[selectedRackId] : null

    return (
        <div className="p-8">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-neon-green tracking-tight">Cold Storage Map</h1>
                    <p className="text-gray-400">Real-time occupancy of Chamber A.</p>
                </div>
                {loading && <Loader2 className="w-5 h-5 animate-spin text-neon-green" />}
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Map */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
                    <h3 className="text-lg font-medium mb-6 flex items-center text-white">
                        <Snowflake className="w-5 h-5 mr-2 text-blue-400" />
                        Chamber A (Temperature Controlled)
                    </h3>

                    <div className="grid grid-cols-5 gap-4">
                        {RACK_IDS.map((rackId) => {
                            const lot = rackData[rackId]
                            const isSelected = selectedRackId === rackId
                            return (
                                <div
                                    key={rackId}
                                    onClick={() => setSelectedRackId(rackId)}
                                    className={`
                                            aspect-square rounded-md flex flex-col items-center justify-center cursor-pointer transition-all border
                                            ${lot
                                            ? 'bg-neon-green/10 border-neon-green text-neon-green hover:bg-neon-green/20'
                                            : 'bg-black border-gray-800 text-gray-600 hover:border-gray-500 hover:text-gray-400'}
                                            ${isSelected ? 'ring-2 ring-white scale-105 shadow-glow' : ''}
                                        `}
                                >
                                    <span className="text-xs font-bold">{rackId.replace('RACK-', '')}</span>
                                    {lot && <Box className="w-6 h-6 mt-1" />}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-neon-green/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                    {selectedRackId ? (
                        <div className="space-y-6 relative z-10">
                            <div className="border-b border-gray-800 pb-4">
                                <h2 className="text-3xl font-bold text-white">{selectedRackId}</h2>
                                <p className="text-blue-400 flex items-center text-sm mt-1 font-mono">
                                    <Snowflake className="w-3 h-3 mr-1" />
                                    4°C Zone
                                </p>
                            </div>

                            <div className="p-6 bg-black rounded-lg border border-gray-800">
                                {selectedLot ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 text-sm">Lot Code</span>
                                            <span className="font-mono text-neon-green text-lg">{selectedLot.lot_code}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 text-sm">Item</span>
                                            <span className="font-bold text-white">{selectedLot.item_type}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 text-sm">Qty</span>
                                            <span className="text-white font-mono">{selectedLot.current_quantity} {selectedLot.unit_type}</span>
                                        </div>

                                        <div className="pt-4 border-t border-gray-800">
                                            <button
                                                onClick={handleEmpty}
                                                className="w-full bg-red-900/20 text-red-500 border border-red-900/50 py-3 rounded-md font-bold hover:bg-red-900/40 transition-colors"
                                            >
                                                MOVE TO FLOOR / EMPTY
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-800">
                                            <Box className="w-8 h-8 text-gray-600" />
                                        </div>
                                        <p className="text-gray-400 mb-6">This rack is currently empty.</p>
                                        <button
                                            onClick={() => setIsAssigning(true)}
                                            className="bg-white text-black px-8 py-3 rounded-md font-bold hover:bg-neon-green hover:border-neon-green hover:text-black transition-all shadow-glow"
                                        >
                                            ASSIGN LOT
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500">
                            <Box className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select a rack to manage inventory</p>
                        </div>
                    )}
                </div>
            </div>

            {isAssigning && selectedRackId && (
                <AssignLotModal
                    rackId={selectedRackId}
                    onClose={() => setIsAssigning(false)}
                    onAssign={handleAssign}
                />
            )}
        </div>
    )
}
