"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Trash2, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEffect } from "react"

interface WastageDialogProps {
    isOpen: boolean
    onClose: () => void
    lot: any
    onSuccess: () => void
}

export function WastageDialog({ isOpen, onClose, lot, onSuccess }: WastageDialogProps) {
    const { profile } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [quantity, setQuantity] = useState("")
    const [reason, setReason] = useState("Spoilage")
    const [notes, setNotes] = useState("")
    const [lossBorneBy, setLossBorneBy] = useState<'mandi' | 'supplier'>(
        lot?.arrival_type === 'direct' ? 'mandi' : 'supplier'
    )

    useEffect(() => {
        if (lot) {
            setLossBorneBy(lot.arrival_type === 'direct' ? 'mandi' : 'supplier')
        }
    }, [lot])

    if (!lot) return null

    const handleSubmit = async () => {
        if (!quantity || Number(quantity) <= 0) {
            toast({
                title: "Invalid Quantity",
                description: "Please enter a valid quantity.",
                variant: "destructive"
            })
            return
        }
        if (Number(quantity) > Number(lot.current_qty)) {
            toast({
                title: "Stock Limit Exceeded",
                description: "Cannot report more wastage than current stock.",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.rpc('record_lot_damage_v3', {
                p_organization_id: profile?.organization_id,
                p_lot_id: lot.id || lot.lot_id,
                p_qty: Number(quantity),
                p_reason: reason,
                p_damage_date: new Date().toISOString().split('T')[0],
                p_loss_borne_by: lossBorneBy
            })

            if (error) throw error

            toast({
                title: "Loss Reported Successfully",
                description: `Recorded ${quantity} ${lot.unit} as loss to ${lossBorneBy}.`,
                variant: lossBorneBy === 'mandi' ? "destructive" : "default"
            })
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error Recording Loss",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    const estimatedLossValue = Number(quantity) * (Number(lot.supplier_rate) || 0)
    const showFinancialImpact = lot.arrival_type === 'direct' && Number(quantity) > 0

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-white border-slate-200 text-black sm:max-w-md shadow-xl p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-black">
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center border",
                            lossBorneBy === 'mandi' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-blue-50 text-blue-600 border-blue-100"
                        )}>
                            <Trash2 className="w-5 h-5" />
                        </div>
                        Report Loss
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 py-4 space-y-6">
                    {/* Lot Info Banner */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center shadow-sm">
                        <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">LOT CODE</div>
                            <div className="font-mono text-xs text-black font-bold uppercase">{lot.lot_code}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">STOCK AVAILABLE</div>
                            <div className="text-lg font-black text-black leading-none">
                                {lot.current_qty} <span className="text-[10px] text-slate-500 font-bold uppercase">{lot.unit}</span>
                            </div>
                        </div>
                    </div>

                    {/* Loss Attribution Selector */}
                    <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Who bears the loss?</Label>
                        <Tabs value={lossBorneBy} onValueChange={(v: any) => setLossBorneBy(v)} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 h-11 bg-slate-100 p-1 rounded-xl">
                                <TabsTrigger 
                                    value="supplier" 
                                    className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm"
                                >
                                    Supplier/Farmer
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="mandi"
                                    className="rounded-lg text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-rose-600 data-[state=active]:shadow-sm"
                                >
                                    Mandi (P&L)
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <div className={cn(
                            "p-3 rounded-lg text-[10px] font-bold border leading-relaxed",
                            lossBorneBy === 'mandi' ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-blue-50 text-blue-700 border-blue-100"
                        )}>
                            {lossBorneBy === 'mandi' ? (
                                "Mandi bears the financial cost. This will reduce Mandi's profit in the P&L statement."
                            ) : (
                                "Supplier bears the loss. Stock is removed but Mandi financials remain unaffected."
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qty to Remove</Label>
                            <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="bg-white border-slate-200 text-lg font-black font-mono text-black focus:border-blue-500 rounded-lg shadow-sm"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason</Label>
                            <Select value={reason} onValueChange={setReason}>
                                <SelectTrigger className="bg-white border-slate-200 text-black font-bold shadow-sm h-11">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200 text-black shadow-xl">
                                    <SelectItem value="Spoilage">Spoilage / Rot</SelectItem>
                                    <SelectItem value="Damage">Damaged in Handling</SelectItem>
                                    <SelectItem value="Theft">Theft / Missing</SelectItem>
                                    <SelectItem value="Dryage">Moisture Loss (Dryage)</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-slate-50 p-6 flex flex-row items-center justify-between gap-4">
                    <Button variant="ghost" onClick={onClose} className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !quantity}
                        className={cn(
                            "font-black shadow-lg px-8 h-11",
                            lossBorneBy === 'mandi' ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                        )}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Confirm Loss
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
