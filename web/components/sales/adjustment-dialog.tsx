"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, Scale } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/auth/auth-provider";

export function AdjustmentDialog({ saleItem, onRefresh }: { saleItem: any, onRefresh: () => void }) {
    const { profile } = useAuth();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [newRate, setNewRate] = useState(saleItem.rate);
    const [newQty, setNewQty] = useState(saleItem.qty);
    const [reason, setReason] = useState("");

    const handleAdjust = async () => {
        if (!reason) return alert("Please provide a reason for adjustment.");
        if (newRate == saleItem.rate && newQty == saleItem.qty) return alert("Rate or Quantity must be different.");
        if (!profile?.organization_id) return alert("Organization ID missing. Please reload.");

        setLoading(true);
        try {
            // Safe Parse
            const qty = parseFloat(newQty || "0");
            const rate = parseFloat(newRate || "0");

            if (isNaN(qty) || isNaN(rate)) throw new Error("Invalid Quantity or Rate");

            // New Comprehensive RPC
            const { data, error } = await supabase
                .schema('mandi')
                .rpc('create_comprehensive_sale_adjustment', {
                    p_organization_id: profile.organization_id,
                    p_sale_item_id: saleItem.id,
                    p_new_qty: qty,
                    p_new_rate: rate,
                    p_reason: reason
                });

            if (error) throw error;

            setOpen(false);
            onRefresh();
        } catch (e: any) {
            console.error("Adjustment Error:", e);
            alert("Error posting adjustment: " + (e.message || e.details || JSON.stringify(e)));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 rounded-full">
                    <Scale className="w-3 h-3" />
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-orange-400 uppercase tracking-widest text-sm font-bold">
                        <AlertTriangle className="w-4 h-4" /> Post Adjustment
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                        <div className="flex justify-between text-xs text-gray-400 uppercase font-bold">
                            <span>Item</span>
                            <span>Current</span>
                        </div>
                        <div className="flex justify-between text-sm font-mono text-white">
                            <span>{saleItem.lot?.item?.name || saleItem.lot?.lot_code || 'Item'}</span>
                            <span>{saleItem.qty} x ₹{saleItem.rate}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase text-gray-500 font-bold">New Qty</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={newQty}
                                onChange={(e) => setNewQty(e.target.value)}
                                className="bg-black border-white/10 text-white font-mono text-neon-blue"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase text-gray-500 font-bold">New Rate</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={newRate}
                                onChange={(e) => setNewRate(e.target.value)}
                                className="bg-black border-white/10 text-white font-mono text-neon-green"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase text-gray-500 font-bold">Reason (Audit Log)</Label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Return, Damaged, Rate negotiated"
                            className="bg-black border-white/10 text-white"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">Cancel</Button>
                    <Button onClick={handleAdjust} disabled={loading} className="bg-orange-500 text-white font-bold hover:bg-orange-600">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
