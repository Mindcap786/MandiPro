"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { Loader2, ArrowRightLeft, Warehouse, Snowflake } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface TransferDialogProps {
    isOpen: boolean
    onClose: () => void
    lot: any
    onSuccess: () => void
}

export function TransferDialog({ isOpen, onClose, lot, onSuccess }: TransferDialogProps) {
    const { profile } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [qty, setQty] = useState(0) // Initialize correctly below
    const [targetLocation, setTargetLocation] = useState("")
    const [availableLocations, setAvailableLocations] = useState<string[]>([])

    useEffect(() => {
        if (lot) setQty(lot.current_qty || 0)
    }, [lot])

    useEffect(() => {
        if (isOpen && profile) {
            fetchLocations()
        }
    }, [isOpen, profile])

    const fetchLocations = async () => {
        try {
            const { data, error } = await supabase
                .schema('mandi')
                .from('storage_locations')
                .select('name')
                .eq('organization_id', profile?.organization_id)
                .eq('is_active', true)


            if (error) throw error

            // Map the rows to extract the names and filter out the lot's current location
            const locations = (data || []).map(row => row.name).filter((loc: string) => loc !== lot?.storage_location)
            setAvailableLocations(locations)
            if (locations.length > 0) {
                setTargetLocation(locations[0])
            }
        } catch (err) {
            console.error("Failed to fetch locations:", err)
        }
    }

    const handleTransfer = async () => {
        if (!lot || !profile || !targetLocation) return
        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('transfer_stock_v3', {
                p_organization_id: profile?.organization_id,
                p_lot_id: lot.id || lot.lot_id,
                p_qty: Number(qty),
                p_from_location: lot.storage_location,
                p_to_location: targetLocation
            })

            if (error) throw error

            const isSplitted = Number(qty) < Number(lot.current_qty)

            toast({
                title: "Stock Moved Successfully",
                description: isSplitted
                    ? `Transferred ${qty} ${lot.unit} to ${targetLocation}. (Partial transfer: Lot splitted)`
                    : `Full lot moved to ${targetLocation}.`,
                variant: "default"
            })
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error("Transfer Error:", err)
            alert(`Failed to transfer stock. Error: ${err?.message || JSON.stringify(err)}`)
        } finally {
            setLoading(false)
        }
    }

    if (!lot) return null

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-white border-slate-200 text-black shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase italic tracking-tighter text-black">
                        <ArrowRightLeft className="w-6 h-6 text-blue-600" />
                        Stock Transfer
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm">
                        <div className="flex flex-col items-center gap-2 flex-1">
                            {lot.storage_location === 'Mandi' ? <Warehouse className="w-8 h-8 text-blue-500" /> : <Snowflake className="w-8 h-8 text-purple-500" />}
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">{lot.storage_location}</span>
                        </div>
                        <ArrowRightLeft className="w-4 h-4 text-slate-400 animate-pulse flex-shrink-0 mx-2" />
                        <div className="flex flex-col items-center gap-2 flex-1 w-full max-w-[140px]">
                            {targetLocation === 'Cold Storage' ? <Snowflake className="w-8 h-8 text-purple-500" /> : <Warehouse className="w-8 h-8 text-blue-500" />}
                            <Select value={targetLocation} onValueChange={setTargetLocation}>
                                <SelectTrigger className="mt-1 h-8 text-[10px] font-black uppercase tracking-widest bg-white border-slate-200">
                                    <SelectValue placeholder="Select Dest" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableLocations.map(loc => (
                                        <SelectItem key={loc} value={loc} className="text-xs font-bold uppercase">{loc}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Quantity to Move ({lot.unit})</Label>
                        <Input
                            type="number"
                            value={qty}
                            onChange={(e) => setQty(Number(e.target.value))}
                            max={lot.current_qty}
                            min={1}
                            className="h-14 bg-white border-slate-200 rounded-2xl text-2xl font-black text-black focus:ring-blue-500/10 focus:border-blue-500 shadow-sm"
                        />
                        <p className="text-[9px] text-slate-500 font-bold ml-1 uppercase">Max Available: {lot.current_qty} {lot.unit}</p>
                    </div>

                    <Button
                        onClick={handleTransfer}
                        disabled={loading || qty <= 0 || qty > lot.current_qty || !targetLocation}
                        className={`w-full h-14 rounded-2xl font-black text-lg transition-all text-white shadow-lg ${targetLocation === 'Cold Storage'
                            ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200'
                            : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                            }`}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : `TRANSFER TO ${targetLocation.toUpperCase()}`}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
