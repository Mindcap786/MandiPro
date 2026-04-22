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
            const { error } = await supabase.rpc('record_lot_damage_v2', {
                p_organization_id: profile?.organization_id,
                p_lot_id: lot.id || lot.lot_id,
                p_qty: Number(quantity),
                p_reason: reason,
                p_damage_date: new Date().toISOString().split('T')[0]
            })

            if (error) throw error

            toast({
                title: "Loss Reported Successfully",
                description: `Recorded ${quantity} ${lot.unit} as wastage. Financials updated.`,
                variant: "destructive"
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
            <DialogContent className="bg-white border-slate-200 text-black sm:max-w-md shadow-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-black">
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center border",
                            lot.arrival_type === 'direct' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-orange-50 text-orange-600 border-orange-100"
                        )}>
                            <Trash2 className="w-5 h-5" />
                        </div>
                        {lot.arrival_type === 'direct' ? 'Report Stock Loss' : 'Report Loss to Supplier/Farmer'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
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

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quantity to Remove ({lot.unit})</Label>
                            <Input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="bg-white border-slate-200 text-lg font-black font-mono text-black focus:border-red-500 rounded-lg shadow-sm"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason</Label>
                            <Select value={reason} onValueChange={setReason}>
                                <SelectTrigger className="bg-white border-slate-200 text-black font-bold shadow-sm">
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

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes (Optional)</Label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="bg-white border-slate-200 text-black resize-none shadow-sm"
                                placeholder="Add additional details..."
                                rows={3}
                            />
                        </div>
                    </div>

                    <div className={cn(
                        "flex items-center gap-3 p-3 rounded-lg text-xs font-medium border",
                        lot.arrival_type === 'direct' ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                        {lot.arrival_type === 'direct' ? (
                            <>
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                                <p>This action will permanently reduce stock and record a loss in the P&L statement.</p>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-blue-600" />
                                <p>This action will reduce stock. Since this is a commission lot, the loss is borne by the supplier and will <strong>not</strong> impact your P&L.</p>
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} className="hover:bg-slate-50 text-slate-500 hover:text-black">Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={loading || !quantity}
                            className={cn(
                                "font-black shadow-lg",
                                lot.arrival_type === 'direct' ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200" : "bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200"
                            )}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            {lot.arrival_type === 'direct' ? 'Confirm Wastage' : 'Confirm Loss to Supplier'}
                        </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
