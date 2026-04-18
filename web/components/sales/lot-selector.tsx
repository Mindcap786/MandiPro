"use client"

import { useState, useEffect } from "react"
import { Check, Search, Package, User, Clock, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface LotSelectorProps {
    onSelect: (lot: any) => void
    selectedLotId?: string
    commodityId?: string
}

export function LotSelector({ onSelect, selectedLotId, commodityId }: LotSelectorProps) {
    const { profile } = useAuth()
    const [lots, setLots] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedLotDisplay, setSelectedLotDisplay] = useState<any>(null)

    const fetchLots = async () => {
        if (!profile?.organization_id) return
        setLoading(true)

        let query = supabase
            .schema('mandi')
            .from("lots")
            .select(`
                *,
                contacts (name),
                commodities (name)
            `)
            .eq("organization_id", profile.organization_id)
            .in("status", ["active", "available"])
            .gt("current_qty", 0)

        if (commodityId) {
            query = query.eq("item_id", commodityId)
        }

        query = query.limit(200) // Fetch a larger batch for instant client-side searching

        const { data, error } = await query

        if (error) console.error(error)
        else setLots(data || [])
        setLoading(false)
    }

    // Effect to handle external ID changes (both initial fetch and clearing)
    useEffect(() => {
        const syncSelectedLot = async () => {
            if (!selectedLotId) {
                setSelectedLotDisplay(null)
                return
            }
            if (selectedLotId && (!selectedLotDisplay || selectedLotDisplay.id !== selectedLotId) && profile?.organization_id) {
                const { data } = await supabase
                    .schema('mandi')
                    .from("lots")
                    .select(`*, commodities(name)`)
                    .eq("id", selectedLotId)
                    .single()
                if (data) setSelectedLotDisplay(data)
            }
        }
        syncSelectedLot()
    }, [selectedLotId, profile])

    useEffect(() => {
        if (open) fetchLots()
    }, [open, searchTerm, commodityId])

    // Update display if we just selected something from the list
    const handleSelect = (lot: any) => {
        setSelectedLotDisplay(lot)
        onSelect(lot)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-left h-12 bg-slate-50 border-slate-200 text-black hover:bg-slate-100 font-bold rounded-xl shadow-sm"
                >
                    {selectedLotDisplay ? (
                        <div className="flex items-center gap-2 overflow-hidden w-full">
                            <span className="text-purple-600 font-black whitespace-nowrap uppercase">{selectedLotDisplay.lot_code}</span>
                            <Badge variant="secondary" className={`text-[10px] font-black uppercase px-2 py-0.5 whitespace-nowrap ${selectedLotDisplay.storage_location === 'Cold Storage'
                                    ? 'bg-purple-50 text-purple-600 border border-purple-100'
                                    : 'bg-blue-50 text-blue-600 border border-blue-100'
                                }`}>
                                {selectedLotDisplay.storage_location}
                            </Badge>
                            <span className="text-slate-400 font-medium truncate ml-auto">{selectedLotDisplay.commodities?.name || 'Unknown Item'}</span>
                        </div>
                    ) : (
                        <span className="text-slate-400 font-medium">Pick Stock Lot...</span>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-white border-slate-200 text-black p-0 overflow-hidden shadow-2xl rounded-3xl">
                <DialogHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <DialogTitle className="text-2xl font-[1000] tracking-tighter text-black uppercase">SELECT <span className="text-purple-600">INVENTORY</span></DialogTitle>
                </DialogHeader>

                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search Lot, Farmer or Fruit..."
                            className="pl-10 bg-slate-50 border-slate-200 h-12 rounded-xl focus:border-purple-500 text-black font-bold transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {loading ? (
                        <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                            Scanning Storage...
                        </div>
                    ) : (lots.filter(lot => {
                        if (!searchTerm) return true;
                        const s = searchTerm.toLowerCase();
                        return (
                            (lot.lot_code || "").toLowerCase().includes(s) ||
                            (lot.contacts?.name || "").toLowerCase().includes(s) ||
                            (lot.commodities?.name || "").toLowerCase().includes(s)
                        );
                    }).length === 0) ? (
                        <div className="p-10 text-center text-slate-400 font-medium italic">No matches found.</div>
                    ) : (
                        lots.filter(lot => {
                            if (!searchTerm) return true;
                            const s = searchTerm.toLowerCase();
                            return (
                                (lot.lot_code || "").toLowerCase().includes(s) ||
                                (lot.contacts?.name || "").toLowerCase().includes(s) ||
                                (lot.commodities?.name || "").toLowerCase().includes(s)
                            );
                        }).map(lot => (
                            <button
                                key={lot.id}
                                onClick={() => handleSelect(lot)}
                                className="w-full text-left p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group flex items-center justify-between"
                            >
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-black tracking-tight text-black group-hover:text-purple-600 transition-colors uppercase">{lot.lot_code}</span>
                                        <Badge variant="secondary" className={`text-[10px] font-bold uppercase py-0.5 border ${lot.storage_location === 'Cold Storage'
                                                ? 'bg-purple-50 text-purple-600 border-purple-100'
                                                : 'bg-blue-50 text-blue-600 border-blue-100'
                                            }`}>
                                            {lot.storage_location}
                                        </Badge>
                                        <Badge variant="secondary" className="bg-slate-100 border-slate-200 text-[10px] text-slate-500 font-bold uppercase py-0.5">
                                            {lot.arrival_type}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
                                        <div className="flex items-center gap-1.5">
                                            <Package className="w-3.5 h-3.5" />
                                            {lot.commodities?.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                                            <User className="w-3.5 h-3.5" />
                                            {lot.contacts?.name}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-[1000] text-black">{lot.current_qty}</div>
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lot.unit} LEFT</div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
