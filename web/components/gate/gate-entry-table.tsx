'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Search, Filter, Printer, MoreHorizontal, ArrowUpDown, Truck, Package, Layers } from 'lucide-react'

// Define the shape of our Gate Entry (Lot) data
interface GateEntry {
    id: string
    lot_code: string
    truck_number: string | null
    driver_name: string | null
    driver_phone: string | null
    item_type: string
    grade: string | null
    initial_qty: number
    unit_type: string
    created_at: string
    status: string
}

export function GateEntryTable({ data }: { data: GateEntry[] }) {
    const [searchTerm, setSearchTerm] = useState('')

    // Filter data based on search
    const filteredData = data.filter(entry =>
        entry.truck_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.lot_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.item_type.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Toolkit Bar */}
            <div className="glass-panel p-2 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 bg-black/40 p-2 rounded-xl border border-white/5 shadow-inner">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neon-blue" />
                        <input
                            type="text"
                            placeholder="Search Truck, Lot Code, or Item..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-transparent border-none pl-12 pr-4 py-3 text-sm font-medium text-white placeholder-gray-500 focus:ring-0 outline-none"
                        />
                    </div>
                    <div className="h-6 w-px bg-white/10"></div>
                    <button className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-white px-4 py-2 rounded-lg hover:bg-white/5 transition-all">
                        <Filter className="w-4 h-4" />
                        <span>Filter</span>
                    </button>
                </div>

                <div className="hidden md:flex items-center gap-3 px-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse"></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            Live Feed
                        </span>
                    </div>
                    <span className="bg-white/5 px-3 py-1 rounded-full text-xs font-mono text-neon-blue border border-white/10">
                        {filteredData.length} Active
                    </span>
                </div>
            </div>

            {/* Cards Grid for better visibility */}
            <div className="grid grid-cols-1 gap-4">
                {filteredData.length > 0 ? (
                    filteredData.map((entry) => (
                        <div key={entry.id} className="glass-panel p-6 rounded-2xl hover:border-neon-blue/30 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-full -mr-12 -mt-12 pointer-events-none group-hover:bg-neon-blue/10 transition-colors"></div>

                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                                {/* Left: Time & Lot */}
                                <div className="flex items-center gap-6 w-full md:w-auto">
                                    <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                                        <span className="text-sm font-bold text-gray-400 uppercase">{format(new Date(entry.created_at), 'MMM')}</span>
                                        <span className="text-2xl font-black text-white">{format(new Date(entry.created_at), 'dd')}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs text-neon-blue font-bold tracking-widest uppercase">Lot #{entry.lot_code}</span>
                                            <span className={`w-2 h-2 rounded-full ${entry.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                                            {entry.item_type}
                                            {entry.grade && <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-300 font-normal border border-white/5">{entry.grade}</span>}
                                        </h3>
                                        <div className="text-sm text-gray-400 font-medium">
                                            {entry.initial_qty} {entry.unit_type}
                                        </div>
                                    </div>
                                </div>

                                {/* Middle: Truck & Driver */}
                                <div className="hidden md:flex flex-col flex-1 px-8 border-l border-white/5">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Truck className="w-4 h-4 text-neon-purple" />
                                        <span className="text-sm font-bold text-gray-300">{entry.truck_number || 'No Vehicle'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[8px] text-white">D</span>
                                        <span className="text-xs text-gray-500">{entry.driver_name || 'Unknown Driver'}</span>
                                    </div>
                                </div>

                                {/* Right: Status & Action */}
                                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                    <div className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${entry.status === 'active' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                        entry.status === 'sold' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'
                                        }`}>
                                        <span className="text-xs font-bold uppercase">{entry.status}</span>
                                    </div>

                                    <button className="p-3 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-neon-blue hover:border-neon-blue/50 transition-all border border-transparent">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="glass-panel p-16 rounded-2xl flex flex-col items-center justify-center text-center opacity-60">
                        <Package className="w-16 h-16 text-gray-600 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">No active arrivals</h3>
                        <p className="text-gray-400">Your gate logs will appear here live.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
