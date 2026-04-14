"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Percent, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface PurchaseAdjustmentDialogProps {
    isOpen: boolean
    onClose: () => void
    lot: any
    onSuccess: () => void
}

export function PurchaseAdjustmentDialog({ isOpen, onClose, lot, onSuccess }: PurchaseAdjustmentDialogProps) {
    const { profile } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [newRate, setNewRate] = useState(lot?.supplier_rate?.toString() || "")
    const [reason, setReason] = useState("")

    if (!lot) return null
    if (lot.arrival_type !== 'direct') return null // Rates are only adjusted for direct purchases

    const diffRate = (Number(lot.supplier_rate) || 0) - (Number(newRate) || 0)
    const totalDiff = diffRate * (lot.initial_qty || lot.current_qty)
    const isDiscount = totalDiff > 0

    const handleSubmit = async () => {
        if (!newRate || Number(newRate) < 0) {
            toast({
                title: "Invalid Rate",
                description: "Please enter a valid adjusted rate.",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.schema('mandi').rpc('process_purchase_adjustment', {
                p_organization_id: profile?.organization_id,
                p_lot_id: lot.id || lot.lot_id,
                p_new_rate: Number(newRate),
                p_reason: reason,
                p_adjustment_date: new Date().toISOString().split('T')[0]
            })

            if (error) throw error

            toast({
                title: "Rate Adjusted",
                description: `Supplier rate updated from ₹${lot.supplier_rate} to ₹${newRate}.`
            })
            onSuccess()
            onClose()
        } catch (err: any) {
            console.error(err)
            toast({
                title: "Error",
                description: err.message,
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-white border-slate-200 text-black sm:max-w-md shadow-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-black">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                            <Percent className="w-5 h-5" />
                        </div>
                        Adjust Purchase Rate
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Lot Info Banner */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center shadow-sm">
                        <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">LOT CODE (DIRECT)</div>
                            <div className="font-mono text-xs text-black font-bold uppercase">{lot.lot_code}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">INITIAL LOAD</div>
                            <div className="text-lg font-black text-black leading-none">
                                {lot.initial_qty || lot.current_qty} <span className="text-[10px] text-slate-500 font-bold uppercase">{lot.unit}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Rate (₹)</Label>
                                <div className="h-11 px-3 flex items-center bg-slate-50 border border-slate-200 text-lg font-black font-mono text-slate-400 rounded-lg shadow-inner">
                                    ₹{lot.supplier_rate}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between items-center">
                                    New Rate (₹)
                                    <span className="text-blue-600 text-[9px] animate-pulse">EDITING</span>
                                </Label>
                                <Input
                                    type="number"
                                    value={newRate}
                                    onChange={(e) => setNewRate(e.target.value)}
                                    className="bg-white border-slate-200 text-lg font-black font-mono text-blue-600 focus:border-blue-500 rounded-lg shadow-sm"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {newRate && Number(newRate) !== Number(lot.supplier_rate) && (
                            <div className={cn(
                                "p-4 rounded-xl border flex justify-between items-center transition-all animate-in zoom-in-95 duration-200",
                                isDiscount ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
                            )}>
                                <div>
                                    <h4 className={cn("text-xs font-black uppercase tracking-widest", isDiscount ? "text-emerald-700" : "text-rose-700")}>
                                        {isDiscount ? 'Total Discount' : 'Total Extra Cost'}
                                    </h4>
                                    <p className={cn("text-[10px] font-bold opacity-60", isDiscount ? "text-emerald-600" : "text-rose-600")}>
                                        Applied to all {lot.initial_qty || lot.current_qty} {lot.unit}s
                                    </p>
                                </div>
                                <div className={cn("text-2xl font-[1000] font-mono tracking-tighter", isDiscount ? "text-emerald-600" : "text-rose-600")}>
                                    ₹{Math.abs(totalDiff).toFixed(2)}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason / Justification</Label>
                            <Textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="bg-white border-slate-200 text-black resize-none shadow-sm placeholder:text-slate-300"
                                placeholder="E.g., Adjusted cut due to moisture / quality issues"
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest border border-blue-200">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-blue-600" />
                        <p>This adjustment will immediately recalculate cost in P&L and supplier ledger.</p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} className="hover:bg-slate-50 text-slate-500 hover:text-black font-bold uppercase tracking-widest text-[10px]">Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !newRate || Number(newRate) === Number(lot.supplier_rate)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-tight shadow-lg shadow-blue-200"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Percent className="w-4 h-4 mr-2" />}
                        Apply Adjustment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
