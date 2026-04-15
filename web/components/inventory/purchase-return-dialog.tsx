"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, ArrowLeftRight, AlertTriangle } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"

interface PurchaseReturnDialogProps {
    isOpen: boolean
    onClose: () => void
    lot: any
    onSuccess: () => void
}

export function PurchaseReturnDialog({ isOpen, onClose, lot, onSuccess }: PurchaseReturnDialogProps) {
    const { profile } = useAuth()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [quantity, setQuantity] = useState("")
    const [rate, setRate] = useState(lot?.supplier_rate?.toString() || "")
    const [remarks, setRemarks] = useState("")

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
                description: "Cannot return more than current stock.",
                variant: "destructive"
            })
            return
        }
        if (!rate || Number(rate) < 0) {
            toast({
                title: "Invalid Rate",
                description: "Please enter a valid return rate.",
                variant: "destructive"
            })
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.schema('mandi').rpc('process_purchase_return', {
                p_organization_id: profile?.organization_id,
                p_lot_id: lot.id || lot.lot_id,
                p_qty: Number(quantity),
                p_rate: Number(rate),
                p_remarks: remarks,
                p_return_date: new Date().toISOString().split('T')[0]
            })

            if (error) throw error

            toast({
                title: "Purchase Return Processed",
                description: `${quantity} ${lot.unit || 'Units'} returned successfully.`
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
                        <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-100">
                            <ArrowLeftRight className="w-5 h-5" />
                        </div>
                        Return to Supplier
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Lot Info Banner */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center shadow-sm">
                        <div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">LOT CODE</div>
                            <div className="font-mono text-xs text-black font-bold uppercase">{lot.lot_code}</div>
                            <div className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest leading-none">
                                Orig. Rate: ₹{lot.supplier_rate} / {lot.unit}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">AVAILABLE</div>
                            <div className="text-lg font-black text-black leading-none">
                                {lot.current_qty} <span className="text-[10px] text-slate-500 font-bold uppercase">{lot.unit}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Return Qty ({lot.unit})</Label>
                                <Input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="bg-white border-slate-200 text-lg font-black font-mono text-black focus:border-orange-500 rounded-lg shadow-sm"
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Return Rate (₹)</Label>
                                <Input
                                    type="number"
                                    value={rate}
                                    onChange={(e) => setRate(e.target.value)}
                                    className="bg-white border-slate-200 text-lg font-black font-mono text-black focus:border-orange-500 rounded-lg shadow-sm"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {Number(quantity) > 0 && Number(rate) > 0 && (
                            <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                                <div>
                                    <h4 className="text-xs font-black uppercase tracking-widest text-orange-700">Financial Credit</h4>
                                    <p className="text-[10px] font-bold text-orange-600 opacity-70">To be adjusted in Supplier Ledger</p>
                                </div>
                                <div className="text-2xl font-[1000] font-mono tracking-tighter text-orange-600">
                                    ₹{((Number(quantity) || 0) * (Number(rate) || 0)).toLocaleString()}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason / Remarks</Label>
                            <Textarea
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className="bg-white border-slate-200 text-black resize-none shadow-sm placeholder:text-slate-300"
                                placeholder="E.g., Rejected due to poor quality"
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-widest border border-slate-100">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-orange-500" />
                        <p>This will reduce stock and debit the {lot.arrival_type === 'commission' ? "farmer's" : "supplier's"} payable balance.</p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} className="hover:bg-slate-50 text-slate-500 hover:text-black font-bold uppercase tracking-widest text-[10px]">Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || !quantity || Number(quantity) <= 0}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-black uppercase tracking-tight shadow-lg shadow-orange-200"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowLeftRight className="w-4 h-4 mr-2" />}
                        Process Return
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
